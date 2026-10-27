package gmgn

import (
	"bufio"
	"os"
	"testing"
)

func loadSamples(t *testing.T) [][]byte {
	t.Helper()
	f, err := os.Open("testdata/ws_samples.jsonl")
	if err != nil {
		t.Fatalf("open samples: %v", err)
	}
	defer f.Close()
	var lines [][]byte
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		lines = append(lines, append([]byte{}, scanner.Bytes()...))
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan samples: %v", err)
	}
	return lines
}

func TestParseSamples(t *testing.T) {
	lines := loadSamples(t)
	if len(lines) != 60 {
		t.Fatalf("samples: got %d lines, want 60", len(lines))
	}
	items, copies, basic, token := 0, 0, 0, 0
	for _, line := range lines {
		frame := ParseFrame(line)
		if frame.Malformed != 0 {
			t.Fatalf("malformed frame: %s", line)
		}
		switch frame.Channel {
		case ChannelBasic:
			basic++
		case ChannelToken:
			token++
		default:
			t.Fatalf("unexpected channel %q", frame.Channel)
		}
		for _, item := range frame.Items {
			items++
			if item.Copy {
				copies++
			}
			if item.Type == "" || item.User.Handle == "" {
				t.Errorf("item without type/handle: %+v", item)
			}
		}
	}
	if items != 62 || copies != 36 || basic != 57 || token != 3 {
		t.Fatalf("items=%d copies=%d basic=%d token=%d", items, copies, basic, token)
	}
}

func TestParseFields(t *testing.T) {
	frame := ParseFrame([]byte(`{"channel":"twitter_monitor_basic","data":[{"tw":"reply","ti":"2102711510573175177","cp":1,"ts":"1790160465268",
		"u":{"uid":217856128,"s":" djcows ","n":"dj","a":"https://pbs.twimg.com/a.jpg","f":"25879"},"ut":["kol",""],
		"c":{"t":" hi ","m":[{"t":"image","u":"https://pbs.twimg.com/m.jpg"},{"t":"image","u":""}]},
		"si":"1","su":{"s":"parent"},"sc":{"t":"parent text"}}]}`))
	if len(frame.Items) != 1 {
		t.Fatalf("items: %+v", frame)
	}
	it := frame.Items[0]
	if it.Type != "reply" || it.TweetID != "2102711510573175177" || it.Timestamp != 1790160465268 || !it.Copy {
		t.Errorf("scalars: %+v", it)
	}
	if it.User.ID != "217856128" || it.User.Handle != "djcows" || it.User.Followers == nil || *it.User.Followers != 25879 {
		t.Errorf("user: %+v", it.User)
	}
	if len(it.Tags) != 1 || it.Tags[0] != "kol" {
		t.Errorf("tags: %v", it.Tags)
	}
	if it.Content == nil || it.Content.Text != "hi" || len(it.Content.Media) != 1 {
		t.Errorf("content: %+v", it.Content)
	}
	if it.SourceID != "1" || it.SourceUser == nil || it.SourceUser.Handle != "parent" || it.Source.Text != "parent text" {
		t.Errorf("source: %+v %+v %+v", it.SourceID, it.SourceUser, it.Source)
	}
	if it.Quoted != nil || it.QuotedUser != nil {
		t.Errorf("quoted should be absent")
	}
}

func TestParseRejectsGarbage(t *testing.T) {
	if f := ParseFrame([]byte(`not json`)); f.Malformed != 1 {
		t.Errorf("garbage: %+v", f)
	}
	if f := ParseFrame([]byte(`{"channel":"other","data":[{}]}`)); len(f.Items) != 0 || f.Malformed != 0 {
		t.Errorf("unknown channel: %+v", f)
	}
	if f := ParseFrame([]byte(`{"channel":"twitter_monitor_basic","data":[1,{"tw":"tweet"}]}`)); f.Malformed != 1 || len(f.Items) != 1 {
		t.Errorf("one bad item: %+v", f)
	}
}
