package feed

import "strings"

type Filter struct {
	tags map[string]bool
}

// NewFilter keeps items whose author carries any of tags (case-insensitive). No tags keeps everything.
func NewFilter(tags []string) Filter {
	f := Filter{tags: map[string]bool{}}
	for _, tag := range tags {
		if tag = strings.ToLower(strings.TrimSpace(tag)); tag != "" {
			f.tags[tag] = true
		}
	}
	return f
}

func (f Filter) Allows(itemTags []string) bool {
	if len(f.tags) == 0 {
		return true
	}
	for _, tag := range itemTags {
		if f.tags[strings.ToLower(tag)] {
			return true
		}
	}
	return false
}

// merge folds a later copy of the same post into cur. Identity, kind and timestamps never change; text is taken
// from a cp=1 copy when it differs (gmgn's first copy can hold a truncated text with t.co links and HTML
// entities), media/quoted/reply data only when the copy has more of it (for media: more items, or video posters).
func merge(cur, in Post, isCopy bool) (Post, bool) {
	out := cur.clone()
	changed := false

	if betterText(cur.Text, in.Text, isCopy) {
		out.Text = in.Text
		changed = true
	}
	if richerMedia(cur.Media, in.Media) {
		out.Media = append([]Media{}, in.Media...)
		changed = true
	}
	if in.Quoted != nil {
		if cur.Quoted == nil {
			q := *in.Quoted
			out.Quoted = &q
			changed = true
		} else if q, ok := mergeQuoted(*cur.Quoted, *in.Quoted, isCopy); ok {
			out.Quoted = &q
			changed = true
		}
	}
	if in.InReplyTo != nil && (cur.InReplyTo == nil || (cur.InReplyTo.ID == nil && in.InReplyTo.ID != nil)) {
		r := *in.InReplyTo
		out.InReplyTo = &r
		changed = true
	}
	if cur.Author.ID == nil && in.Author.ID != nil {
		out.Author.ID = in.Author.ID
		changed = true
	}
	if cur.Author.AvatarURL == nil && in.Author.AvatarURL != nil {
		out.Author.AvatarURL = in.Author.AvatarURL
		changed = true
	}
	if cur.Author.Followers == nil && in.Author.Followers != nil {
		out.Author.Followers = in.Author.Followers
		changed = true
	}
	return out, changed
}

func mergeQuoted(cur, in Quoted, isCopy bool) (Quoted, bool) {
	out := cur
	out.Media = append([]Media{}, cur.Media...)
	changed := false
	if betterText(cur.Text, in.Text, isCopy) {
		out.Text = in.Text
		changed = true
	}
	if richerMedia(cur.Media, in.Media) {
		out.Media = append([]Media{}, in.Media...)
		changed = true
	}
	if cur.ID == nil && in.ID != nil {
		out.ID = in.ID
		changed = true
	}
	if cur.Author.Handle == "" && in.Author.Handle != "" {
		out.Author = in.Author
		changed = true
	} else if cur.Author.AvatarURL == nil && in.Author.AvatarURL != nil && cur.Author.Handle == in.Author.Handle {
		out.Author.AvatarURL = in.Author.AvatarURL
		changed = true
	}
	return out, changed
}

// richerMedia prefers more items, then, for the same items, more video posters.
func richerMedia(cur, in []Media) bool {
	if len(in) != len(cur) {
		return len(in) > len(cur)
	}
	return posters(in) > posters(cur)
}

func posters(media []Media) int {
	n := 0
	for _, m := range media {
		if m.PosterURL != nil {
			n++
		}
	}
	return n
}

func betterText(cur, in string, isCopy bool) bool {
	return in != "" && in != cur && (cur == "" || isCopy)
}
