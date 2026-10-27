package feed

import (
	"bytes"
	"encoding/json"
	"sync"
	"time"
)

const (
	DefaultCapacity  = 1000
	DefaultSubBuffer = 512
	// DefaultHold covers the cp=1 copy of ~99% of posts: in a 3-min live sample (2026-10-13, 139 copies) the
	// first copy came after the original within 600 ms for 85%, within 800 ms for 99.3%, never later than 1 s;
	// the design review saw a 855 ms maximum. More copies (one per gmgn channel) follow within ~250 ms of it.
	DefaultHold       = 800 * time.Millisecond
	seenPerRingSlot   = 10
	EventSnapshot     = "snapshot"
	EventPost         = "post"
	EventDelete       = "delete"
	snapshotFallbackN = 50
)

// SSE frames one Server-Sent Event. data must be single-line JSON (encoding/json never emits raw newlines).
func SSE(event string, data []byte) []byte {
	var b bytes.Buffer
	b.Grow(len(event) + len(data) + 16)
	b.WriteString("event: ")
	b.WriteString(event)
	b.WriteString("\ndata: ")
	b.Write(data)
	b.WriteString("\n\n")
	return b.Bytes()
}

type entry struct {
	post Post
	// seenAt is when the relay first saw the id; copied is set once a cp=1 copy arrived (for the gap histogram).
	seenAt time.Time
	copied bool
	timer  *time.Timer
}

type Subscriber struct {
	C    chan []byte
	once sync.Once
	gone chan struct{}
}

// Gone is closed when the store dropped this subscriber (too slow) or it unsubscribed.
func (s *Subscriber) Gone() <-chan struct{} { return s.gone }

func (s *Subscriber) close() { s.once.Do(func() { close(s.gone) }) }

type Stats struct {
	Posts       int    `json:"posts"`
	Held        int    `json:"held"`
	Subscribers int    `json:"subscribers"`
	Accepted    uint64 `json:"accepted"`
	// Merged counts enrichments of an already shown post (each one is re-announced); HeldMerged those folded
	// into a post still held back, which cost no extra event.
	Merged     uint64            `json:"merged"`
	HeldMerged uint64            `json:"heldMerged"`
	Gated      map[string]uint64 `json:"gated"`
	// CopyGaps buckets the delay between the first sighting of an id and its first cp=1 copy (ms, upper bounds).
	CopyGaps    map[string]uint64 `json:"copyGapsMs"`
	Duplicates  uint64            `json:"duplicates"`
	Deleted     uint64            `json:"deleted"`
	SlowDropped uint64            `json:"slowDropped"`
}

var gapBuckets = []struct {
	le    time.Duration
	label string
}{
	{100 * time.Millisecond, "le100"}, {200 * time.Millisecond, "le200"}, {300 * time.Millisecond, "le300"},
	{400 * time.Millisecond, "le400"}, {500 * time.Millisecond, "le500"}, {600 * time.Millisecond, "le600"},
	{800 * time.Millisecond, "le800"}, {1000 * time.Millisecond, "le1000"}, {2000 * time.Millisecond, "le2000"},
}

type StoreOptions struct {
	Capacity  int
	SubBuffer int
	// LookupSize bounds the LRU behind Lookup (GET /post/{id}).
	LookupSize int
	// Hold delays the first emission of a new post by this long, folding every copy that arrives meanwhile into
	// it, so subscribers get one merged record instead of a post that is replaced a moment later. A post is not
	// released early on its first cp=1 copy: gmgn often sends several (one per channel) a few hundred ms apart,
	// and the later ones still change text or reply data. 0 emits at once.
	Hold time.Duration
	// Gate decides which posts are shown; nil shows all.
	Gate *Gate
	// OnGated, if set, is called (under the store lock: keep it cheap) for every post the gate drops.
	OnGated func(p Post, reason string)
}

// Store holds new posts back for the hold window, gates them, keeps the shown ones in a ring of the newest
// (dedupe by id), fans changes out to SSE subscribers and remembers recent posts for Lookup.
type Store struct {
	mu        sync.Mutex
	capacity  int
	subBuffer int
	hold      time.Duration
	gate      *Gate
	onGated   func(Post, string)
	now       func() time.Time
	posts     []*entry
	index     map[string]*entry
	pending   map[string]*entry
	lookup    *lookup
	// seen remembers ids that are not in the ring but must not be announced as new (evicted, deleted, gated out).
	seen      map[string]struct{}
	seenOrder []string
	seenNext  int
	subs      map[*Subscriber]struct{}
	stats     Stats
}

