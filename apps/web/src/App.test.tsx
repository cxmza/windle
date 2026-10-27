import { render, screen, waitFor, within } from '@testing-library/react';
import { SOCIALS } from '@windle/brand';
import { describe, expect, it } from 'vitest';
import { App } from '@/App';
import { AppProviders } from '@/app/providers';
import { CHAPTERS } from '@/features/story/chapters';

function renderApp() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}

describe('App', () => {
  it('renders exactly one h1 with the hero title', () => {
    renderApp();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('SHIP OR SLASH.');
  });

  it('renders every chapter with a stable hook and one h2 each (hero uses h1)', () => {
    const { container } = renderApp();
    for (const chapter of CHAPTERS) {
      const el = container.querySelector(`#${chapter.id}[data-chapter="${chapter.index}"]`);
      expect(el).not.toBeNull();
      expect(el?.getAttribute('data-scene')).toBe(chapter.scene);
    }
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(CHAPTERS.length - 1);
  });

  it('shows the example market chip and both CTAs', () => {
    renderApp();
    expect(screen.getByRole('meter')).toHaveValue(72);
    expect(screen.getAllByRole('link', { name: 'Make a promise' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Back a team' }).length).toBeGreaterThan(0);
  });

  it('renders the top bar and the footer around the story', () => {
    renderApp();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
  });

  it('renders the emphasis mark for every chapter that defines one', () => {
    const { container } = renderApp();
    for (const chapter of CHAPTERS) {
      const marks = container.querySelectorAll(`#${chapter.id} mark[data-emphasis]`);
      if (chapter.emphasis) expect(marks.length).toBeGreaterThan(0);
      else expect(marks).toHaveLength(0);
    }
  });

  it('points hero CTAs at the final chapter and disables the final ones with a status', () => {
    const { container } = renderApp();
    for (const link of container.querySelectorAll('#hero [data-cta-row] a'))
      expect(link).toHaveAttribute('href', '/launch');
    const final = container.querySelectorAll('#cta [data-cta-row] [aria-disabled="true"]');
    expect(final).toHaveLength(2);
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('has an ecosystem chapter before the final CTA with three logo slots and honest links', () => {
    const { container } = renderApp();
    const ids = CHAPTERS.map((c) => c.id);
    expect(ids.indexOf('ecosystem')).toBe(ids.indexOf('cta') - 1);
    const section = container.querySelector('#ecosystem');
    expect(section?.getAttribute('data-scene')).toBe('ecosystem');
    const slots = [...(section?.querySelectorAll('[data-logo-slot]') ?? [])];
    expect(slots.map((s) => s.getAttribute('data-logo-slot'))).toEqual(['solana', 'pumpfun', 'x']);
    for (const slot of slots) {
      expect(slot).toHaveAttribute('data-logo-state', 'sketch');
      expect(slot.querySelectorAll('[data-stroke]').length).toBeGreaterThan(0);
    }
    expect(within(section as HTMLElement).getByRole('link', { name: /^Solana/ })).toHaveAttribute(
      'href',
      'https://solana.com',
    );
    expect(within(section as HTMLElement).getByRole('link', { name: /^pump\.fun tokens/ })).toHaveAttribute(
      'href',
      'https://pump.fun',
    );
    expect(within(section as HTMLElement).getByRole('link', { name: /^X/ })).toHaveAttribute('href', SOCIALS.x);
    for (const link of section?.querySelectorAll('a') ?? []) expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(section).toHaveTextContent(/Built on/);
    expect(section).toHaveTextContent(/Works with/);
    expect(section).toHaveTextContent(/Follow on/);
    expect(section).toHaveTextContent(/Not affiliated with or endorsed by/);
  });

  it('mounts the drawing hand as an inert aria-hidden overlay', async () => {
    const { container } = renderApp();
    // the hand is a lazy chunk (App.tsx): it mounts once its module has loaded
    await waitFor(() => expect(container.querySelector('[data-drawing-hand]')).not.toBeNull());
    const hand = container.querySelector('[data-drawing-hand]');
    expect(hand).toHaveAttribute('aria-hidden', 'true');
    expect(hand).toHaveClass('pointer-events-none', 'fixed');
    expect(hand).toHaveAttribute('data-hand-state', 'idle');
  });

  it('offers a skip button that focuses main, without touching the URL', () => {
    renderApp();
    const skip = screen.getByRole('button', { name: 'Skip to content' });
    skip.click();
    expect(document.getElementById('main')).toHaveFocus();
    expect(window.location.hash).toBe('');
  });

  it('renders the information footer after the story, with no hash links anywhere', () => {
    const { container } = renderApp();
    const footer = container.querySelector('[data-site-footer]');
    expect(footer).not.toBeNull();
    expect(container.querySelector('main')?.nextElementSibling).toBe(footer);
    for (const a of container.querySelectorAll('a[href]')) expect(a.getAttribute('href')).not.toMatch(/#/);
  });
});
