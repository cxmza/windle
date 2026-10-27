package feed

import (
	"bufio"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"windle.fun/x-relay/internal/gmgn"
)

var received = time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)

func sampleItems(t *testing.T) []gmgn.Item {
	t.Helper()
	f, err := os.Open("../gmgn/testdata/ws_samples.jsonl")
	if err != nil {
		t.Fatalf("open samples: %v", err)
	}
	defer f.Close()
	var items []gmgn.Item
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		items = append(items, gmgn.ParseFrame(scanner.Bytes()).Items...)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan samples: %v", err)
	}
	return items
}

func findItem(t *testing.T, items []gmgn.Item, id string, copy bool) gmgn.Item {
	t.Helper()
	for _, it := range items {
		if it.TweetID == id && it.Copy == copy {
			return it
		}
	}
	t.Fatalf("no sample item %s copy=%v", id, copy)
	return gmgn.Item{}
}

func parseItem(t *testing.T, raw string) gmgn.Item {
	t.Helper()
	frame := gmgn.ParseFrame([]byte(`{"channel":"twitter_monitor_basic","data":[` + raw + `]}`))
	if len(frame.Items) != 1 {
		t.Fatalf("parse %s: %+v", raw, frame)
	}
	return frame.Items[0]
}

func TestTweetTime(t *testing.T) {
	got, ok := TweetTime("2102711510573175177")
	if !ok || FormatTime(got) != "2026-09-23T10:47:45.268Z" || got.UnixMilli() != 1790160465268 {
		t.Fatalf("got %v %v", got, ok)
	}
	for _, bad := range []string{"", "abc", "-1", "0", "123456789012345678901"} {
		if _, ok := TweetTime(bad); ok {
			t.Errorf("%q accepted", bad)
		}
	}
}

func TestSnowflakeMatchesSampleTimestamps(t *testing.T) {
	for _, it := range sampleItems(t) {
		if it.Type == "delete_post" || it.Type == "follow" {
			continue
		}
		created, ok := TweetTime(it.TweetID)
		if !ok || created.UnixMilli() != it.Timestamp {
			t.Errorf("%s: snowflake %d, ts %d", it.TweetID, created.UnixMilli(), it.Timestamp)
		}
	}
}

func TestNormalizeReplyCopyAddsParent(t *testing.T) {
	items := sampleItems(t)
	first := Normalize(findItem(t, items, "2102711510573175177", false), received)
	if first.Action != ActionPost || first.Copy {
		t.Fatalf("first: %+v", first)
	}
	p := first.Post
	if p.Kind != KindReply || p.CreatedAt != "2026-09-23T10:47:45.268Z" || p.ReceivedAt != "2026-10-13T12:00:00.000Z" ||
		p.URL != "https://x.com/djcows/status/2102711510573175177" || p.Source != "gmgn" || p.InReplyTo != nil {
		t.Errorf("first post: %+v", p)
	}
	if p.Author.ID == nil || *p.Author.ID != "217856128" || p.Author.Followers == nil || *p.Author.Followers != 25879 ||
		p.Author.AvatarURL == nil || !strings.HasPrefix(*p.Author.AvatarURL, "https://pbs.twimg.com/profile_images/") ||
		len(p.Author.Tags) != 1 || p.Author.Tags[0] != "kol" {
		t.Errorf("author: %+v", p.Author)
	}
	copied := Normalize(findItem(t, items, "2102711510573175177", true), received)
	if !copied.Copy || copied.Post.InReplyTo == nil || copied.Post.InReplyTo.Handle != "thejesterhead9" ||
		copied.Post.InReplyTo.ID == nil || *copied.Post.InReplyTo.ID != "2102582595414593979" {
		t.Errorf("copy reply ref: %+v", copied.Post.InReplyTo)
	}
}

