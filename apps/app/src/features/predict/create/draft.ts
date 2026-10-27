import {
  ApiImage,
  type ApiMarket,
  type CreateMarketRequest,
  DURATION_PRESET_IDS,
  type DurationPresetId,
  type ParsedTweetUrl,
  parseTweetUrl,
  TweetSnapshot,
} from '@windle/shared';

export const STEPS = ['Tweet', 'Market', 'Review'] as const;
export type StepIndex = 0 | 1 | 2;

export type FieldKey = 'url' | 'image' | 'projectName' | 'ticker' | 'mint' | 'statement' | 'criteria' | 'deadline';
export type Errors = Partial<Record<FieldKey, string>>;

export const FIELD_STEP: Record<FieldKey, StepIndex> = {
  url: 0,
  image: 1,
  projectName: 1,
  ticker: 1,
  mint: 1,
  statement: 1,
  criteria: 1,
  deadline: 1,
};

export const LIMITS = {
  statement: { min: 10, max: 200 },
  criteria: { min: 10, max: 800 },
  name: { min: 2, max: 40 },
  odds: { min: 5, max: 95 },
} as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_DEADLINE_DAYS = 365;

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TICKER = /^[A-Z0-9]{2,10}$/;

export type Duration = DurationPresetId | 'custom';

export const DEFAULT_DURATION: Duration = 'day';

export interface Draft {
  step: StepIndex;
  url: string;
  tweet: TweetSnapshot | null;
  projectName: string;
  ticker: string;
  mint: string;
  /** Uploaded already (the dropzone sends it on pick), so the draft holds the stored image, not a file. */
  image: ApiImage | null;
  statement: string;
  statementTouched: boolean;
  criteria: string;
  duration: Duration;
  deadlineDate: string;
  deadlineTime: string;
  oddsPct: number;
}

export const emptyDraft = (): Draft => ({
  step: 0,
  url: '',
  tweet: null,
  projectName: '',
  ticker: '',
  mint: '',
  image: null,
  statement: '',
  statementTouched: false,
  criteria: '',
  duration: DEFAULT_DURATION,
  deadlineDate: '',
  deadlineTime: '',
  oddsPct: 50,
});

export const isBlank = (d: Draft): boolean =>
  !d.url &&
  !d.projectName &&
  !d.ticker &&
  !d.mint &&
  !d.image &&
  !d.statement &&
  !d.criteria &&
  !d.deadlineDate &&
  !d.deadlineTime &&
  d.duration === DEFAULT_DURATION &&
  d.oddsPct === 50;

export const normalizeTicker = (raw: string): string => raw.trim().replace(/^\$/, '').toUpperCase();

export const isMint = (raw: string): boolean => MINT.test(raw.trim());

const pad = (n: number): string => String(n).padStart(2, '0');

