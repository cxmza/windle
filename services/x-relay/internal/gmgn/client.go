package gmgn

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"net/url"
	"time"

	"github.com/coder/websocket"
)

const (
	DefaultStreamURL    = "wss://ws.gmgn.ai/v2/ws"
	DefaultOrigin       = "https://gmgn.ai"
	DefaultUserAgent    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
	defaultChain        = "sol"
	defaultReadLimit    = 256 << 10
	defaultDialTimeout  = 15 * time.Second
	defaultIdleTimeout  = 90 * time.Second
	defaultPingInterval = 20 * time.Second
	defaultPingTimeout  = 10 * time.Second
	defaultBackoffMin   = time.Second
	defaultBackoffMax   = time.Minute
	defaultStableAfter  = time.Minute
	backoffJitter       = 0.2
)

var DefaultChannels = []string{ChannelBasic, ChannelToken}

var errPingFailed = errors.New("websocket ping failed")

type Options struct {
	StreamURL    string
	Origin       string
	UserAgent    string
	Proxy        string
	Chain        string
	Channels     []string
	ReadLimit    int64
	DialTimeout  time.Duration
	IdleTimeout  time.Duration
	PingInterval time.Duration
	PingTimeout  time.Duration
	BackoffMin   time.Duration
	BackoffMax   time.Duration
	StableAfter  time.Duration
}

type EventKind uint8

const (
	EventFrame EventKind = iota
	EventConnected
	EventDisconnected
)

type Event struct {
	Kind       EventKind
	Frame      Frame
	ReceivedAt time.Time
	Err        error
	Attempt    int
}

type Client struct {
	opts      Options
	dial      *websocket.DialOptions
	subscribe [][]byte
}

func New(opts Options) (*Client, error) {
	opts = opts.withDefaults()

	stream, err := url.Parse(opts.StreamURL)
	if err != nil || (stream.Scheme != "ws" && stream.Scheme != "wss") || stream.Host == "" {
		return nil, fmt.Errorf("gmgn: stream url %q must be ws:// or wss:// with a host", opts.StreamURL)
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
			MaxVersion: tls.VersionTLS12,
		},
		TLSHandshakeTimeout: opts.DialTimeout,
	}
	if opts.Proxy != "" {
		proxy, err := url.Parse(opts.Proxy)
		if err != nil || proxy.Host == "" {
			return nil, errors.New("gmgn: proxy url is invalid")
		}
		transport.Proxy = http.ProxyURL(proxy)
	}

	header := http.Header{}
	header.Set("Origin", opts.Origin)
	header.Set("User-Agent", opts.UserAgent)
	header.Set("Accept-Language", "en-US,en;q=0.9")
	header.Set("Cache-Control", "no-cache")
	header.Set("Pragma", "no-cache")

	subscribe := make([][]byte, 0, len(opts.Channels))
	for _, channel := range opts.Channels {
		message, err := json.Marshal(map[string]any{
			"action":  "subscribe",
			"channel": channel,
			"data":    []map[string]string{{"chain": opts.Chain}},
		})
		if err != nil {
			return nil, fmt.Errorf("gmgn: encode subscribe %s: %w", channel, err)
		}
		subscribe = append(subscribe, message)
	}

	return &Client{
		opts:      opts,
		dial:      &websocket.DialOptions{HTTPClient: &http.Client{Transport: transport}, HTTPHeader: header},
		subscribe: subscribe,
	}, nil
}