func TestNormalizeQuoteUsesSourceAndUnescapes(t *testing.T) {
	items := sampleItems(t)
	first := Normalize(findItem(t, items, "2102711580811219421", false), received).Post
	if first.Kind != KindQuote || first.Quoted == nil || first.Quoted.Author.Handle != "dev0xx_" ||
		first.Quoted.ID == nil || *first.Quoted.ID != "2101093369720209795" {
		t.Fatalf("quoted: %+v", first.Quoted)
	}
	if !strings.Contains(first.Quoted.Text, "> govt and CBs ignored") || strings.Contains(first.Quoted.Text, "&gt;") {
		t.Errorf("entities not decoded: %q", first.Quoted.Text)
	}
}

func TestNormalizeRepostPutsOriginalInQuoted(t *testing.T) {
	p := Normalize(findItem(t, sampleItems(t), "2102711534573301863", false), received).Post
	if p.Kind != KindRepost || p.Text != "" || len(p.Media) != 0 {
		t.Errorf("repost own fields: %+v", p)
	}
	if p.Quoted == nil || p.Quoted.Author.Handle != "PANewsCN" || p.Quoted.Text == "" || len(p.Quoted.Media) == 0 {
		t.Errorf("repost quoted: %+v", p.Quoted)
	}
}

func TestNormalizeMediaAndTags(t *testing.T) {
	p := Normalize(findItem(t, sampleItems(t), "2102711580479586741", false), received).Post
	if len(p.Media) != 1 || p.Media[0].Type != "video" || !strings.HasPrefix(p.Media[0].URL, "https://video.twimg.com/") {
		t.Errorf("one video, thumbnail folded in: %+v", p.Media)
	}
	if p.Media[0].PosterURL == nil || *p.Media[0].PosterURL != "https://pbs.twimg.com/media/HS5VCTsXIAACId9.jpg" {
		t.Errorf("video poster: %+v", p.Media[0].PosterURL)
	}
	if strings.Join(p.Author.Tags, ",") != "media,featured" {
		t.Errorf("tags: %v", p.Author.Tags)
	}

	odd := Normalize(parseItem(t, `{"tw":"tweet","ti":"2102711510573175177","u":{"s":"x_y","a":"http://evil.example/a.png"},
		"ut":["kol","other","KOL"],"c":{"t":"a &amp; b","m":[{"t":"image","u":"https://evil.example/i.png"},
		{"t":"photo","u":"https://pbs.twimg.com/1.jpg"},{"t":"animated_gif","u":"https://video.twimg.com/g.mp4"},
		{"t":"image","u":"https://pbs.twimg.com/2.jpg"},{"t":"image","u":"https://pbs.twimg.com/3.jpg"},
		{"t":"image","u":"https://pbs.twimg.com/4.jpg"}]}}`), received)
	q := odd.Post
	if odd.Action != ActionPost || q.Author.AvatarURL != nil || q.Author.ID != nil || q.Author.Name != "x_y" ||
		q.Author.Followers != nil || strings.Join(q.Author.Tags, ",") != "kol" || q.Text != "a & b" {
		t.Errorf("odd post: %+v", q)
	}
	if len(q.Media) != 4 || q.Media[0].Type != "image" || q.Media[1].Type != "gif" {
		t.Errorf("media filter/cap: %+v", q.Media)
	}
}

