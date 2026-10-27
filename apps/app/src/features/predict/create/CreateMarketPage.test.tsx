import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { tweetUrl } from '@windle/shared';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFS_KEY, reloadPrefs } from '@/features/settings/prefs';
import { tweetId } from '../../feed/build';
import { mapPost } from '../../feed/live-map';
import { post } from '../../feed/live-test-support';
import { POOL } from '../../feed/pool';
import { clearFeedRegistry, registerFeedTweets } from '../../feed/registry';
import { clearXPostCache } from '../../tweet/x-post-api';
import { renderWith } from '../test-render';
import { FakeApi, makeMarket, makeTweet } from '../test-support';
import { lookupTweet } from '../tweets';
import { CreateMarketPage } from './CreateMarketPage';
import { DRAFT_KEY, type Draft, emptyDraft, loadDraft, presetDeadline, saveDraft } from './draft';

const author = { ...post(11).author, handle: 'glowbyte_sol', name: 'Glowbyte' };
const GLOW_POST = post(11, {
  url: 'https://x.com/glowbyte_sol/status/1800000000000000011',
  author,
  text: 'v1 of the Glowbyte launchpad ships next Wednesday. Reply with your wallet for early access.',
});
const FERN_POST = post(12, {
  url: 'https://x.com/fernwave_cto/status/1800000000000000012',
  author: { ...author, handle: 'fernwave_cto', name: 'Fernwave' },
  text: 'Community vote on the treasury plan closes Thursday.',
});
const GLOWBYTE = GLOW_POST.id;
const FERNWAVE = FERN_POST.id;
let fake: FakeApi;

function registerPosts() {
  for (const p of [GLOW_POST, FERN_POST]) {
    const mapped = mapPost(p);
    if (!mapped) throw new Error('post did not map');
    registerFeedTweets([mapped]);
  }
}

const WAIT = { timeout: 10_000 };

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}</output>;
}

function Search() {
  const l = useLocation();
  return <output data-testid="search">{l.search}</output>;
}

function renderWizard(entry = '/create') {
  return renderWith(
    <Routes>
      <Route
        path="/create"
        element={
          <>
            <CreateMarketPage />
            <Search />
          </>
        }
      />
      <Route path="/m/:slug" element={<Where />} />
    </Routes>,
    entry,
  );
}

async function seedDraft(over: Partial<Draft> = {}) {
  const found = await lookupTweet(GLOWBYTE);
  if (!found.ok) throw new Error('registered tweet missing');
  saveDraft({
    ...emptyDraft(),
    step: 1,
    url: GLOW_POST.url,
    tweet: found.value,
    projectName: 'Glowbyte',
    ticker: 'GLOW',
    statement: 'Glowbyte launches v1 of its launchpad',
    criteria: 'YES if: the launchpad is live on mainnet and anyone can create a pool.',
    ...presetDeadline(30, Date.now()),
    ...over,
  });
}

