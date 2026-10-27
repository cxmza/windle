package feed

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"windle.fun/x-relay/internal/gmgn"
)

type Counters struct {
	Frames    uint64 `json:"frames"`
	Items     uint64 `json:"items"`
	Malformed uint64 `json:"malformed"`
	Filtered  uint64 `json:"filtered"`
	Skipped   uint64 `json:"skipped"`
}

type Health struct {
	Connected        bool     `json:"connected"`
	ConnectedForMs   *int64   `json:"connectedForMs"`
	LastMessageAgeMs *int64   `json:"lastMessageAgeMs"`
	Connects         uint64   `json:"connects"`
	Disconnects      uint64   `json:"disconnects"`
	LastError        string   `json:"lastError,omitempty"`
	Counters         Counters `json:"counters"`
	Store            Stats    `json:"store"`
}

// Ingest consumes gmgn events: tracks the upstream connection, filters by author tag and feeds the store.
type Ingest struct {
	store  *Store
	filter Filter
	log    *slog.Logger
	now    func() time.Time

	mu          sync.Mutex
	connected   bool
	connectedAt time.Time
	lastMessage time.Time
	connects    uint64
	disconnects uint64
	lastError   string
	counters    Counters
}

func NewIngest(store *Store, filter Filter, log *slog.Logger) *Ingest {
	return &Ingest{store: store, filter: filter, log: log, now: time.Now}
}

func (in *Ingest) Run(ctx context.Context, events <-chan gmgn.Event) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-events:
			in.Handle(ev)
		}
	}
}

func (in *Ingest) Handle(ev gmgn.Event) {
	switch ev.Kind {
	case gmgn.EventConnected:
		in.mu.Lock()
		in.connected = true
		in.connectedAt = ev.ReceivedAt
		in.lastMessage = ev.ReceivedAt
		in.connects++
		in.mu.Unlock()
		in.log.Info("upstream connected", "attempt", ev.Attempt)
	case gmgn.EventDisconnected:
		msg := ""
		if ev.Err != nil {
			msg = ev.Err.Error()
		}
		in.mu.Lock()
		in.connected = false
		in.disconnects++
		in.lastError = msg
		in.mu.Unlock()
		in.log.Warn("upstream disconnected", "err", msg, "attempt", ev.Attempt)
	case gmgn.EventFrame:
		in.frame(ev.Frame, ev.ReceivedAt)
	}
}

func (in *Ingest) frame(frame gmgn.Frame, at time.Time) {
	var c Counters
	c.Frames = 1
	c.Items = uint64(len(frame.Items))
	c.Malformed = uint64(frame.Malformed)
	for _, item := range frame.Items {
		if !in.filter.Allows(item.Tags) {
			c.Filtered++
			continue
		}
		r := Normalize(item, at)
		if r.Malformed {
			c.Malformed++
			continue
		}
		if r.Action == ActionSkip {
			c.Skipped++
			continue
		}
		in.store.Apply(r)
	}
	in.mu.Lock()
	in.lastMessage = at
	in.counters.Frames += c.Frames
	in.counters.Items += c.Items
	in.counters.Malformed += c.Malformed
	in.counters.Filtered += c.Filtered
	in.counters.Skipped += c.Skipped
	in.mu.Unlock()
}

func (in *Ingest) Health() Health {
	now := in.now()
	in.mu.Lock()
	h := Health{
		Connected:   in.connected,
		Connects:    in.connects,
		Disconnects: in.disconnects,
		LastError:   in.lastError,
		Counters:    in.counters,
	}
	if in.connected {
		ms := now.Sub(in.connectedAt).Milliseconds()
		h.ConnectedForMs = &ms
	}
	if !in.lastMessage.IsZero() {
		ms := now.Sub(in.lastMessage).Milliseconds()
		h.LastMessageAgeMs = &ms
	}
	in.mu.Unlock()
	h.Store = in.store.Stats()
	return h
}