func TestNormalizeVideoPosters(t *testing.T) {
	p := Normalize(parseItem(t, `{"tw":"tweet","ti":"2102711510573175177","u":{"s":"a"},"c":{"t":"x","m":[
		{"t":"image","u":"https://pbs.twimg.com/i.jpg"},
		{"t":"video","u":"https://video.twimg.com/v1.mp4"},{"t":"thumbnail","u":"https://pbs.twimg.com/t1.jpg"},
		{"t":"animated_gif","u":"https://video.twimg.com/g.mp4"},{"t":"thumbnail","u":"https://evil.example/t2.jpg"},
		{"t":"video","u":"https://video.twimg.com/v3.mp4"}]}}`), received).Post
	if len(p.Media) != 4 {
		t.Fatalf("thumbnails must not count as media: %+v", p.Media)
	}
	if p.Media[0].PosterURL != nil {
		t.Errorf("image has no poster: %+v", p.Media[0])
	}
	if p.Media[1].PosterURL == nil || *p.Media[1].PosterURL != "https://pbs.twimg.com/t1.jpg" {
		t.Errorf("video poster: %+v", p.Media[1])
	}
	if p.Media[2].PosterURL != nil || p.Media[3].PosterURL != nil {
		t.Errorf("disallowed host and missing thumbnail leave no poster: %+v %+v", p.Media[2], p.Media[3])
	}

	raw, err := json.Marshal(p.Media)
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"type":"image","url":"https://pbs.twimg.com/i.jpg"},` +
		`{"type":"video","url":"https://video.twimg.com/v1.mp4","posterUrl":"https://pbs.twimg.com/t1.jpg"},` +
		`{"type":"gif","url":"https://video.twimg.com/g.mp4"},{"type":"video","url":"https://video.twimg.com/v3.mp4"}]`
	if string(raw) != want {
		t.Errorf("wire media: got %s, want %s", raw, want)
	}

	bare := post("2102711510573175177")
	bare.Media = []Media{{Type: "video", URL: "https://video.twimg.com/v1.mp4"}}
	withPoster := bare.clone()
	poster := "https://pbs.twimg.com/t1.jpg"
	withPoster.Media = []Media{{Type: "video", URL: "https://video.twimg.com/v1.mp4", PosterURL: &poster}}
	if got, changed := merge(bare, withPoster, true); !changed || got.Media[0].PosterURL == nil {
		t.Errorf("a copy that adds a poster must merge: %+v", got.Media)
	}
	if _, changed := merge(withPoster, bare, true); changed {
		t.Error("a copy without the poster must not drop it")
	}
}

func TestNormalizeSkipsAndRejects(t *testing.T) {
	cases := map[string]struct {
		raw       string
		action    Action
		malformed bool
	}{
		"follow":      {`{"tw":"follow","u":{"s":"a"}}`, ActionSkip, false},
		"unknown":     {`{"tw":"space","ti":"1","u":{"s":"a"}}`, ActionSkip, false},
		"bad id":      {`{"tw":"tweet","ti":"x1","u":{"s":"a"}}`, ActionSkip, true},
		"no handle":   {`{"tw":"tweet","ti":"2102711510573175177","u":{"s":""}}`, ActionSkip, true},
		"odd handle":  {`{"tw":"tweet","ti":"2102711510573175177","u":{"s":"a/b"}}`, ActionSkip, true},
		"delete":      {`{"tw":"delete_post","stw":"repost","ti":"2102707915052511234","u":{"s":"a"}}`, ActionDelete, false},
		"bad delete":  {`{"tw":"delete_post","ti":"","u":{"s":"a"}}`, ActionSkip, true},
		"valid tweet": {`{"tw":"tweet","ti":"2102711510573175177","u":{"s":"a"}}`, ActionPost, false},
	}
	for name, c := range cases {
		r := Normalize(parseItem(t, c.raw), received)
		if r.Action != c.action || r.Malformed != c.malformed {
			t.Errorf("%s: %+v", name, r)
		}
	}
}

func TestPostJSONShape(t *testing.T) {
	p := Normalize(parseItem(t, `{"tw":"tweet","ti":"2102711510573175177","u":{"s":"a"}}`), received).Post
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"id":"2102711510573175177","kind":"tweet","createdAt":"2026-09-23T10:47:45.268Z",` +
		`"receivedAt":"2026-10-13T12:00:00.000Z","url":"https://x.com/a/status/2102711510573175177",` +
		`"author":{"id":null,"handle":"a","name":"a","avatarUrl":null,"followers":null,"tags":[]},` +
		`"text":"","media":[],"quoted":null,"inReplyTo":null,"source":"gmgn"}`
	if string(b) != want {
		t.Errorf("json:\n got %s\nwant %s", b, want)
	}
}

