// Package gmgn reads gmgn's public X (Twitter) monitor websocket
// wss://ws.gmgn.ai/v2/ws (channels twitter_monitor_basic, twitter_monitor_token).
//
// Origin: copied from a sibling project's gmgn adapter
// (client.go, flex.go, parse.go, testdata/ws_samples.jsonl at f779b13,
// 2026-10-09, same owner) and trimmed to the stream: no REST search, no
// sibling-project domain types; the wire item is exported as Item for the feed package.
//
// # Transport
//
// TLS is pinned to 1.2: Cloudflare answers 403 to the Go TLS 1.3 hello (and
// to Node). No login is needed; Origin must be https://gmgn.ai. The server
// answers websocket pings, so a failed ping tears the session down, and a read
// that sees nothing for IdleTimeout does the same. Reconnects back off
// exponentially with jitter and reset once a session lived StableAfter.
//
// # Wire format (observed, not documented by gmgn)
//
// Item: tw type (tweet/reply/repost/quote/follow/delete_post), stw deleted
// type, ti tweet id, ts ms, u user {uid,s,n,a,f}, ut tags, c content {t, m
// [{t,u}]}, si/su/sc the parent (replied-to, reposted or quoted post), qi/qu/qc
// a post quoted inside a reply, cp=1 a later, fuller copy of the same item.
// Every field goes through the flex types: one odd item is counted as
// malformed and never fails the frame. A frame above ReadLimit ends the
// session.
package gmgn