func (o Options) withDefaults() Options {
	if o.StreamURL == "" {
		o.StreamURL = DefaultStreamURL
	}
	if o.Origin == "" {
		o.Origin = DefaultOrigin
	}
	if o.UserAgent == "" {
		o.UserAgent = DefaultUserAgent
	}
	if o.Chain == "" {
		o.Chain = defaultChain
	}
	if len(o.Channels) == 0 {
		o.Channels = DefaultChannels
	}
	if o.ReadLimit <= 0 {
		o.ReadLimit = defaultReadLimit
	}
	defaults := []struct {
		value    *time.Duration
		fallback time.Duration
	}{
		{&o.DialTimeout, defaultDialTimeout},
		{&o.IdleTimeout, defaultIdleTimeout},
		{&o.PingTimeout, defaultPingTimeout},
		{&o.BackoffMin, defaultBackoffMin},
		{&o.BackoffMax, defaultBackoffMax},
		{&o.StableAfter, defaultStableAfter},
	}
	for _, d := range defaults {
		if *d.value <= 0 {
			*d.value = d.fallback
		}
	}
	if o.PingInterval == 0 {
		o.PingInterval = defaultPingInterval
	}
	if o.PingInterval < 0 {
		o.PingInterval = 0
	}
	if o.BackoffMax < o.BackoffMin {
		o.BackoffMax = o.BackoffMin
	}
	return o
}

// Run keeps one session alive until ctx ends, reconnecting with backoff. Every event goes to out.
func (c *Client) Run(ctx context.Context, out chan<- Event) error {
	attempt := 0
	for {
		started := time.Now()
		err := c.session(ctx, out, attempt)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if time.Since(started) >= c.opts.StableAfter {
			attempt = 0
		}
		if !deliver(ctx, out, Event{Kind: EventDisconnected, ReceivedAt: time.Now(), Err: err, Attempt: attempt}) {
			return ctx.Err()
		}
		delay := backoff(c.opts.BackoffMin, c.opts.BackoffMax, attempt)
		attempt++

		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func (c *Client) session(parent context.Context, out chan<- Event, attempt int) error {
	ctx, cancel := context.WithCancelCause(parent)
	defer cancel(nil)

	dialCtx, dialCancel := context.WithTimeout(ctx, c.opts.DialTimeout)
	conn, resp, err := websocket.Dial(dialCtx, c.opts.StreamURL, c.dial)
	dialCancel()
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.CloseNow()
	conn.SetReadLimit(c.opts.ReadLimit)

	for _, message := range c.subscribe {
		writeCtx, writeCancel := context.WithTimeout(ctx, c.opts.DialTimeout)
		err := conn.Write(writeCtx, websocket.MessageText, message)
		writeCancel()
		if err != nil {
			return fmt.Errorf("subscribe: %w", err)
		}
	}
	if !deliver(ctx, out, Event{Kind: EventConnected, ReceivedAt: time.Now(), Attempt: attempt}) {
		return ctx.Err()
	}

	if c.opts.PingInterval > 0 {
		go c.keepAlive(ctx, cancel, conn)
	}

	for {
		readCtx, readCancel := context.WithTimeout(ctx, c.opts.IdleTimeout)
		kind, data, err := conn.Read(readCtx)
		readCancel()
		if err != nil {
			if cause := context.Cause(ctx); cause != nil && !errors.Is(cause, context.Canceled) {
				return cause
			}
			return fmt.Errorf("read: %w", err)
		}
		if kind != websocket.MessageText {
			continue
		}
		frame := ParseFrame(data)
		if len(frame.Items) == 0 && frame.Malformed == 0 {
			continue
		}
		if !deliver(ctx, out, Event{Kind: EventFrame, Frame: frame, ReceivedAt: time.Now()}) {
			return ctx.Err()
		}
	}
}

func (c *Client) keepAlive(ctx context.Context, cancel context.CancelCauseFunc, conn *websocket.Conn) {
	ticker := time.NewTicker(c.opts.PingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		pingCtx, pingCancel := context.WithTimeout(ctx, c.opts.PingTimeout)
		err := conn.Ping(pingCtx)
		pingCancel()
		if err != nil && ctx.Err() == nil {
			cancel(fmt.Errorf("%w: %w", errPingFailed, err))
			return
		}
	}
}

func deliver(ctx context.Context, out chan<- Event, event Event) bool {
	select {
	case out <- event:
		return true
	case <-ctx.Done():
		return false
	}
}

func backoff(low, high time.Duration, attempt int) time.Duration {
	delay := low
	for i := 0; i < attempt && delay < high; i++ {
		delay *= 2
	}
	if delay > high {
		delay = high
	}
	spread := float64(delay) * backoffJitter
	return delay + time.Duration((rand.Float64()*2-1)*spread)
}