func TestFilter(t *testing.T) {
	f := NewFilter([]string{"kol", " Founder ", ""})
	if !f.Allows([]string{"featured", "KOL"}) || !f.Allows([]string{"founder"}) || f.Allows([]string{"media"}) || f.Allows(nil) {
		t.Error("kol/founder filter")
	}
	if !NewFilter(nil).Allows(nil) {
		t.Error("empty filter keeps everything")
	}
}

func quietLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func drain(sub *Subscriber) []string {
	var out []string
	for {
		select {
		case frame := <-sub.C:
			out = append(out, string(frame))
		default:
			return out
		}
	}
}

func TestIngestSamplesDedupesAndMerges(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 1000, SubBuffer: 1024})
	ingest := NewIngest(store, NewFilter([]string{"kol", "founder"}), quietLog())
	_, sub := store.Subscribe(50)

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
		t.Fatalf("scan samples: %v", err)
	}

	posts := store.Recent(0)
	ids := map[string]bool{}
	for _, p := range posts {
		if ids[p.ID] {
			t.Errorf("duplicate id %s in ring", p.ID)
		}
		ids[p.ID] = true
		if !NewFilter([]string{"kol", "founder"}).Allows(p.Author.Tags) {
			t.Errorf("%s passed the filter with tags %v", p.ID, p.Author.Tags)
		}
	}
	if ids["2102711580479586741"] {
		t.Error("CNN (media/featured only) must be filtered out")
	}
	if !ids["2102711556429824428"] {
		t.Error("founder repost from the token channel must be kept")
	}

	perID := map[string]int{}
	for _, frame := range drain(sub) {
		if !strings.HasPrefix(frame, "event: post\ndata: ") {
			continue
		}
		var p Post
		if err := json.Unmarshal([]byte(strings.TrimSuffix(strings.TrimPrefix(frame, "event: post\ndata: "), "\n\n")), &p); err != nil {
			t.Fatalf("frame json: %v", err)
		}
		perID[p.ID]++
	}
	if perID["2102711510573175177"] != 2 {
		t.Errorf("reply + parent copy should emit twice, got %d", perID["2102711510573175177"])
	}
	if perID["2102711580811219421"] != 2 {
		t.Errorf("quote: first + one richer copy (identical later copy is silent), got %d", perID["2102711580811219421"])
	}
	var reply Post
	for _, p := range posts {
		if p.ID == "2102711510573175177" {
			reply = p
		}
	}
	if reply.InReplyTo == nil || reply.InReplyTo.Handle != "thejesterhead9" {
		t.Errorf("merged reply: %+v", reply.InReplyTo)
	}
	st := store.Stats()
	h := ingest.Health()
	if st.Accepted != uint64(len(posts)) || st.Merged == 0 || st.Duplicates == 0 || h.Counters.Filtered == 0 || h.Counters.Skipped == 0 {
		t.Errorf("stats %+v counters %+v", st, h.Counters)
	}
}

func post(id string) Post {
	return Normalize(gmgn.Item{Type: KindTweet, TweetID: id, User: gmgn.User{Handle: "a"}}, received).Post
}

