package feed

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestSignals(t *testing.T) {
	cases := []struct {
		text, quoted string
		want         []string
	}{
		{"buying more $SOL here", "", []string{SignalCashtag, SignalKeyword}},
		{"$WIF to the moon", "", []string{SignalCashtag}},
		{"paid $100 for dinner", "", []string{}},
		{"US$ABC is not a cashtag", "", []string{}},
		{"7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr is live", "", []string{SignalCASol}},
		{"https://pump.fun/coin/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "", []string{SignalCASol, SignalLink}},
		{"antidisestablishmentarianismxyzabc words", "", []string{}},
		{"0x6982508145454Ce325dDbE47a25d4ec3d2311933 pepe", "", []string{SignalCAEVM}},
		{"tx 0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060", "", []string{}},
		{"chart: dexscreener.com/solana/abc", "", []string{SignalLink, SignalKeyword}},
		{"see https://www.birdeye.so/token/x", "", []string{SignalLink, SignalKeyword}},
		{"notpump.funny.example", "", []string{}},
		{"the solution is consolidation", "", []string{}},
		{"Ethan said hi", "", []string{}},
		{"Sol is pumping", "", []string{SignalKeyword}},
		{"#solana summer", "", []string{SignalKeyword}},
		{"we ship the roadmap next week", "", []string{SignalKeyword}},
		{"relationship advice", "", []string{}},
		{"Mainnet launched today", "", []string{SignalKeyword}},
		{"CA: soon", "", []string{SignalKeyword}},
		{"ca va bien", "", []string{}},
		{"on-chain data looks good", "", []string{SignalKeyword}},
		{"币安上线新项目", "", []string{SignalKeyword}},
		{"中秋快乐～", "", []string{}},
		{"look at this", "Airdrop checker is live", []string{SignalKeyword}},
	}
	for _, c := range cases {
		p := post("2102711510573175177")
		p.Text = c.text
		if c.quoted != "" {
			p.Quoted = &Quoted{Text: c.quoted, Media: []Media{}}
		}
		if got := Signals(p); !reflect.DeepEqual(got, c.want) {
			t.Errorf("Signals(%q, %q) = %v, want %v", c.text, c.quoted, got, c.want)
		}
	}
}

func TestSubstanceLen(t *testing.T) {
	if n := substanceLen("@a @bb_c   hello   https://t.co/xyz  world "); n != len("hello world") {
		t.Errorf("latin: %d", n)
	}
	if n := substanceLen("复合型亏损"); n != 10 {
		t.Errorf("cjk counts double: %d", n)
	}
}

func gatePost(kind, text string) Post {
	p := post("2102711510573175177")
	p.Kind = kind
	p.Text = text
	p.Signals = Signals(p)
	return p
}

func TestGateCrypto(t *testing.T) {
	now := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	g := NewGate(GateOptions{Deny: []string{"@SpamBot"}, AuthorMax: 100})
	long := "a perfectly ordinary sentence that is long enough"

	withMedia := gatePost(KindTweet, "$SOL 🚀")
	withMedia.Media = []Media{{Type: "image", URL: "https://pbs.twimg.com/media/a.jpg"}}
	repost := gatePost(KindRepost, "")
	repost.Quoted = &Quoted{Text: long, Media: []Media{}}
	shortQuote := gatePost(KindQuote, "👀")
	shortQuote.Quoted = &Quoted{Text: "Mainnet is live, migrate your tokens before Friday", Media: []Media{}}
	shortQuote.Signals = Signals(shortQuote)
	denied := gatePost(KindTweet, long)
	denied.Author.Handle = "spambot"

	cases := []struct {
		name string
		p    Post
		want string
	}{
		{"long tweet without signal", gatePost(KindTweet, long), ""},
		{"short tweet", gatePost(KindTweet, "gm frens"), GatedShort},
		{"mentions and links do not count", gatePost(KindTweet, "@a @b @c https://t.co/abcdefghij nice"), GatedShort},
		{"reply without signal", gatePost(KindReply, long), GatedReply},
		{"reply with signal", gatePost(KindReply, "the token unlock schedule is out, read the docs"), ""},
		{"short reply with signal", gatePost(KindReply, "$SOL"), GatedShort},
		{"short with media and signal", withMedia, ""},
		{"repost measured by the original", repost, ""},
		{"short quote with signal and substantial original", shortQuote, ""},
		{"denied author", denied, GatedDenied},
	}
	for _, c := range cases {
		if got := g.Decide(c.p, now); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}

	strict := NewGate(GateOptions{Mode: ModeSignal})
	if got := strict.Decide(gatePost(KindTweet, long), now); got != GatedNoSig {
		t.Errorf("signal mode drops a post without a signal: %q", got)
	}
	if got := strict.Decide(gatePost(KindTweet, "the token unlock schedule is out, read the docs"), now); got != "" {
		t.Errorf("signal mode keeps a post with one: %q", got)
	}

	all := NewGate(GateOptions{Mode: ModeAll, Deny: []string{"spambot"}})
	if got := all.Decide(gatePost(KindReply, "ok"), now); got != "" {
		t.Errorf("mode all keeps everything: %q", got)
	}
	if got := all.Decide(denied, now); got != GatedDenied {
		t.Errorf("mode all still denies: %q", got)
	}
}

func TestGateAuthorRate(t *testing.T) {
	g := NewGate(GateOptions{AuthorMax: 3, AuthorWindow: 5 * time.Minute})
	start := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	p := gatePost(KindTweet, strings.Repeat("words ", 10))
	for i := range 3 {
		if got := g.Decide(p, start.Add(time.Duration(i)*time.Minute)); got != "" {
			t.Fatalf("post %d: %q", i, got)
		}
	}
	if got := g.Decide(p, start.Add(4*time.Minute)); got != GatedAuthor {
		t.Errorf("4th within the window: %q", got)
	}
	other := p
	other.Author.Handle = "b"
	if got := g.Decide(other, start.Add(4*time.Minute)); got != "" {
		t.Errorf("other author: %q", got)
	}
	if got := g.Decide(p, start.Add(5*time.Minute+time.Second)); got != "" {
		t.Errorf("first post left the window: %q", got)
	}
	if got := NewGate(GateOptions{AuthorMax: 0}).Decide(p, start); got != "" {
		t.Errorf("limit 0 disables: %q", got)
	}
}

func TestSmallAvatar(t *testing.T) {
	cases := map[string]string{
		"https://pbs.twimg.com/profile_images/1932105171443859456/Gjhd9qC6_400x400.jpg": "https://pbs.twimg.com/profile_images/1932105171443859456/Gjhd9qC6_bigger.jpg",
		"https://pbs.twimg.com/profile_images/1/a_normal.png":                           "https://pbs.twimg.com/profile_images/1/a_bigger.png",
		"https://pbs.twimg.com/profile_images/1/a_400x400":                              "https://pbs.twimg.com/profile_images/1/a_bigger",
		"https://pbs.twimg.com/profile_images/1/a.jpg":                                  "https://pbs.twimg.com/profile_images/1/a.jpg",
		"https://pbs.twimg.com/media/Gx_400x400.jpg":                                    "https://pbs.twimg.com/media/Gx_400x400.jpg",
	}
	for in, want := range cases {
		if got := smallAvatar(in); got != want {
			t.Errorf("smallAvatar(%s) = %s, want %s", in, got, want)
		}
	}
	item := findItem(t, sampleItems(t), "2102711510573175177", true)
	p := Normalize(item, received).Post
	if !strings.HasSuffix(*p.Author.AvatarURL, "_bigger.jpg") {
		t.Errorf("normalized avatar: %s", *p.Author.AvatarURL)
	}
}
