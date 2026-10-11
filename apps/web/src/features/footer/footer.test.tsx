import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOOTER_COLUMNS, HEALTH_URL, LEGAL_LINKS, TAGLINE } from './footer-links';
import { SiteFooter } from './SiteFooter';
import { StatusPill } from './StatusPill';
import { HEALTH_INTERVAL_MS, probeHealth } from './use-api-health';

const asFetch = (fn: unknown) => fn as typeof fetch;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SiteFooter', () => {
  it('lists every column with the agreed destinations and no hash hrefs', () => {
    render(<SiteFooter />);
    const hrefs = (name: string) =>
      FOOTER_COLUMNS.find((c) => c.title === name)?.links.map((l) => `${l.label}=${l.href}`) ?? [];
    expect(hrefs('Product')).toEqual([
      'App=https://app.windle.fun',
      'Sign in=https://oauth.windle.fun',
      'Docs=https://docs.windle.fun',
      'API reference=https://api.windle.fun/reference/',
    ]);
    expect(hrefs('Protocol')).toContain('Market=/market');
    expect(hrefs('Legal')).toEqual([
      'Terms=https://docs.windle.fun/legal/terms/',
      'Privacy=https://docs.windle.fun/legal/privacy/',
      'Risk=https://docs.windle.fun/legal/risk/',
    ]);
    for (const a of document.querySelectorAll('footer a')) {
      expect(a.getAttribute('href')).not.toMatch(/#/);
      if (a.getAttribute('href')?.startsWith('http')) expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByText(/Not affiliated with Solana, pump\.fun or X/)).toBeInTheDocument();
    expect(screen.getByText(/2026 windle/)).toBeInTheDocument();
  });

  it('shows the tagline, icon-only socials (no GitHub until it has a URL) and the legal links inline', () => {
    render(<SiteFooter />);
    expect(screen.getByText(TAGLINE)).toBeInTheDocument();
    const x = screen.getByRole('link', { name: /windle on X/ });
    expect(x).toHaveTextContent('');
    expect(x.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /GitHub/ })).toBeNull();
    const bottom = screen.getByText(/2026 windle/).parentElement;
    for (const link of LEGAL_LINKS) {
      expect(bottom?.querySelector(`a[href="${link.href}"]`)).not.toBeNull();
    }
    // the oversized wordmark is decoration only
    expect(
      document.querySelector('[data-site-footer] [aria-hidden="true"]:not(svg):not(span[class*="size-"])'),
    ).not.toBeNull();
  });

  it('has a tuggable mark and does not fetch without IntersectionObserver', () => {
    const fetchFn = vi.fn();
    const { container } = render(<SiteFooter fetchFn={asFetch(fetchFn)} />);
    expect(container.querySelector('[data-footer-mark][data-logo-jelly]')).not.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Checking status');
  });

  it('probes on view and then every 60 s while visible', async () => {
    vi.useFakeTimers();
    let notify: (visible: boolean) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          notify = (visible) => cb([{ isIntersecting: visible }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    render(<SiteFooter fetchFn={asFetch(fetchFn)} />);
    await act(async () => notify(true));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(HEALTH_URL);
    expect(screen.getByRole('status')).toHaveTextContent(/All systems operational/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await act(async () => notify(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS * 2);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('probeHealth', () => {
  it('reports ok with a latency, down on a bad status, a network error and a timeout', async () => {
    const ok = await probeHealth(HEALTH_URL, asFetch(vi.fn().mockResolvedValue({ ok: true })));
    expect(ok.status).toBe('ok');
    const bad = await probeHealth(HEALTH_URL, asFetch(vi.fn().mockResolvedValue({ ok: false })));
    expect(bad).toEqual({ status: 'down' });
    const err = await probeHealth(HEALTH_URL, asFetch(vi.fn().mockRejectedValue(new TypeError('offline'))));
    expect(err).toEqual({ status: 'down' });

    vi.useFakeTimers();
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = probeHealth(HEALTH_URL, asFetch(hang), 4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toEqual({ status: 'down' });
  });
});

describe('StatusPill', () => {
  it('shows the latency when up and a plain message when down', () => {
    const { rerender } = render(<StatusPill health={{ status: 'ok', latencyMs: 42 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('All systems operational');
    expect(screen.getByRole('status')).toHaveTextContent('42 ms');
    expect(screen.getByRole('status')).toHaveClass('whitespace-nowrap');
    rerender(<StatusPill health={{ status: 'down' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('API unreachable');
  });
});