export function toInputs(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Deadline `days` from now, at the current time of day, in local time. */
export function presetDeadline(days: number, now: number): { deadlineDate: string; deadlineTime: string } {
  const { date, time } = toInputs(now + days * DAY_MS);
  return { deadlineDate: date, deadlineTime: time };
}

export function deadlineMs(d: Pick<Draft, 'deadlineDate' | 'deadlineTime'>): number | null {
  if (!d.deadlineDate || !d.deadlineTime) return null;
  const ms = new Date(`${d.deadlineDate}T${d.deadlineTime}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function dateBounds(now: number): { min: string; max: string } {
  return { min: toInputs(now).date, max: toInputs(now + MAX_DEADLINE_DAYS * DAY_MS).date };
}

export function timeZoneLabel(now: number): string {
  const offset = -new Date(now).getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = '';
  }
  const utc = `UTC${sign}${hh}${mm ? `:${pad(mm)}` : ''}`;
  return zone ? `${zone} (${utc})` : utc;
}

/** First sentence of the tweet without links, as a starting point the user is expected to edit. */
export function suggestStatement(text: string): string {
  const clean = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const first = clean.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? clean;
  const max = LIMITS.statement.max;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

export function existingMarketFor(markets: readonly ApiMarket[], tweetId: string | undefined): ApiMarket | undefined {
  return tweetId === undefined ? undefined : markets.find((m) => m.source?.id === tweetId);
}

export function parseUrl(url: string): ParsedTweetUrl | null {
  return url.trim() ? parseTweetUrl(url) : null;
}

export function validateTweetStep(d: Draft): Errors {
  const parsed = parseUrl(d.url);
  if (!parsed) return { url: 'Paste the link to a tweet.' };
  if (!parsed.ok) return { url: parsed.message };
  if (!d.tweet || d.tweet.id !== parsed.statusId) return { url: 'Wait for the tweet to load, or paste another link.' };
  return {};
}

export function validateMarketStep(d: Draft, now: number): Errors {
  const errors: Errors = {};
  const name = d.projectName.trim();
  if (name.length < LIMITS.name.min || name.length > LIMITS.name.max)
    errors.projectName = `Enter the project name, ${LIMITS.name.min}–${LIMITS.name.max} characters.`;
  if (!TICKER.test(normalizeTicker(d.ticker))) errors.ticker = 'Use 2–10 letters or digits, for example GLOW.';
  if (d.mint.trim() && !isMint(d.mint)) errors.mint = 'That is not a token mint: expected 32–44 base58 characters.';
  const statement = d.statement.trim();
  if (statement.length < LIMITS.statement.min) errors.statement = `Write at least ${LIMITS.statement.min} characters.`;
  else if (statement.length > LIMITS.statement.max)
    errors.statement = `Keep it to ${LIMITS.statement.max} characters or fewer.`;
  const criteria = d.criteria.trim();
  if (criteria.length < LIMITS.criteria.min) errors.criteria = `Write at least ${LIMITS.criteria.min} characters.`;
  else if (criteria.length > LIMITS.criteria.max)
    errors.criteria = `Keep it to ${LIMITS.criteria.max} characters or fewer.`;
  if (d.duration === 'custom') {
    const at = deadlineMs(d);
    if (at === null) errors.deadline = 'Pick a date and a time.';
    else if (at < now + HOUR_MS) errors.deadline = 'The deadline must be at least one hour from now.';
    else if (at > now + MAX_DEADLINE_DAYS * DAY_MS) errors.deadline = 'The deadline must be within a year.';
  }
  return errors;
}

export const validateAll = (d: Draft, now: number): Errors => ({
  ...validateTweetStep(d),
  ...validateMarketStep(d, now),
});

export function buildInput(d: Draft): CreateMarketRequest | null {
  if (!d.tweet) return null;
  const at = deadlineMs(d);
  if (d.duration === 'custom' && at === null) return null;
  const mint = d.mint.trim();
  return {
    tweetUrl: d.tweet.url,
    tier: 'community',
    statement: d.statement.trim(),
    criteria: d.criteria.trim(),
    ...(d.duration === 'custom' ? { deadline: new Date(at ?? 0).toISOString() } : { durationPreset: d.duration }),
    project: {
      name: d.projectName.trim(),
      ticker: normalizeTicker(d.ticker),
      ...(mint ? { mint } : {}),
    },
    ...(d.image ? { imageId: d.image.id } : {}),
    initialProbYes: d.oddsPct / 100,
    source: d.tweet,
  };
}

const PATH_FIELD: Record<string, FieldKey> = {
  tweetUrl: 'url',
  imageId: 'image',
  statement: 'statement',
  criteria: 'criteria',
  deadline: 'deadline',
  'project/name': 'projectName',
  'project/ticker': 'ticker',
  'project/mint': 'mint',
};

const CODE_FIELD: Record<string, FieldKey> = {
  invalid_deadline: 'deadline',
  invalid_tweet_url: 'url',
  tweet_mismatch: 'url',
  tweet_not_found: 'url',
  media_removed: 'image',
  media_not_found: 'image',
};

/**
 * Pins a server refusal on the wizard field it is about, so the person lands on the step that needs fixing.
 * `validation_failed` carries `body/<path>: <reason>` in its message; anything unmapped stays in `rest`.
 */
export function mapApiError(code: string | null, message: string): { errors: Errors; rest: string[] } {
  const byCode = code ? CODE_FIELD[code] : undefined;
  if (byCode) return { errors: { [byCode]: message }, rest: [] };
  const path = code === 'validation_failed' ? /^body\/([\w/]+):\s*(.+)$/.exec(message) : null;
  const field = path?.[1] ? PATH_FIELD[path[1]] : undefined;
  if (field && path?.[2]) return { errors: { [field]: path[2] }, rest: [] };
  return { errors: {}, rest: [message] };
}

export function firstErrorStep(errors: Errors): StepIndex | null {
  const steps = (Object.keys(errors) as FieldKey[]).map((k) => FIELD_STEP[k]);
  return steps.length ? (Math.min(...steps) as StepIndex) : null;
}

export const DRAFT_KEY = 'windle.create.draft.v1';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isDuration = (v: unknown): v is Duration => v === 'custom' || DURATION_PRESET_IDS.some((id) => id === v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function parseDraft(raw: unknown): Draft | null {
  if (!isRecord(raw)) return null;
  const base = emptyDraft();
  const tweet = TweetSnapshot.safeParse(raw.tweet);
  const image = ApiImage.safeParse(raw.image);
  const odds = typeof raw.oddsPct === 'number' && Number.isFinite(raw.oddsPct) ? Math.round(raw.oddsPct) : base.oddsPct;
  const draft: Draft = {
    ...base,
    url: str(raw.url, 300),
    tweet: tweet.success ? tweet.data : null,
    projectName: str(raw.projectName, 120),
    ticker: str(raw.ticker, 20),
    mint: str(raw.mint, 80),
    image: image.success ? image.data : null,
    statement: str(raw.statement, 600),
    statementTouched: raw.statementTouched === true,
    criteria: str(raw.criteria, 2400),
    duration: isDuration(raw.duration) ? raw.duration : DEFAULT_DURATION,
    deadlineDate: str(raw.deadlineDate, 10),
    deadlineTime: str(raw.deadlineTime, 5),
    oddsPct: Math.min(LIMITS.odds.max, Math.max(LIMITS.odds.min, odds)),
  };
  const step = raw.step === 1 || raw.step === 2 ? raw.step : 0;
  draft.step = draft.tweet ? step : 0;
  return isBlank(draft) ? null : draft;
}

export function loadDraft(): Draft | null {
  try {
    const text = window.sessionStorage.getItem(DRAFT_KEY);
    return text === null ? null : parseDraft(JSON.parse(text));
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft): void {
  try {
    if (isBlank(d)) window.sessionStorage.removeItem(DRAFT_KEY);
    else window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // storage can be blocked; the wizard works without it
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // see saveDraft
  }
}
