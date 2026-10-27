// x-relay reads gmgn's public X monitor websocket, keeps the newest KOL/founder posts in memory and serves them
// on a loopback HTTP API (GET /recent, GET /stream SSE, GET /post/{id}, GET /health) for apps/api.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"windle.fun/x-relay/internal/feed"
	"windle.fun/x-relay/internal/gmgn"
	"windle.fun/x-relay/internal/server"
)

type config struct {
	addr      string
	tags      []string
	channels  []string
	capacity  int
	streamURL string
	userAgent string
	proxy     string
	logLevel  slog.Level
	hold      time.Duration
	lookup    int
	gate      feed.GateOptions
}

func loadConfig() (config, error) {
	c := config{
		addr:      env("X_RELAY_ADDR", "127.0.0.1:3010"),
		tags:      csv(env("X_RELAY_TAGS", "kol,founder")),
		channels:  csv(env("X_RELAY_CHANNELS", gmgn.ChannelBasic+","+gmgn.ChannelToken)),
		streamURL: env("X_RELAY_STREAM_URL", gmgn.DefaultStreamURL),
		userAgent: env("X_RELAY_USER_AGENT", gmgn.DefaultUserAgent),
		proxy:     os.Getenv("X_RELAY_PROXY"),
	}
	capacity, err := strconv.Atoi(env("X_RELAY_CAPACITY", strconv.Itoa(feed.DefaultCapacity)))
	if err != nil || capacity < 1 || capacity > 100_000 {
		return c, errors.New("X_RELAY_CAPACITY must be an integer in 1..100000")
	}
	c.capacity = capacity
	holdMs, err := strconv.Atoi(env("X_RELAY_HOLD_MS", strconv.Itoa(int(feed.DefaultHold/time.Millisecond))))
	if err != nil || holdMs < 0 || holdMs > 5000 {
		return c, errors.New("X_RELAY_HOLD_MS must be an integer in 0..5000")
	}
	c.hold = time.Duration(holdMs) * time.Millisecond
	if c.lookup, err = strconv.Atoi(env("X_RELAY_LOOKUP_SIZE", strconv.Itoa(feed.DefaultLookupSize))); err != nil ||
		c.lookup < 1 || c.lookup > 100_000 {
		return c, errors.New("X_RELAY_LOOKUP_SIZE must be an integer in 1..100000")
	}
	c.gate.Mode = env("X_RELAY_MODE", feed.ModeSignal)
	if c.gate.Mode != feed.ModeCrypto && c.gate.Mode != feed.ModeSignal && c.gate.Mode != feed.ModeAll {
		return c, errors.New("X_RELAY_MODE must be crypto, signal or all")
	}
	c.gate.Deny = csv(os.Getenv("X_RELAY_DENY"))
	if c.gate.MinText, err = strconv.Atoi(env("X_RELAY_MIN_TEXT", strconv.Itoa(feed.DefaultMinText))); err != nil ||
		c.gate.MinText < 1 || c.gate.MinText > 1000 {
		return c, errors.New("X_RELAY_MIN_TEXT must be an integer in 1..1000")
	}
	if c.gate.AuthorMax, err = strconv.Atoi(env("X_RELAY_AUTHOR_MAX", strconv.Itoa(feed.DefaultAuthorMax))); err != nil ||
		c.gate.AuthorMax < 0 || c.gate.AuthorMax > 1000 {
		return c, errors.New("X_RELAY_AUTHOR_MAX must be an integer in 0..1000 (0 = no limit)")
	}
	if c.gate.AuthorWindow, err = time.ParseDuration(env("X_RELAY_AUTHOR_WINDOW", feed.DefaultAuthorWindow.String())); err != nil ||
		c.gate.AuthorWindow < time.Second || c.gate.AuthorWindow > 24*time.Hour {
		return c, errors.New("X_RELAY_AUTHOR_WINDOW must be a duration in 1s..24h (e.g. 5m)")
	}
	if err := c.logLevel.UnmarshalText([]byte(env("X_RELAY_LOG_LEVEL", "info"))); err != nil {
		return c, errors.New("X_RELAY_LOG_LEVEL must be debug, info, warn or error")
	}
	if _, _, err := net.SplitHostPort(c.addr); err != nil {
		return c, fmt.Errorf("X_RELAY_ADDR: %w", err)
	}
	return c, nil
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "GET /health on X_RELAY_ADDR and exit 0 if it answers 200 (for docker HEALTHCHECK)")
	flag.Parse()

	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "x-relay:", err)
		os.Exit(2)
	}
	if *healthcheck {
		os.Exit(probe(cfg.addr))
	}

	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.logLevel}))
	if err := run(cfg, log); err != nil {
		log.Error("x-relay stopped", "err", err.Error())
		os.Exit(1)
	}
}