const field = (name: string | RegExp) => screen.getByLabelText(name);
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const urlInput = () => screen.getByLabelText('Tweet link');

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearFeedRegistry();
  clearXPostCache();
  registerPosts();
  reloadPrefs();
  fake = new FakeApi().install();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('create wizard: tweet step', () => {
  it('rejects a link that is not a tweet, inline, without fetching', async () => {
    renderWizard();
    fireEvent.change(urlInput(), { target: { value: 'https://example.com/post/1' } });
    expect(screen.getByText('Only x.com and twitter.com links are supported.')).toBeInTheDocument();
    expect(urlInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('status', { name: 'Fetching the tweet' })).toBeNull();

    fireEvent.change(urlInput(), { target: { value: 'https://x.com/someone' } });
    expect(screen.getByText(/not a single tweet/)).toBeInTheDocument();
  });

  it('shows a skeleton while fetching, then the native tweet card with safe links', async () => {
    const cold = post(21, {
      url: 'https://x.com/glowbyte_sol/status/1800000000000000021',
      author,
      text: 'a cold post',
    });
    const gate: { release: ((r: Response) => void) | null } = { release: null };
    fake.override = (path) =>
      path.startsWith('/v1/x/post/')
        ? new Promise<Response>((r) => {
            gate.release = r;
          })
        : undefined;
    renderWizard();
    fireEvent.change(urlInput(), { target: { value: tweetUrl('glowbyte_sol', cold.id) } });
    expect(screen.getByRole('status', { name: 'Fetching the tweet' })).toBeInTheDocument();
    await waitFor(() => expect(gate.release).not.toBeNull());
    gate.release?.(new Response(JSON.stringify(cold), { status: 200 }));
    const card = await screen.findByRole('article', { name: 'Tweet by @glowbyte_sol' }, WAIT);
    expect(within(card).getByText('a cold post')).toBeInTheDocument();
    const view = within(card).getByRole('link', { name: /View on X/ });
    expect(view).toHaveAttribute('href', tweetUrl('glowbyte_sol', cold.id));
    expect(view).toHaveAttribute('target', '_blank');
    expect(view.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('status', { name: 'Fetching the tweet' })).toBeNull();
  });

  it('says so when the tweet cannot be found, and lets you retry', async () => {
    fake.override = (path) =>
      path.startsWith('/v1/x/post/')
        ? new Response(JSON.stringify({ error: { code: 'x_post_not_found', message: 'gone' } }), { status: 404 })
        : undefined;
    renderWizard();
    fireEvent.change(urlInput(), { target: { value: 'https://x.com/nobody/status/1846811299999999999' } });
    expect(await screen.findByText('We could not find that tweet.', undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('links to the existing market when the tweet already has one, and blocks Next', async () => {
    fake.add(makeMarket({ slug: 'taken-slug', source: makeTweet(GLOWBYTE, { url: GLOW_POST.url }) }));
    renderWizard();
    fireEvent.change(urlInput(), { target: { value: GLOW_POST.url } });
    const notice = await screen.findByText('A market already exists for this tweet.', undefined, WAIT);
    expect(notice).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the existing market' })).toHaveAttribute('href', '/m/taken-slug');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('no longer offers invented example tweets', () => {
    renderWizard();
    expect(screen.queryByText('Try an example')).toBeNull();
  });

  it('asks for a link when Next is pressed on an empty form', () => {
    renderWizard();
    next();
    expect(screen.getByText('Paste the link to a tweet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Paste the tweet/ })).toBeInTheDocument();
  });
});

describe('create wizard: market and review', () => {
  it('happy path: paste, fill, create through the api, land on the market page', async () => {
    renderWizard();
    fireEvent.change(urlInput(), { target: { value: GLOW_POST.url } });
    await screen.findByRole('article', { name: 'Tweet by @glowbyte_sol' }, WAIT);
    next();

    expect(screen.getByRole('heading', { name: /Describe the market/ })).toBeInTheDocument();
    expect(field('Statement')).toHaveValue('v1 of the Glowbyte launchpad ships next Wednesday.');
    expect(field('Name')).toHaveValue('Glowbyte');
    fireEvent.change(field('Ticker'), { target: { value: '$glow' } });
    fireEvent.click(screen.getByRole('button', { name: /What counts as YES/ }));
    fireEvent.change(field('Resolution criteria'), {
      target: { value: 'YES if: v1 is live on mainnet and anyone can create a pool.' },
    });
    next();

    const preview = await screen.findByRole('article', { name: 'Market preview' });
    expect(within(preview).getByText('$GLOW')).toBeInTheDocument();
    expect(within(preview).getByText('Community')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create market' }));
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();

    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/m\/.+/), WAIT);
    const sent = fake.callsTo('POST', '/v1/markets')[0]?.body as {
      tweetUrl: string;
      tier: string;
      project: { ticker: string };
      source: { id: string; url: string };
    };
    expect(sent).toMatchObject({
      tier: 'community',
      durationPreset: 'day',
      project: { ticker: 'GLOW' },
      source: { id: GLOWBYTE },
    });
    expect(sent).not.toHaveProperty('deadline');
    expect(sent.tweetUrl).toBe(sent.source.url);
    const created = [...fake.markets.values()].find((m) => m.source?.id === GLOWBYTE);
    expect(created).toMatchObject({ tier: 'community', status: 'open', project: { ticker: 'GLOW' } });
    expect(screen.getByTestId('where')).toHaveTextContent(`/m/${created?.slug}`);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('shows field errors on Next and does not advance', async () => {
    await seedDraft({ criteria: '', ticker: '', mint: 'nope' });
    renderWizard();
    next();
    expect(screen.getByText('Write at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByText('Use 2–10 letters or digits, for example GLOW.')).toBeInTheDocument();
    expect(screen.getByText(/not a token mint/)).toBeInTheDocument();
    expect(field('Ticker')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: /Describe the market/ })).toBeInTheDocument();
    await waitFor(() => expect(field('Ticker')).toHaveFocus());
  });

  it('maps a validation refusal from the api back onto the field and the right step', async () => {
    await seedDraft({ step: 2 });
    fake.override = (path, init) =>
      path === '/v1/markets' && init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              error: { code: 'validation_failed', message: 'body/project/ticker: That ticker is reserved.' },
            }),
            { status: 400 },
          )
        : undefined;
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Create market' }));

    expect(await screen.findByRole('heading', { name: /Describe the market/ })).toBeInTheDocument();
    expect(screen.getByText('That ticker is reserved.')).toBeInTheDocument();
    expect(field('Ticker')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(field('Ticker'), { target: { value: 'GLOWB' } });
    expect(screen.queryByText('That ticker is reserved.')).toBeNull();
  });

  it('maps invalid_deadline to the deadline field, in plain words', async () => {
    await seedDraft({ step: 2, duration: 'custom' });
    fake.override = (path, init) =>
      path === '/v1/markets' && init?.method === 'POST'
        ? new Response(JSON.stringify({ error: { code: 'invalid_deadline', message: 'raw server text' } }), {
            status: 422,
          })
        : undefined;
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Create market' }));
    expect(await screen.findByText('The deadline must be between one hour and one year from now.')).toBeInTheDocument();
    expect(field('Date')).toHaveAttribute('aria-invalid', 'true');
  });

  it('points at the existing market when creation loses a duplicate race', async () => {
    await seedDraft({ step: 2 });
    fake.override = (path, init) =>
      path === '/v1/markets' && init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              error: { code: 'duplicate_tweet', message: 'exists', details: { existingSlug: 'taken-slug' } },
            }),
            { status: 409 },
          )
        : undefined;
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Create market' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A market for this tweet already exists.');
    expect(within(alert).getByRole('link', { name: 'Open the existing market' })).toHaveAttribute(
      'href',
      '/m/taken-slug',
    );
    expect(screen.getByRole('heading', { name: /Review and create/ })).toBeInTheDocument();
  });

  it('explains the hourly limit instead of a bare status code', async () => {
    await seedDraft({ step: 2 });
    fake.override = (path, init) =>
      path === '/v1/markets' && init?.method === 'POST'
        ? new Response(
            JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests, retry in 600s' } }),
            { status: 429 },
          )
        : undefined;
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Create market' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Wait a moment and try again.');
  });

  it('presets move the deadline, and the odds follow the odds-format preference', async () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ odds: 'decimal' }));
    reloadPrefs();
    await seedDraft({ duration: 'custom', deadlineDate: '', deadlineTime: '' });
    renderWizard();
    expect(field('Date')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '+7 days' }));
    const week = (field('Date') as HTMLInputElement).value;
    fireEvent.click(screen.getByRole('button', { name: '+90 days' }));
    expect((field('Date') as HTMLInputElement).value > week).toBe(true);
    expect(screen.getByRole('slider', { name: /Starting/ })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', expect.stringContaining('Ships'));
    expect(screen.getByText('Ships').parentElement?.textContent).toContain('2.00');
  });
});