func NewStore(opts StoreOptions) *Store {
	if opts.Capacity <= 0 {
		opts.Capacity = DefaultCapacity
	}
	if opts.SubBuffer <= 0 {
		opts.SubBuffer = DefaultSubBuffer
	}
	if opts.Hold < 0 {
		opts.Hold = 0
	}
	return &Store{
		capacity:  opts.Capacity,
		subBuffer: opts.SubBuffer,
		hold:      opts.Hold,
		gate:      opts.Gate,
		onGated:   opts.OnGated,
		now:       time.Now,
		posts:     make([]*entry, 0, opts.Capacity),
		index:     make(map[string]*entry, opts.Capacity),
		pending:   make(map[string]*entry),
		lookup:    newLookup(opts.LookupSize),
		seen:      make(map[string]struct{}),
		seenOrder: make([]string, opts.Capacity*seenPerRingSlot),
		subs:      make(map[*Subscriber]struct{}),
		stats:     Stats{Gated: map[string]uint64{}, CopyGaps: map[string]uint64{}},
	}
}

type Outcome uint8

const (
	OutcomeIgnored Outcome = iota
	OutcomeAdded
	OutcomeMerged
	OutcomeDeleted
	OutcomeHeld
	OutcomeGated
)

// Apply stores a normalized result and broadcasts what changed.
func (s *Store) Apply(r Result) Outcome {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch r.Action {
	case ActionPost:
		return s.applyPost(r.Post, r.Copy)
	case ActionDelete:
		return s.applyDelete(r.DeleteID)
	default:
		return OutcomeIgnored
	}
}

func (s *Store) applyPost(p Post, isCopy bool) Outcome {
	now := s.now()
	if e, ok := s.index[p.ID]; ok {
		s.noteCopy(e, isCopy, now)
		if !s.mergeInto(e, p, isCopy) {
			s.stats.Duplicates++
			return OutcomeIgnored
		}
		s.stats.Merged++
		s.broadcastPost(e.post)
		return OutcomeMerged
	}
	if e, ok := s.pending[p.ID]; ok {
		s.noteCopy(e, isCopy, now)
		if s.mergeInto(e, p, isCopy) {
			s.stats.HeldMerged++
		} else {
			s.stats.Duplicates++
		}
		return OutcomeHeld
	}
	if _, ok := s.seen[p.ID]; ok {
		// Not announced again, but Lookup keeps serving the fullest version.
		if e := s.lookup.get(p.ID); e != nil {
			s.noteCopy(e, isCopy, now)
			s.mergeInto(e, p, isCopy)
		}
		s.stats.Duplicates++
		return OutcomeIgnored
	}

	e := &entry{post: p.clone(), seenAt: now, copied: isCopy}
	e.post.Signals = Signals(e.post)
	s.lookup.put(e)
	if s.hold <= 0 {
		return s.release(e)
	}
	s.pending[p.ID] = e
	e.timer = time.AfterFunc(s.hold, func() { s.expire(e) })
	return OutcomeHeld
}

func (s *Store) expire(e *entry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pending[e.post.ID] != e {
		return
	}
	delete(s.pending, e.post.ID)
	s.release(e)
}

// release runs the gate on a post leaving the hold window and either shows it or remembers it as gated out.
func (s *Store) release(e *entry) Outcome {
	if s.gate != nil {
		if reason := s.gate.Decide(e.post, s.now()); reason != "" {
			s.stats.Gated[reason]++
			if s.onGated != nil {
				s.onGated(e.post, reason)
			}
			s.remember(e.post.ID)
			return OutcomeGated
		}
	}
	s.posts = append(s.posts, e)
	s.index[e.post.ID] = e
	if len(s.posts) > s.capacity {
		old := s.posts[0]
		s.posts[0] = nil
		s.posts = s.posts[1:]
		delete(s.index, old.post.ID)
		s.remember(old.post.ID)
	}
	s.stats.Accepted++
	s.broadcastPost(e.post)
	return OutcomeAdded
}

func (s *Store) mergeInto(e *entry, p Post, isCopy bool) bool {
	merged, changed := merge(e.post, p, isCopy)
	if !changed {
		return false
	}
	merged.Signals = Signals(merged)
	e.post = merged
	return true
}

