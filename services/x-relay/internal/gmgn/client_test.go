package gmgn

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestClientSubscribesAndReconnects(t *testing.T) {
	samples := loadSamples(t)
	var mu sync.Mutex
	var origins, agents, subscribes []string
	sessions := 0

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		defer conn.CloseNow()
		mu.Lock()
		sessions++
		origins = append(origins, r.Header.Get("Origin"))
		agents = append(agents, r.Header.Get("User-Agent"))
		mu.Unlock()
		for range 2 {
			_, data, err := conn.Read(r.Context())
			if err != nil {
				return
			}
			mu.Lock()
			subscribes = append(subscribes, string(data))
			mu.Unlock()
		}
		for _, line := range samples[:3] {
			if err := conn.Write(r.Context(), websocket.MessageText, line); err != nil {
				return
			}
		}
		conn.Close(websocket.StatusGoingAway, "bye")
	}))
	defer srv.Close()

	client, err := New(Options{
		StreamURL:  "ws" + strings.TrimPrefix(srv.URL, "http"),
		BackoffMin: 10 * time.Millisecond,
		BackoffMax: 20 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	events := make(chan Event, 64)
	go func() { _ = client.Run(ctx, events) }()

	connected, disconnected, frames := 0, 0, 0
	for disconnected < 2 {
		select {
		case ev := <-events:
			switch ev.Kind {
			case EventConnected:
				connected++
			case EventDisconnected:
				disconnected++
			case EventFrame:
				frames++
			}
		case <-ctx.Done():
			t.Fatalf("timeout: connected=%d disconnected=%d frames=%d", connected, disconnected, frames)
		}
	}
	cancel()

	mu.Lock()
	defer mu.Unlock()
	if connected < 2 || frames < 6 {
		t.Errorf("connected=%d frames=%d", connected, frames)
	}
	for _, origin := range origins {
		if origin != "https://gmgn.ai" {
			t.Errorf("origin %q", origin)
		}
	}
	if !strings.Contains(agents[0], "Chrome/") {
		t.Errorf("user agent %q", agents[0])
	}
	if len(subscribes) < 2 || !strings.Contains(subscribes[0], `"channel":"twitter_monitor_basic"`) ||
		!strings.Contains(subscribes[1], `"channel":"twitter_monitor_token"`) || !strings.Contains(subscribes[0], `"chain":"sol"`) {
		t.Errorf("subscribes %v", subscribes)
	}
}

func TestBackoffBounds(t *testing.T) {
	for attempt := range 12 {
		d := backoff(time.Second, time.Minute, attempt)
		if d < 800*time.Millisecond || d > 72*time.Second {
			t.Fatalf("attempt %d: %v", attempt, d)
		}
	}
}
