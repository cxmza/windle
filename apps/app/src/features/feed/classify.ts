import type { TweetKind } from './types';

const DAY = '(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?';
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const COUNT = String.raw`(?:an?|\d+|one|two|three|four|five|six|seven|ten|few)`;
const UNIT = '(?:hours?|days?|weeks?|months?)';

const re = (source: string) => new RegExp(source, 'i');

const DEADLINE: readonly RegExp[] = [
  re(
    String.raw`\bby\s+(?:the\s+)?(?:end\s+of\s+)?(?:next\s+)?(?:${DAY}|month|week|eod|eow|q[1-4]|\d{1,2}(?:st|nd|rd|th)?\b|${MONTH})`,
  ),
  re(String.raw`\b(?:within|in)\s+(?:the\s+next\s+)?${COUNT}\s+${UNIT}`),
  re(String.raw`\b(?:this|next)\s+(?:week|month|weekend|quarter|${DAY})\b`),
  /\b(?:tomorrow|tonight|today)\b/i,
  /\bend\s+of\s+(?:the\s+)?(?:week|month|quarter|year)\b/i,
  /\b\d{1,2}:\d{2}\s*utc\b/i,
  re(String.raw`\b${DAY}\b`),
];

const COMMIT =
  /\b(?:will|we'll|ships?|shipping|launch(?:es|ing)?|goes?\s+live|goes\s+to\s+mainnet|deploy(?:s|ing)?|releas(?:es|ing)|drops?|lands?|opens?|opening|burns?|listing|listed|mainnet|open[- ]sourc\w+|execut\w+|publish(?:es)?|unlock\w*|confirmed|coming|going\s+to|promise)\b/i;

const STRONG = /\b(?:we\s+will|we'll|promise)\b|\bwill\s+(?:ship|launch|list|deploy|burn|open|release|publish)\b/i;

const PAST =
  /\b(?:shipped|launched|deployed|released|merged|finished|completed|went\s+live|is\s+now\s+live|now\s+live|just\s+(?:shipped|pushed|merged|deployed))\b/i;

const PROGRESS =
  /\b(?:progress|update|wip|testing|working\s+on|in\s+review|fixed|passed|audit\s+(?:complete|done)|devnet|testnet|staging|rc\d?)\b|\b\d{1,3}\s*%|\b\d+\s*\/\s*\d+\b/i;

/** Cheap text heuristic, not a verdict: a dated commitment reads as a promise, a status line as an update. */
export function classifyTweet(text: string): TweetKind {
  const t = text.trim();
  if (t === '' || t.startsWith('@') || /\?\s*$/.test(t)) return 'other';
  if (PAST.test(t)) return 'update';
  if (COMMIT.test(t) && DEADLINE.some((r) => r.test(t))) return 'promise';
  if (STRONG.test(t)) return 'promise';
  if (PROGRESS.test(t)) return 'update';
  return 'other';
}
