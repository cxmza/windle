package feed

import (
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"windle.fun/x-relay/internal/gmgn"
)

const (
	twitterEpochMilli = 1288834974657
	snowflakeShift    = 22

	maxTextRunes = 4000
	maxNameRunes = 100
	maxMedia     = 4
	maxURLBytes  = 1024
	sourceGmgn   = "gmgn"
)

var (
	tweetIDPattern = regexp.MustCompile(`^\d{1,20}$`)
	handlePattern  = regexp.MustCompile(`^[A-Za-z0-9_]{1,50}$`)
	// The app's CSP allows exactly these hosts for hotlinked avatars and media; anything else is dropped here.
	mediaHosts = map[string]bool{"pbs.twimg.com": true, "video.twimg.com": true}
)

type Action uint8

const (
	ActionSkip Action = iota
	ActionPost
	ActionDelete
)

type Result struct {
	Action Action
	Post   Post
	// Copy is gmgn's cp=1: a later, usually fuller copy of an item already sent.
	Copy     bool
	DeleteID string
	// Malformed marks an item of a supported kind that could not be turned into a valid post.
	Malformed bool
}

// TweetTime derives the creation time from a snowflake id (ms precision).
func TweetTime(id string) (time.Time, bool) {
	if !tweetIDPattern.MatchString(id) {
		return time.Time{}, false
	}
	n, err := strconv.ParseUint(id, 10, 64)
	if err != nil || n == 0 {
		return time.Time{}, false
	}
	return time.UnixMilli(int64(n>>snowflakeShift) + twitterEpochMilli).UTC(), true
}

func FormatTime(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// Normalize maps one gmgn item to a post, a delete or nothing (follows, unknown kinds).
func Normalize(item gmgn.Item, receivedAt time.Time) Result {
	switch item.Type {
	case "delete_post":
		if !tweetIDPattern.MatchString(item.TweetID) {
			return Result{Malformed: true}
		}
		return Result{Action: ActionDelete, DeleteID: item.TweetID, Copy: item.Copy}
	case KindTweet, KindReply, KindQuote, KindRepost:
	default:
		return Result{}
	}

	created, ok := TweetTime(item.TweetID)
	if !ok || !handlePattern.MatchString(item.User.Handle) {
		return Result{Malformed: true}
	}

	post := Post{
		ID:         item.TweetID,
		Kind:       item.Type,
		CreatedAt:  FormatTime(created),
		ReceivedAt: FormatTime(receivedAt),
		URL:        "https://x.com/" + item.User.Handle + "/status/" + item.TweetID,
		Author:     author(item.User, item.Tags),
		Media:      []Media{},
		Source:     sourceGmgn,
	}
	if item.Type != KindRepost {
		post.Text = text(item.Content)
		post.Media = media(item.Content)
	}

	switch item.Type {
	case KindReply:
		post.InReplyTo = replyRef(item.SourceID, item.SourceUser)
		post.Quoted = quoted(item.QuotedID, item.QuotedUser, item.Quoted)
	case KindQuote, KindRepost:
		post.Quoted = quoted(item.SourceID, item.SourceUser, item.Source)
		if post.Quoted == nil {
			post.Quoted = quoted(item.QuotedID, item.QuotedUser, item.Quoted)
		}
	default:
		post.Quoted = quoted(item.QuotedID, item.QuotedUser, item.Quoted)
	}
	return Result{Action: ActionPost, Post: post, Copy: item.Copy}
}

func author(u gmgn.User, rawTags []string) Author {
	a := Author{
		Handle:    u.Handle,
		Name:      name(u.Name, u.Handle),
		AvatarURL: avatarURL(u.Avatar),
		Followers: u.Followers,
		Tags:      []string{},
	}
	if u.ID != "" {
		id := u.ID
		a.ID = &id
	}
	seen := map[string]bool{}
	for _, tag := range rawTags {
		tag = strings.ToLower(tag)
		if allowedTags[tag] && !seen[tag] {
			seen[tag] = true
			a.Tags = append(a.Tags, tag)
		}
	}
	return a
}

func quoted(id string, user *gmgn.User, content *gmgn.Content) *Quoted {
	q := Quoted{ID: optionalID(id), Text: text(content), Media: media(content)}
	if user != nil && handlePattern.MatchString(user.Handle) {
		q.Author = QuotedAuthor{Handle: user.Handle, Name: name(user.Name, user.Handle), AvatarURL: avatarURL(user.Avatar)}
	}
	if q.ID == nil && q.Author.Handle == "" && q.Text == "" && len(q.Media) == 0 {
		return nil
	}
	return &q
}

func replyRef(id string, user *gmgn.User) *ReplyRef {
	if user == nil || !handlePattern.MatchString(user.Handle) {
		return nil
	}
	return &ReplyRef{ID: optionalID(id), Handle: user.Handle}
}

func text(c *gmgn.Content) string {
	if c == nil {
		return ""
	}
	return truncate(strings.TrimSpace(html.UnescapeString(c.Text)), maxTextRunes)
}

// media keeps the allowed images, videos and gifs. gmgn sends a video's poster as a separate "thumbnail" entry;
// the n-th thumbnail becomes posterUrl of the n-th video or gif.
func media(c *gmgn.Content) []Media {
	out := []Media{}
	if c == nil {
		return out
	}
	var posters []string
	moving := map[int]int{} // source ordinal of a video/gif -> its index in out
	ordinal := 0
	for _, m := range c.Media {
		if strings.EqualFold(m.Type, "thumbnail") {
			u, _ := allowedURL(m.URL)
			posters = append(posters, u)
			continue
		}
		kind, ok := mediaKind(m.Type)
		if !ok {
			continue
		}
		if kind != "image" {
			ordinal++
		}
		u, ok := allowedURL(m.URL)
		if !ok || len(out) == maxMedia {
			continue
		}
		if kind != "image" {
			moving[ordinal-1] = len(out)
		}
		out = append(out, Media{Type: kind, URL: u})
	}
	for ord, idx := range moving {
		if ord < len(posters) && posters[ord] != "" {
			poster := posters[ord]
			out[idx].PosterURL = &poster
		}
	}
	return out
}

func mediaKind(raw string) (string, bool) {
	switch strings.ToLower(raw) {
	case "image", "photo":
		return "image", true
	case "video":
		return "video", true
	case "gif", "animated_gif":
		return "gif", true
	default:
		return "", false
	}
}

func allowedURL(raw string) (string, bool) {
	if raw == "" || len(raw) > maxURLBytes {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || !mediaHosts[u.Hostname()] || u.User != nil || u.Port() != "" {
		return "", false
	}
	return u.String(), true
}

func avatarURL(raw string) *string {
	u, ok := allowedURL(raw)
	if !ok {
		return nil
	}
	u = smallAvatar(u)
	return &u
}

func optionalID(id string) *string {
	if !tweetIDPattern.MatchString(id) {
		return nil
	}
	return &id
}

func name(n, handle string) string {
	n = strings.TrimSpace(html.UnescapeString(n))
	if n == "" {
		return handle
	}
	return truncate(n, maxNameRunes)
}

func truncate(s string, max int) string {
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "�")
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	return string(runes[:max])
}