func (s *Store) noteCopy(e *entry, isCopy bool, now time.Time) {
	if !isCopy || e.copied {
		return
	}
	e.copied = true
	gap := now.Sub(e.seenAt)
	label := "gt2000"
	for _, b := range gapBuckets {
		if gap <= b.le {
			label = b.label
			break
		}
	}
	s.stats.CopyGaps[label]++
}

func (s *Store) applyDelete(id string) Outcome {
	s.lookup.remove(id)
	if e, ok := s.pending[id]; ok {
		// Never shown: nothing to announce.
		e.timer.Stop()
		delete(s.pending, id)
		s.remember(id)
		s.stats.Deleted++
		return OutcomeDeleted
	}
	e, ok := s.index[id]
	if !ok {
		s.remember(id)
		return OutcomeIgnored
	}
	for i, candidate := range s.posts {
		if candidate == e {
			s.posts = append(s.posts[:i], s.posts[i+1:]...)
			break
		}
	}
	delete(s.index, id)
	s.remember(id)
	s.stats.Deleted++
	data, _ := json.Marshal(Deleted{ID: id})
	s.broadcast(SSE(EventDelete, data))
	return OutcomeDeleted
}

func (s *Store) remember(id string) {
	if _, ok := s.seen[id]; ok {
		return
	}
	if old := s.seenOrder[s.seenNext]; old != "" {
		delete(s.seen, old)
	}
	s.seenOrder[s.seenNext] = id
	s.seenNext = (s.seenNext + 1) % len(s.seenOrder)
	s.seen[id] = struct{}{}
}

func (s *Store) broadcastPost(p Post) {
	data, err := json.Marshal(p)
	if err != nil {
		return
	}
	s.broadcast(SSE(EventPost, data))
}

func (s *Store) broadcast(frame []byte) {
	for sub := range s.subs {
		select {
		case sub.C <- frame:
		default:
			delete(s.subs, sub)
			sub.close()
			s.stats.SlowDropped++
		}
	}
}

// Recent returns up to limit shown posts, newest first (order of release). Held posts are not included.
func (s *Store) Recent(limit int) []Post {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.recentLocked(limit)
}

func (s *Store) recentLocked(limit int) []Post {
	if limit <= 0 || limit > len(s.posts) {
		limit = len(s.posts)
	}
	out := make([]Post, 0, limit)
	for i := len(s.posts) - 1; i >= 0 && len(out) < limit; i-- {
		out = append(out, s.posts[i].post.clone())
	}
	return out
}

// Lookup returns the newest known version of a post the relay saw recently: shown, held, gated out or already
// evicted from the ring (bounded by LookupSize). Deleted posts are not found.
func (s *Store) Lookup(id string) (Post, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e := s.index[id]
	if e == nil {
		e = s.lookup.get(id)
	}
	if e == nil {
		return Post{}, false
	}
	return e.post.clone(), true
}

// Subscribe registers a subscriber and returns the snapshot frame of the newest n posts, atomically with the
// registration: every later change reaches the subscriber, none is in both.
func (s *Store) Subscribe(n int) ([]byte, *Subscriber) {
	if n <= 0 {
		n = snapshotFallbackN
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := json.Marshal(struct {
		Posts []Post `json:"posts"`
	}{Posts: s.recentLocked(n)})
	if err != nil {
		data = []byte(`{"posts":[]}`)
	}
	sub := &Subscriber{C: make(chan []byte, s.subBuffer), gone: make(chan struct{})}
	s.subs[sub] = struct{}{}
	return SSE(EventSnapshot, data), sub
}

func (s *Store) Unsubscribe(sub *Subscriber) {
	s.mu.Lock()
	delete(s.subs, sub)
	s.mu.Unlock()
	sub.close()
}

func (s *Store) Stats() Stats {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.stats
	st.Gated = make(map[string]uint64, len(s.stats.Gated))
	for k, v := range s.stats.Gated {
		st.Gated[k] = v
	}
	st.CopyGaps = make(map[string]uint64, len(s.stats.CopyGaps))
	for k, v := range s.stats.CopyGaps {
		st.CopyGaps[k] = v
	}
	st.Posts = len(s.posts)
	st.Held = len(s.pending)
	st.Subscribers = len(s.subs)
	return st
}
