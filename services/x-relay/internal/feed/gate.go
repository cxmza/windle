package feed

import (
	"strings"
	"time"
)

const (
	ModeCrypto = "crypto"
	ModeSignal = "signal"
	ModeAll    = "all"

	DefaultMinText      = 25
	DefaultAuthorMax    = 3
	DefaultAuthorWindow = 5 * time.Minute

	// Gate reasons, the keys of Stats.Gated.
	GatedDenied = "denied"
	GatedReply  = "reply"
	GatedShort  = "short"
	GatedNoSig  = "no_signal"
	GatedAuthor = "author_rate"

	authorSweepAt = 4096
)

type GateOptions struct {
	// Mode "crypto" applies the relevance rules below; "signal" additionally requires a signal on every post;
	// "all" keeps everything except denied authors.
	Mode string
	// Deny drops every post of these handles (case-insensitive, a leading @ is ignored), in every mode.
	Deny []string
	// MinText is the minimum substanceLen of a post's text (of the original for a repost).
	MinText int
	// AuthorMax posts of one author per AuthorWindow pass the gate; 0 disables the limit.
	AuthorMax    int
	AuthorWindow time.Duration
}

// Gate decides whether a post is shown in the feed. It is not safe for concurrent use; the store calls it under
// its lock. In crypto (and signal) mode, in this order:
//  1. a reply passes only with a signal;
//  2. a post passes only with substance: MinText of text without @mentions and links (for a repost, of the
//     original), or a signal together with media or a substantial quoted original;
//  3. at most AuthorMax shown posts per author per AuthorWindow.
//
// Signal mode drops every post without a signal after step 1.
type Gate struct {
	opts   GateOptions
	deny   map[string]bool
	shown  map[string][]time.Time
	sweeps int
}

func NewGate(opts GateOptions) *Gate {
	if opts.Mode != ModeAll && opts.Mode != ModeSignal {
		opts.Mode = ModeCrypto
	}
	if opts.MinText <= 0 {
		opts.MinText = DefaultMinText
	}
	if opts.AuthorWindow <= 0 {
		opts.AuthorWindow = DefaultAuthorWindow
	}
	g := &Gate{opts: opts, deny: map[string]bool{}, shown: map[string][]time.Time{}}
	for _, h := range opts.Deny {
		if h = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(h), "@")); h != "" {
			g.deny[h] = true
		}
	}
	return g
}

// Decide returns "" to show the post (and counts it against the author's limit) or the reason to drop it.
// p.Signals must already be set.
func (g *Gate) Decide(p Post, now time.Time) string {
	author := strings.ToLower(p.Author.Handle)
	if g.deny[author] {
		return GatedDenied
	}
	if g.opts.Mode == ModeAll {
		return ""
	}
	signal := len(p.Signals) > 0
	if p.Kind == KindReply && !signal {
		return GatedReply
	}
	if g.opts.Mode == ModeSignal && !signal {
		return GatedNoSig
	}
	if !g.substantial(p, signal) {
		return GatedShort
	}
	if g.opts.AuthorMax > 0 {
		recent := g.recent(author, now)
		if len(recent) >= g.opts.AuthorMax {
			return GatedAuthor
		}
		g.shown[author] = append(recent, now)
	}
	return ""
}

func (g *Gate) substantial(p Post, signal bool) bool {
	text := p.Text
	if p.Kind == KindRepost && p.Quoted != nil {
		text = p.Quoted.Text
	}
	if substanceLen(text) >= g.opts.MinText {
		return true
	}
	if !signal {
		return false
	}
	if len(p.Media) > 0 {
		return true
	}
	return p.Quoted != nil && (len(p.Quoted.Media) > 0 || substanceLen(p.Quoted.Text) >= g.opts.MinText)
}

// recent returns the author's shown times still inside the window; now and then it drops idle authors.
func (g *Gate) recent(author string, now time.Time) []time.Time {
	cutoff := now.Add(-g.opts.AuthorWindow)
	if g.sweeps++; g.sweeps >= authorSweepAt {
		g.sweeps = 0
		for a, times := range g.shown {
			if len(times) == 0 || !times[len(times)-1].After(cutoff) {
				delete(g.shown, a)
			}
		}
	}
	times := g.shown[author]
	i := 0
	for i < len(times) && !times[i].After(cutoff) {
		i++
	}
	return append([]time.Time(nil), times[i:]...)
}
