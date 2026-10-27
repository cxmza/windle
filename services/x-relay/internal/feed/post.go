// Package feed turns gmgn items into the XPost shape of packages/shared/src/x-feed.ts, filters them by author
// tag, dedupes and merges copies, and fans the result out to subscribers.
package feed

// JSON field names and nullability mirror the zod schemas in packages/shared/src/x-feed.ts.

type Author struct {
	ID        *string  `json:"id"`
	Handle    string   `json:"handle"`
	Name      string   `json:"name"`
	AvatarURL *string  `json:"avatarUrl"`
	Followers *int64   `json:"followers"`
	Tags      []string `json:"tags"`
}

type Media struct {
	Type string `json:"type"`
	URL  string `json:"url"`
	// PosterURL is the still frame of a video or gif; absent when gmgn sent none.
	PosterURL *string `json:"posterUrl,omitempty"`
}

type QuotedAuthor struct {
	Handle    string  `json:"handle"`
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatarUrl"`
}

type Quoted struct {
	ID     *string      `json:"id"`
	Author QuotedAuthor `json:"author"`
	Text   string       `json:"text"`
	Media  []Media      `json:"media"`
}

type ReplyRef struct {
	ID     *string `json:"id"`
	Handle string  `json:"handle"`
}

type Post struct {
	ID         string    `json:"id"`
	Kind       string    `json:"kind"`
	CreatedAt  string    `json:"createdAt"`
	ReceivedAt string    `json:"receivedAt"`
	URL        string    `json:"url"`
	Author     Author    `json:"author"`
	Text       string    `json:"text"`
	Media      []Media   `json:"media"`
	Quoted     *Quoted   `json:"quoted"`
	InReplyTo  *ReplyRef `json:"inReplyTo"`
	Source     string    `json:"source"`
	// Signals are the crypto signals found in the text (see signals.go); omitted when there are none.
	Signals []string `json:"signals,omitempty"`
}

type Deleted struct {
	ID string `json:"id"`
}

const (
	KindTweet  = "tweet"
	KindReply  = "reply"
	KindQuote  = "quote"
	KindRepost = "repost"
)

var allowedTags = map[string]bool{"kol": true, "founder": true, "featured": true, "media": true}

func (p Post) clone() Post {
	out := p
	out.Author.Tags = append([]string{}, p.Author.Tags...)
	out.Media = append([]Media{}, p.Media...)
	out.Signals = append([]string(nil), p.Signals...)
	if p.Quoted != nil {
		q := *p.Quoted
		q.Media = append([]Media{}, p.Quoted.Media...)
		out.Quoted = &q
	}
	if p.InReplyTo != nil {
		r := *p.InReplyTo
		out.InReplyTo = &r
	}
	return out
}
