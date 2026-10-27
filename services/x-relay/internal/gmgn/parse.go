package gmgn

import (
	"encoding/json"
	"strings"
)

const (
	ChannelBasic = "twitter_monitor_basic"
	ChannelToken = "twitter_monitor_token"
)

var knownChannels = map[string]bool{ChannelBasic: true, ChannelToken: true}

type User struct {
	ID        string
	Handle    string
	Name      string
	Avatar    string
	Followers *int64
}

type Media struct {
	Type string
	URL  string
}

type Content struct {
	Text  string
	Media []Media
}

// Item is one websocket item with every field trimmed; pointers are nil when the field was absent.
type Item struct {
	Channel     string
	Type        string
	DeletedType string
	TweetID     string
	Timestamp   int64
	Copy        bool
	User        User
	Tags        []string
	Content     *Content
	SourceID    string
	SourceUser  *User
	Source      *Content
	QuotedID    string
	QuotedUser  *User
	Quoted      *Content
}

type Frame struct {
	Channel   string
	Items     []Item
	Malformed int
}

type wsEnvelope struct {
	Channel string            `json:"channel"`
	Data    []json.RawMessage `json:"data"`
}

type wsUser struct {
	ID        flexString `json:"uid"`
	Handle    flexString `json:"s"`
	Name      flexString `json:"n"`
	Avatar    flexString `json:"a"`
	Followers *flexInt64 `json:"f"`
}

type wsMedia struct {
	Type flexString `json:"t"`
	URL  flexString `json:"u"`
}

type wsContent struct {
	Text  flexString        `json:"t"`
	Media flexList[wsMedia] `json:"m"`
}

type wsItem struct {
	Type          flexString           `json:"tw"`
	SourceType    flexString           `json:"stw"`
	TweetID       flexString           `json:"ti"`
	Timestamp     flexInt64            `json:"ts"`
	Copy          flexInt64            `json:"cp"`
	User          wsUser               `json:"u"`
	Tags          flexList[flexString] `json:"ut"`
	Content       *wsContent           `json:"c"`
	SourceID      flexString           `json:"si"`
	SourceUser    *wsUser              `json:"su"`
	SourceContent *wsContent           `json:"sc"`
	QuotedID      flexString           `json:"qi"`
	QuotedUser    *wsUser              `json:"qu"`
	QuotedContent *wsContent           `json:"qc"`
}

// ParseFrame decodes one websocket text message. Frames of unknown channels (acks, other feeds) yield no items.
func ParseFrame(data []byte) Frame {
	var envelope wsEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return Frame{Malformed: 1}
	}
	if !knownChannels[envelope.Channel] {
		return Frame{}
	}
	frame := Frame{Channel: envelope.Channel, Items: make([]Item, 0, len(envelope.Data))}
	for _, raw := range envelope.Data {
		var item wsItem
		if err := json.Unmarshal(raw, &item); err != nil {
			frame.Malformed++
			continue
		}
		frame.Items = append(frame.Items, item.export(envelope.Channel))
	}
	return frame
}

func (w *wsItem) export(channel string) Item {
	return Item{
		Channel:     channel,
		Type:        trim(w.Type),
		DeletedType: trim(w.SourceType),
		TweetID:     trim(w.TweetID),
		Timestamp:   int64(w.Timestamp),
		Copy:        w.Copy == 1,
		User:        w.User.export(),
		Tags:        tags(w.Tags),
		Content:     w.Content.export(),
		SourceID:    trim(w.SourceID),
		SourceUser:  w.SourceUser.exportPtr(),
		Source:      w.SourceContent.export(),
		QuotedID:    trim(w.QuotedID),
		QuotedUser:  w.QuotedUser.exportPtr(),
		Quoted:      w.QuotedContent.export(),
	}
}

func (u wsUser) export() User {
	user := User{ID: trim(u.ID), Handle: trim(u.Handle), Name: trim(u.Name), Avatar: trim(u.Avatar)}
	if u.Followers != nil && *u.Followers >= 0 {
		followers := int64(*u.Followers)
		user.Followers = &followers
	}
	return user
}

func (u *wsUser) exportPtr() *User {
	if u == nil {
		return nil
	}
	user := u.export()
	return &user
}

func (c *wsContent) export() *Content {
	if c == nil {
		return nil
	}
	content := Content{Text: strings.TrimSpace(string(c.Text))}
	for _, m := range c.Media {
		if url := trim(m.URL); url != "" {
			content.Media = append(content.Media, Media{Type: trim(m.Type), URL: url})
		}
	}
	return &content
}

func tags(values []flexString) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if v := trim(value); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func trim(s flexString) string { return strings.TrimSpace(string(s)) }
