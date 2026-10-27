package feed

import (
	"bufio"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"windle.fun/x-relay/internal/gmgn"
)

func feedSamples(t *testing.T, ingest *Ingest) {
	t.Helper()
	f, err := os.Open("../gmgn/testdata/ws_samples.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		ingest.Handle(gmgn.Event{Kind: gmgn.EventFrame, Frame: gmgn.ParseFrame(scanner.Bytes()), ReceivedAt: received})
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
}

func waitIdle(t *testing.T, store *Store) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for store.Stats().Held != 0 {
		if time.Now().After(deadline) {
			t.Fatal("posts still held")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func postFrames(t *testing.T, frames []string) []Post {
	t.Helper()
	var out []Post
	for _, frame := range frames {
		if !strings.HasPrefix(frame, "event: post\ndata: ") {
			continue
		}
		var p Post
		if err := json.Unmarshal([]byte(strings.TrimSuffix(strings.TrimPrefix(frame, "event: post\ndata: "), "\n\n")), &p); err != nil {
			t.Fatalf("frame json: %v", err)
		}
		out = append(out, p)
	}
	return out
}

func TestHoldEmitsOneMergedRecord(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 1000, SubBuffer: 1024, Hold: 300 * time.Millisecond})
	ingest := NewIngest(store, NewFilter([]string{"kol", "founder"}), quietLog())
	_, sub := store.Subscribe(50)
	feedSamples(t, ingest)
	waitIdle(t, store)

	emitted := postFrames(t, drain(sub))
	perID := map[string]int{}
	for _, p := range emitted {
		perID[p.ID]++
		if perID[p.ID] > 1 {
			t.Errorf("%s emitted %d times", p.ID, perID[p.ID])
		}
		if p.ID == "2102711510573175177" && (p.InReplyTo == nil || p.InReplyTo.Handle != "thejesterhead9") {
			t.Errorf("first emission of the reply must carry its parent: %+v", p.InReplyTo)
		}
	}
	recent := store.Recent(0)
	if len(recent) != len(perID) || len(recent) == 0 {
		t.Errorf("ring %d vs emitted %d", len(recent), len(perID))
	}
	st := store.Stats()
	if st.HeldMerged == 0 || st.Merged != 0 || st.Accepted != uint64(len(recent)) {
		t.Errorf("stats %+v", st)
	}
}

func TestHoldDeadlineThenLateEnrichment(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 10, SubBuffer: 16, Hold: 40 * time.Millisecond})
	_, sub := store.Subscribe(10)
	id := "2102711510573175177"
	if got := store.Apply(Result{Action: ActionPost, Post: post(id)}); got != OutcomeHeld {
		t.Fatalf("new post: %v", got)
	}
	if len(store.Recent(0)) != 0 || len(drain(sub)) != 0 {
		t.Fatal("a held post is neither in /recent nor announced")
	}
	if p, ok := store.Lookup(id); !ok || p.ID != id {
		t.Fatal("a held post is found by Lookup")
	}
	waitIdle(t, store)
	if frames := postFrames(t, drain(sub)); len(frames) != 1 || len(store.Recent(0)) != 1 {
		t.Fatalf("released on deadline: %d frames", len(frames))
	}
	richer := post(id)
	richer.Text = "the full text, with $SOL"
	if got := store.Apply(Result{Action: ActionPost, Post: richer, Copy: true}); got != OutcomeMerged {
		t.Fatalf("late copy: %v", got)
	}
	frames := postFrames(t, drain(sub))
	if len(frames) != 1 || frames[0].Text != richer.Text || len(frames[0].Signals) == 0 {
		t.Fatalf("late enrichment re-announced with signals: %+v", frames)
	}
	if st := store.Stats(); st.Accepted != 1 || st.Merged != 1 || len(st.CopyGaps) != 1 {
		t.Errorf("stats %+v", st)
	}
}

func TestDeleteWhileHeld(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 10, SubBuffer: 16, Hold: time.Hour})
	_, sub := store.Subscribe(10)
	id := "2102711510573175177"
	store.Apply(Result{Action: ActionPost, Post: post(id)})
	if got := store.Apply(Result{Action: ActionDelete, DeleteID: id}); got != OutcomeDeleted {
		t.Fatalf("delete: %v", got)
	}
	if got := store.Apply(Result{Action: ActionPost, Post: post(id), Copy: true}); got != OutcomeIgnored {
		t.Errorf("copy after delete: %v", got)
	}
	if _, ok := store.Lookup(id); ok {
		t.Error("deleted post must not be found")
	}
	if frames := drain(sub); len(frames) != 0 || store.Stats().Held != 0 {
		t.Errorf("nothing announced: %q", frames)
	}
}

func TestGatedPostIsHiddenButFound(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 10, SubBuffer: 16, Gate: NewGate(GateOptions{})})
	_, sub := store.Subscribe(10)
	id := "2102711510573175177"
	short := post(id)
	short.Text = "gm"
	if got := store.Apply(Result{Action: ActionPost, Post: short}); got != OutcomeGated {
		t.Fatalf("short post: %v", got)
	}
	richer := short.clone()
	richer.Text = "gm, mainnet is live"
	if got := store.Apply(Result{Action: ActionPost, Post: richer, Copy: true}); got != OutcomeIgnored {
		t.Errorf("copy of a gated post stays hidden: %v", got)
	}
	if p, ok := store.Lookup(id); !ok || p.Text != richer.Text || len(p.Signals) == 0 {
		t.Errorf("lookup serves the merged post: %+v %v", p, ok)
	}
	if len(drain(sub)) != 0 || len(store.Recent(0)) != 0 || store.Stats().Gated[GatedShort] != 1 {
		t.Errorf("gated post leaked: %+v", store.Stats())
	}
}

func TestLookupIsBounded(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 1, SubBuffer: 16, LookupSize: 2})
	ids := []string{"2102711510573175177", "2102711518970405062", "2102711519142428747"}
	for _, id := range ids {
		store.Apply(Result{Action: ActionPost, Post: post(id)})
	}
	if _, ok := store.Lookup(ids[0]); ok {
		t.Error("oldest id evicted from both ring and lookup")
	}
	for _, id := range ids[1:] {
		if _, ok := store.Lookup(id); !ok {
			t.Errorf("%s should be found", id)
		}
	}
}

func TestCryptoGateOnSamples(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 1000, SubBuffer: 1024, Gate: NewGate(GateOptions{AuthorMax: 3})})
	ingest := NewIngest(store, NewFilter([]string{"kol", "founder"}), quietLog())
	feedSamples(t, ingest)
	kept := store.Recent(0)
	st := store.Stats()
	gated := uint64(0)
	for _, n := range st.Gated {
		gated += n
	}
	if len(kept) == 0 || gated == 0 || st.Gated[GatedReply] == 0 {
		t.Fatalf("kept %d, gated %v", len(kept), st.Gated)
	}
	for _, p := range kept {
		if p.Kind == KindReply && len(p.Signals) == 0 {
			t.Errorf("reply without signal kept: %s", p.ID)
		}
	}
	t.Logf("samples: kept %d of %d, gated %v", len(kept), uint64(len(kept))+gated, st.Gated)
}