describe('create wizard: duration cards', () => {
  const card = (id: string) => document.querySelector(`[data-duration-card="${id}"]`) as HTMLElement;
  const sentBody = () => fake.callsTo('POST', '/v1/markets')[0]?.body as Record<string, unknown>;

  it('offers every preset with its risk, recommends Day and starts on it', async () => {
    await seedDraft();
    renderWizard();
    for (const id of ['flash', 'fast', 'slow', 'day', 'week', 'month', 'custom']) expect(card(id)).not.toBeNull();
    expect(card('flash')).toHaveTextContent('Extreme risk');
    expect(card('slow')).toHaveTextContent('Slow4h');
    expect(card('day')).toHaveTextContent('Recommended');
    expect(card('day')).toHaveAttribute('data-selected');
    expect(screen.queryByLabelText('Date')).toBeNull();
  });

  it('sends the chosen preset, not a date, and shows it on the review step', async () => {
    await seedDraft();
    renderWizard();
    fireEvent.click(within(card('slow')).getByRole('radio'));
    expect(card('slow')).toHaveAttribute('data-selected');
    expect(card('day')).not.toHaveAttribute('data-selected');
    next();
    expect(screen.getByText('Slow · 4h, counted from creation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create market' }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/markets')).toHaveLength(1), WAIT);
    expect(sentBody()).toMatchObject({ durationPreset: 'slow' });
    expect(sentBody()).not.toHaveProperty('deadline');
  });

  it('reveals the date inputs for a custom date and sends a deadline instead', async () => {
    await seedDraft({ deadlineDate: '', deadlineTime: '' });
    renderWizard();
    fireEvent.click(within(card('custom')).getByRole('radio'));
    expect((field('Date') as HTMLInputElement).value).not.toBe('');
    next();
    expect(screen.getByText(/^Custom · closes /)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create market' }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/markets')).toHaveLength(1), WAIT);
    expect(sentBody()).toHaveProperty('deadline');
    expect(sentBody()).not.toHaveProperty('durationPreset');
  });

  it('does not ask for a date while a preset is chosen, and does once custom is', async () => {
    await seedDraft({ deadlineDate: '', deadlineTime: '' });
    renderWizard();
    next();
    expect(screen.getByRole('heading', { name: /Review and create/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(within(card('custom')).getByRole('radio'));
    fireEvent.change(field('Date'), { target: { value: '' } });
    next();
    expect(screen.getByText('Pick a date and a time.')).toBeInTheDocument();
  });
});

describe('create wizard: draft', () => {
  it('restores a draft from sessionStorage on the step it was left, and keeps state going back', async () => {
    await seedDraft({ projectName: 'Glowbyte Labs' });
    renderWizard();
    expect(screen.getByRole('heading', { name: /Describe the market/ })).toBeInTheDocument();
    expect(field('Name')).toHaveValue('Glowbyte Labs');
    expect(field('Ticker')).toHaveValue('GLOW');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(urlInput()).toHaveValue(tweetUrl('glowbyte_sol', GLOWBYTE));
    expect(await screen.findByRole('article', { name: 'Tweet by @glowbyte_sol' }, WAIT)).toBeInTheDocument();

    next();
    expect(field('Name')).toHaveValue('Glowbyte Labs');
  });

  it('writes the draft as you type and survives storage failures', async () => {
    renderWizard();
    fireEvent.change(urlInput(), { target: { value: 'https://x.com/a' } });
    expect(loadDraft()?.url).toBe('https://x.com/a');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    fireEvent.change(urlInput(), { target: { value: 'https://x.com/ab' } });
    expect(urlInput()).toHaveValue('https://x.com/ab');
  });
});

describe('create wizard: ?tweet= from the feed', () => {
  const link = (handle: string, id: string) => `/create?tweet=${encodeURIComponent(tweetUrl(handle, id))}`;

  it('prefills the link, fetches the preview on its own and drops the param', async () => {
    renderWizard(link('glowbyte_sol', GLOWBYTE));
    expect(urlInput()).toHaveValue(tweetUrl('glowbyte_sol', GLOWBYTE));
    expect(await screen.findByRole('article', { name: 'Tweet by @glowbyte_sol' }, WAIT)).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('resolves a tweet that only the feed knows', async () => {
    renderWizard(
      link(
        'degenfeed_demo',
        tweetId(
          POOL.findIndex((e) => e.handle === 'degenfeed_demo'),
          0,
        ),
      ),
    );
    expect(await screen.findByRole('article', { name: 'Tweet by @degenfeed_demo' }, WAIT)).toBeInTheDocument();
  });

  it('starts over when a stored draft is about another tweet', async () => {
    await seedDraft();
    renderWizard(link('fernwave_cto', FERNWAVE));
    expect(screen.getByRole('heading', { name: /Paste the tweet/ })).toBeInTheDocument();
    expect(urlInput()).toHaveValue(tweetUrl('fernwave_cto', FERNWAVE));
    expect(await screen.findByRole('article', { name: 'Tweet by @fernwave_cto' }, WAIT)).toBeInTheDocument();
  });

  it('keeps the progress of a stored draft that is about the same tweet', async () => {
    await seedDraft();
    renderWizard(link('glowbyte_sol', GLOWBYTE));
    expect(screen.getByRole('heading', { name: /Describe the market/ })).toBeInTheDocument();
  });

  it('shows the usual inline error for a param that is not a tweet link', () => {
    renderWizard('/create?tweet=https%3A%2F%2Fexample.com%2Fx');
    expect(urlInput()).toHaveValue('https://example.com/x');
    expect(screen.getByRole('alert')).toHaveTextContent('Only x.com and twitter.com links are supported.');
  });
});