func TestMergeRules(t *testing.T) {
	base := post("2102711510573175177")
	base.Text = "truncated https://t.co/x…"
	richer := base.clone()
	richer.Text = "full text https://cnn.it/y"
	richer.Media = []Media{{Type: "image", URL: "https://pbs.twimg.com/1.jpg"}}

	if _, changed := merge(base, base.clone(), true); changed {
		t.Error("identical copy must not change")
	}
	if got, changed := merge(base, richer, false); !changed || got.Text != base.Text || len(got.Media) != 1 {
		t.Errorf("non-copy keeps text, adds media: %+v", got)
	}
	if got, changed := merge(base, richer, true); !changed || got.Text != richer.Text {
		t.Errorf("cp=1 copy replaces text: %+v", got)
	}
	empty := base.clone()
	empty.Text = ""
	if _, changed := merge(base, empty, true); changed {
		t.Error("empty copy text never wipes")
	}
	withQuote := base.clone()
	qid := "2101093369720209795"
	withQuote.Quoted = &Quoted{ID: &qid, Author: QuotedAuthor{Handle: "q", Name: "q"}, Text: "t", Media: []Media{}}
	got, changed := merge(base, withQuote, true)
	if !changed || got.Quoted == nil || got.Quoted.Text != "t" {
		t.Errorf("quoted added: %+v", got.Quoted)
	}
	if got.CreatedAt != base.CreatedAt || got.ReceivedAt != base.ReceivedAt || got.Kind != base.Kind {
		t.Error("identity fields must not change")
	}
}

func TestStoreRingDeleteAndLateCopies(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 2, SubBuffer: 8})
	ids := []string{"2102711510573175177", "2102711518970405062", "2102711519142428747"}
	for _, id := range ids {
		if store.Apply(Result{Action: ActionPost, Post: post(id)}) != OutcomeAdded {
			t.Fatalf("add %s", id)
		}
	}
	recent := store.Recent(10)
	if len(recent) != 2 || recent[0].ID != ids[2] || recent[1].ID != ids[1] {
		t.Fatalf("ring newest first: %+v", recent)
	}
	if store.Apply(Result{Action: ActionPost, Post: post(ids[0]), Copy: true}) != OutcomeIgnored {
		t.Error("late copy of an evicted post must not come back")
	}

	snapshot, sub := store.Subscribe(1)
	if !strings.HasPrefix(string(snapshot), "event: snapshot\ndata: {\"posts\":[{\"id\":\""+ids[2]+"\"") {
		t.Errorf("snapshot frame: %s", snapshot)
	}
	if store.Apply(Result{Action: ActionDelete, DeleteID: ids[2]}) != OutcomeDeleted {
		t.Fatal("delete")
	}
	if frames := drain(sub); len(frames) != 1 || frames[0] != "event: delete\ndata: {\"id\":\""+ids[2]+"\"}\n\n" {
		t.Errorf("delete frame: %q", frames)
	}
	if store.Apply(Result{Action: ActionPost, Post: post(ids[2]), Copy: true}) != OutcomeIgnored {
		t.Error("copy of a deleted post must not resurrect it")
	}
	if store.Apply(Result{Action: ActionDelete, DeleteID: "1"}) != OutcomeIgnored {
		t.Error("delete of an unknown id is silent")
	}
	if got := store.Recent(10); len(got) != 1 || got[0].ID != ids[1] {
		t.Errorf("after delete: %+v", got)
	}
}

func TestStoreDropsSlowSubscriber(t *testing.T) {
	store := NewStore(StoreOptions{Capacity: 10, SubBuffer: 1})
	_, slow := store.Subscribe(1)
	store.Apply(Result{Action: ActionPost, Post: post("2102711510573175177")})
	store.Apply(Result{Action: ActionPost, Post: post("2102711518970405062")})
	select {
	case <-slow.Gone():
	default:
		t.Fatal("slow subscriber should be dropped")
	}
	if st := store.Stats(); st.Subscribers != 0 || st.SlowDropped != 1 {
		t.Errorf("stats: %+v", st)
	}
}

func TestSSEFraming(t *testing.T) {
	if got := string(SSE("post", []byte(`{"a":"x\ny"}`))); got != "event: post\ndata: {\"a\":\"x\\ny\"}\n\n" {
		t.Errorf("frame: %q", got)
	}
	b, _ := json.Marshal(Post{Text: "line1\nline2"})
	if strings.Contains(string(b), "\n") {
		t.Error("encoded post must be a single line")
	}
}
