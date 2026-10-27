package feed

import (
	"regexp"
	"strings"
	"unicode"
)

// Signal names of Post.Signals, in this order. Mirrored by X_SIGNALS in packages/shared/src/x-feed.ts.
const (
	SignalCashtag = "cashtag"
	SignalCASol   = "ca_sol"
	SignalCAEVM   = "ca_evm"
	SignalLink    = "link"
	SignalKeyword = "keyword"
)

// A keyword boundary is any rune that is not a letter, digit or underscore (Unicode-aware, so "sol" does not
// match inside "solution" or "consol", nor "eth" inside "Ethan"). RE2 has no lookaround; the boundary rune is
// consumed, which is fine for a yes/no match.
const (
	kwBefore = `(?:^|[^\p{L}\p{N}_])`
	kwAfter  = `(?:$|[^\p{L}\p{N}_])`
)

var (
	cashtagPattern = regexp.MustCompile(`(?:^|[^\w$])\$[A-Za-z]{2,10}\b`)
	// Base58 run of 32..44 chars bounded by non-alphanumerics; candidates are then required to mix digits, upper
	// and lower case (a real address almost always does; a long plain word never does).
	solCAPattern = regexp.MustCompile(`(?:^|[^0-9A-Za-z])([1-9A-HJ-NP-Za-km-z]{32,44})(?:$|[^0-9A-Za-z])`)
	// 40 hex digits exactly: a 64-digit tx hash fails the trailing \b.
	evmCAPattern = regexp.MustCompile(`\b0[xX][0-9a-fA-F]{40}\b`)
	linkPattern  = regexp.MustCompile(`(?i)(?:^|[^a-z0-9.-])(?:https?://)?(?:[a-z0-9-]+\.)*` +
		`(?:pump\.fun|dexscreener\.com|solscan\.io|etherscan\.io|birdeye\.so|jup\.ag|gmgn\.ai|raydium\.io|` +
		`basescan\.org|bscscan\.com)(?:$|[^a-z0-9-])`)
	keywordPattern = regexp.MustCompile(`(?i)` + kwBefore + `(?:` + strings.Join([]string{
		`airdrops?`, `mainnet`, `launch(?:es|ed|ing)?`, `tokens?`, `tokenomics`, `tvl`, `stablecoins?`, `on-?chain`,
		`devnet`, `testnet`, `ship(?:s|ped|ping)?`, `roadmap`, `contracts?`, `listings?`, `presale`,
		`mint(?:s|ed|ing)?`, `staking`, `validators?`, `solana`, `sol`, `eth`, `ethereum`, `btc`, `bitcoin`, `defi`,
		`memecoins?`, `altcoins?`, `crypto`, `blockchain`, `web3`, `nfts?`, `dex`, `tge`, `whitelist`, `ido`,
		`liquidity`, `usdc`, `usdt`, `bnb`, `rollups?`,
	}, "|") + `)` + kwAfter)
	// "CA" (contract address) only in capitals: lower-case "ca" is a common word in several languages.
	caKeywordPattern = regexp.MustCompile(kwBefore + `CA` + kwAfter)
	// CJK has no word boundaries; these are crypto-specific enough to match as substrings.
	cjkKeywordPattern = regexp.MustCompile(`空投|主网|代币|合约|链上|质押|上币|比特币|以太坊|币安|测试网|预售|发币|公链|上线|币`)

	mentionPattern = regexp.MustCompile(`@[A-Za-z0-9_]{1,15}`)
	urlPattern     = regexp.MustCompile(`(?i)\bhttps?://\S+`)
)

// Signals lists the crypto signals found in the post's own text and in the quoted/reposted original.
// It never returns nil.
func Signals(p Post) []string {
	text := p.Text
	if p.Quoted != nil && p.Quoted.Text != "" {
		text += "\n" + p.Quoted.Text
	}
	out := []string{}
	if cashtagPattern.MatchString(text) {
		out = append(out, SignalCashtag)
	}
	if hasSolanaAddress(text) {
		out = append(out, SignalCASol)
	}
	if evmCAPattern.MatchString(text) {
		out = append(out, SignalCAEVM)
	}
	if linkPattern.MatchString(text) {
		out = append(out, SignalLink)
	}
	if keywordPattern.MatchString(text) || caKeywordPattern.MatchString(text) || cjkKeywordPattern.MatchString(text) {
		out = append(out, SignalKeyword)
	}
	return out
}

func hasSolanaAddress(text string) bool {
	for _, m := range solCAPattern.FindAllStringSubmatch(text, -1) {
		var digit, upper, lower bool
		for _, r := range m[1] {
			switch {
			case r >= '0' && r <= '9':
				digit = true
			case r >= 'A' && r <= 'Z':
				upper = true
			default:
				lower = true
			}
		}
		if digit && upper && lower {
			return true
		}
	}
	return false
}

// substanceLen measures text without @mentions and links. CJK runes count double: they carry roughly twice the
// content of a Latin letter, so a 13-character Chinese sentence weighs like a 26-letter English one.
func substanceLen(s string) int {
	s = urlPattern.ReplaceAllString(s, " ")
	s = mentionPattern.ReplaceAllString(s, " ")
	s = strings.Join(strings.Fields(s), " ")
	n := 0
	for _, r := range s {
		if unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) {
			n += 2
		} else {
			n++
		}
	}
	return n
}

var profileImageSize = regexp.MustCompile(`_(?:normal|bigger|mini|x96|200x200|400x400)(\.[A-Za-z0-9]+)?$`)

// smallAvatar rewrites a pbs.twimg.com profile image to its 73x73 `_bigger` variant (the app draws avatars at
// 32 px; `_400x400` costs ~3x the bytes). Other URLs pass through.
func smallAvatar(u string) string {
	const prefix = "https://pbs.twimg.com/profile_images/"
	if !strings.HasPrefix(u, prefix) || strings.ContainsAny(u, "?#") {
		return u
	}
	return profileImageSize.ReplaceAllString(u, "_bigger$1")
}
