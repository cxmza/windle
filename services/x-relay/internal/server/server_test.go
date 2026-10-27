package server

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"windle.fun/x-relay/internal/feed"
	"windle.fun/x-relay/internal/gmgn"
)

func setup(t *testing.T, ping time.Duration) (*feed.Store, *feed.Ingest, *httptest.Server) {
	t.Helper()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	store := feed.NewStore(feed.StoreOptions{Capacity: 100, SubBuffer: 64})
	ingest := feed.NewIngest(store, feed.NewFilter([]string{"kol"}), log)
	srv := httptest.NewServer(New(Options{Store: store, Ingest: ingest, Log: log, MaxLimit: 100, PingInterval: ping}))
	t.Cleanup(srv.Close)
	return store, ingest, srv
}

func addPost(store *feed.Store, id string) {
	item := gmgn.Item{Type: "tweet", TweetID: id, User: gmgn.User{Handle: "a"}, Tags: []string{"kol"}}
	store.Apply(feed.Normalize(item, time.Now()))
}

func TestRecent(t *testing.T) {
	store, _, srv := setup(t, time.Hour)
	addPost(store, "2102711510573175177")
	addPost(store, "2102711518970405062")

	res, err := http.Get(srv.URL + "/recent?limit=1")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var body struct {
		Posts []feed.Post `json:"posts"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 200 || len(body.Posts) != 1 || body.Posts[0].ID != "2102711518970405062" {
		t.Errorf("recent: %d %+v", res.StatusCode, body)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("content-type %q", ct)
	}

	for _, bad := range []string{"0", "101", "x", "-1"} {
		res, err := http.Get(srv.URL + "/recent?limit=" + bad)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 400 {
			t.Errorf("limit=%s: %d", bad, res.StatusCode)
		}
	}
	res2, err := http.Post(srv.URL+"/recent", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	res2.Body.Close()
	if res2.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("POST /recent: %d", res2.StatusCode)
	}
}

func TestHealth(t *testing.T) {
	_, ingest, srv := setup(t, time.Hour)
	get := func() map[string]any {
		res, err := http.Get(srv.URL + "/health")
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatalf("health status %d", res.StatusCode)
		}
		var body map[string]any
		if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		return body
	}
	if b := get(); b["status"] != "degraded" || b["connected"] != false || b["lastMessageAgeMs"] != nil {
		t.Errorf("before connect: %v", b)
	}
	ingest.Handle(gmgn.Event{Kind: gmgn.EventConnected, ReceivedAt: time.Now()})
	b := get()
	if b["status"] != "ok" || b["connected"] != true || b["lastMessageAgeMs"] == nil {
		t.Errorf("connected: %v", b)
	}
	if _, ok := b["store"].(map[string]any)["posts"]; !ok {
		t.Errorf("store stats missing: %v", b)
	}
}

func readEvent(t *testing.T, r *bufio.Reader) string {
	t.Helper()
	var b strings.Builder
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatalf("read stream: %v (so far %q)", err, b.String())
		}
		b.WriteString(line)
		if line == "\n" {
			return b.String()
		}
	}
}

func TestStream(t *testing.T) {
	store, _, srv := setup(t, 50*time.Millisecond)
	addPost(store, "2102711510573175177")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/stream", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	h := res.Header
	if h.Get("Content-Type") != "text/event-stream; charset=utf-8" || h.Get("Cache-Control") != "no-cache, no-transform" ||
		h.Get("X-Accel-Buffering") != "no" {
		t.Errorf("headers: %v", h)
	}
	r := bufio.NewReader(res.Body)
	if ev := readEvent(t, r); ev != "retry: 3000\n\n" {
		t.Errorf("retry: %q", ev)
	}
	snap := readEvent(t, r)
	if !strings.HasPrefix(snap, "event: snapshot\ndata: {\"posts\":[{\"id\":\"2102711510573175177\"") {
		t.Errorf("snapshot: %q", snap)
	}

	addPost(store, "2102711518970405062")
	var sawPost, sawPing bool
	for !(sawPost && sawPing) {
		ev := readEvent(t, r)
		switch {
		case ev == ": ping\n\n":
			sawPing = true
		case strings.HasPrefix(ev, "event: post\ndata: {\"id\":\"2102711518970405062\""):
			sawPost = true
		default:
			t.Fatalf("unexpected event %q", ev)
		}
	}
	if st := store.Stats(); st.Subscribers != 1 {
		t.Errorf("subscribers %d", st.Subscribers)
	}
	cancel()
	deadline := time.Now().Add(2 * time.Second)
	for store.Stats().Subscribers != 0 {
		if time.Now().After(deadline) {
			t.Fatal("subscriber not cleaned up after disconnect")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestPost(t *testing.T) {
	store, _, srv := setup(t, time.Hour)
	addPost(store, "2102711510573175177")

	res, err := http.Get(srv.URL + "/post/2102711510573175177")
	if err != nil {
		t.Fatal(err)
	}
	var p feed.Post
	if err := json.NewDecoder(res.Body).Decode(&p); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 || p.ID != "2102711510573175177" || p.Author.Handle != "a" {
		t.Errorf("found: %d %+v", res.StatusCode, p)
	}

	for path, want := range map[string]int{
		"/post/2102711518970405062":   http.StatusNotFound,
		"/post/123456789012345678901": http.StatusBadRequest,
		"/post/12a":                   http.StatusBadRequest,
	} {
		res, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != want {
			t.Errorf("%s: %d, want %d", path, res.StatusCode, want)
		}
	}
}
