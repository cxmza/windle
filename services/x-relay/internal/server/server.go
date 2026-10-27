// Package server is the relay's loopback HTTP API: GET /recent, GET /stream (SSE), GET /post/{id}, GET /health.
package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"windle.fun/x-relay/internal/feed"
)

const (
	DefaultRecentLimit = 50
	SnapshotSize       = 50
	PingInterval       = 15 * time.Second
	writeTimeout       = 10 * time.Second
	retryMs            = 3000
)

var postIDPattern = regexp.MustCompile(`^\d{1,20}$`)

type Options struct {
	Store        *feed.Store
	Ingest       *feed.Ingest
	Log          *slog.Logger
	MaxLimit     int
	PingInterval time.Duration
	// StaleAfter marks /health "degraded" once the upstream has been silent (or down) this long.
	StaleAfter time.Duration
}

type handler struct {
	opts Options
}

func New(opts Options) http.Handler {
	if opts.MaxLimit <= 0 {
		opts.MaxLimit = feed.DefaultCapacity
	}
	if opts.PingInterval <= 0 {
		opts.PingInterval = PingInterval
	}
	if opts.StaleAfter <= 0 {
		opts.StaleAfter = 2 * time.Minute
	}
	h := &handler{opts: opts}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /recent", h.recent)
	mux.HandleFunc("GET /stream", h.stream)
	mux.HandleFunc("GET /post/{id}", h.post)
	mux.HandleFunc("GET /health", h.health)
	return mux
}

func (h *handler) recent(w http.ResponseWriter, r *http.Request) {
	limit := DefaultRecentLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > h.opts.MaxLimit {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "limit must be an integer in 1.." + strconv.Itoa(h.opts.MaxLimit),
			})
			return
		}
		limit = n
	}
	writeJSON(w, http.StatusOK, struct {
		Posts []feed.Post `json:"posts"`
	}{Posts: h.opts.Store.Recent(limit)})
}

// post answers one recently seen post by id: shown in the feed, still held, gated out or evicted from the ring.
func (h *handler) post(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !postIDPattern.MatchString(id) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be 1-20 digits"})
		return
	}
	p, ok := h.opts.Store.Lookup(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "post not seen recently"})
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *handler) health(w http.ResponseWriter, _ *http.Request) {
	health := h.opts.Ingest.Health()
	status := "ok"
	stale := health.LastMessageAgeMs == nil || time.Duration(*health.LastMessageAgeMs)*time.Millisecond > h.opts.StaleAfter
	if !health.Connected || stale {
		status = "degraded"
	}
	// Liveness stays 200: a restart cannot fix an upstream outage or an IP ban; `status` tells the difference.
	writeJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
		feed.Health
	}{Status: status, Health: health})
}

func (h *handler) stream(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	header := w.Header()
	header.Set("Content-Type", "text/event-stream; charset=utf-8")
	header.Set("Cache-Control", "no-cache, no-transform")
	header.Set("Connection", "keep-alive")
	header.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	snapshot, sub := h.opts.Store.Subscribe(SnapshotSize)
	defer h.opts.Store.Unsubscribe(sub)

	write := func(b []byte) bool {
		_ = rc.SetWriteDeadline(time.Now().Add(writeTimeout))
		if _, err := w.Write(b); err != nil {
			return false
		}
		return rc.Flush() == nil
	}
	if !write([]byte("retry: "+strconv.Itoa(retryMs)+"\n\n")) || !write(snapshot) {
		return
	}

	ping := time.NewTicker(h.opts.PingInterval)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-sub.Gone():
			h.opts.Log.Warn("stream subscriber dropped (too slow)", "remote", r.RemoteAddr)
			return
		case frame := <-sub.C:
			if !write(frame) {
				return
			}
		case <-ping.C:
			if !write([]byte(": ping\n\n")) {
				return
			}
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