func run(cfg config, log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	client, err := gmgn.New(gmgn.Options{
		StreamURL: cfg.streamURL,
		UserAgent: cfg.userAgent,
		Proxy:     cfg.proxy,
		Channels:  cfg.channels,
	})
	if err != nil {
		return err
	}
	store := feed.NewStore(feed.StoreOptions{
		Capacity:   cfg.capacity,
		SubBuffer:  feed.DefaultSubBuffer,
		LookupSize: cfg.lookup,
		Hold:       cfg.hold,
		Gate:       feed.NewGate(cfg.gate),
		OnGated: func(p feed.Post, reason string) {
			if log.Enabled(context.Background(), slog.LevelDebug) {
				log.Debug("gated", "id", p.ID, "author", p.Author.Handle, "kind", p.Kind, "reason", reason,
					"signals", p.Signals, "text", preview(p.Text, 80))
			}
		},
	})
	ingest := feed.NewIngest(store, feed.NewFilter(cfg.tags), log)

	events := make(chan gmgn.Event, 256)
	go func() { _ = client.Run(ctx, events) }()
	go ingest.Run(ctx, events)
	go logStats(ctx, log, ingest, time.Minute)

	srv := &http.Server{
		Addr:    cfg.addr,
		Handler: server.New(server.Options{Store: store, Ingest: ingest, Log: log, MaxLimit: cfg.capacity}),
		// No ReadTimeout: net/http keeps it as the read deadline during the handler, and its background read
		// would cancel every SSE stream when it fires. Requests are body-less GETs; the header timeout suffices.
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    16 << 10,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	errs := make(chan error, 1)
	go func() { errs <- srv.ListenAndServe() }()
	log.Info("x-relay listening",
		"addr", cfg.addr, "tags", cfg.tags, "channels", cfg.channels, "capacity", cfg.capacity, "proxy", cfg.proxy != "",
		"holdMs", cfg.hold.Milliseconds(), "mode", cfg.gate.Mode, "deny", len(cfg.gate.Deny), "minText", cfg.gate.MinText,
		"authorMax", cfg.gate.AuthorMax, "authorWindow", cfg.gate.AuthorWindow.String(), "lookup", cfg.lookup)

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func logStats(ctx context.Context, log *slog.Logger, ingest *feed.Ingest, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		h := ingest.Health()
		log.Info("stats",
			"connected", h.Connected, "lastMessageAgeMs", h.LastMessageAgeMs,
			"frames", h.Counters.Frames, "items", h.Counters.Items, "filtered", h.Counters.Filtered,
			"malformed", h.Counters.Malformed, "accepted", h.Store.Accepted, "gated", h.Store.Gated,
			"held", h.Store.Held, "heldMerged", h.Store.HeldMerged, "copyGapsMs", h.Store.CopyGaps, "merged", h.Store.Merged,
			"duplicates", h.Store.Duplicates, "deleted", h.Store.Deleted, "posts", h.Store.Posts,
			"subscribers", h.Store.Subscribers, "slowDropped", h.Store.SlowDropped)
	}
}

func probe(addr string) int {
	host, port, _ := net.SplitHostPort(addr)
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + net.JoinHostPort(host, port) + "/health")
	if err != nil {
		return 1
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func preview(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func csv(v string) []string {
	var out []string
	for _, part := range strings.Split(v, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
