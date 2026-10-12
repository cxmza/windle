import { expect, type Page, test } from '@playwright/test';
import { CHAPTER_SEO } from '../scripts/chapter-seo.ts';
import { revealNav, scrollSettled, storyMounted } from './story.ts';

test.use({ viewport: { width: 1440, height: 900 } });

const pathname = (page: Page) => new URL(page.url()).pathname;
const sectionTop = (page: Page, id: string) =>
  page.evaluate<number>(`Math.round(document.getElementById('${id}')?.getBoundingClientRect().top ?? 9999)`);

test.describe('clean chapter paths', () => {
  test('a deep link jumps to its chapter once the story is mounted and keeps its URL', async ({ page }) => {
    await page.goto('/judge');
    await storyMounted(page);
    await expect.poll(() => sectionTop(page, 'judge'), { timeout: 15_000 }).toBeLessThan(40);
    // judge is one of chapters 01-06: the Protocol link is the active top-level item
    await expect(page.locator('[data-dock-protocol]')).toHaveAttribute('data-active', '');
    expect(pathname(page)).toBe('/judge');
    await expect(page).toHaveTitle(CHAPTER_SEO.judge.title);
  });

  test('clicks push paths, back/forward scroll, free scrolling rewrites the URL without new history entries', async ({
    page,
  }) => {
    await page.goto('/');
    await storyMounted(page);
    await page.locator('[data-dock]').getByRole('link', { name: 'Protocol' }).click();
    await expect.poll(() => pathname(page), { timeout: 15_000 }).toBe('/promise');
    await revealNav(page);
    await page.locator('[data-dock]').getByRole('link', { name: 'Ecosystem' }).click();
    await expect.poll(() => pathname(page), { timeout: 15_000 }).toBe('/ecosystem');
    await page.goBack();
    await expect.poll(() => pathname(page)).toBe('/promise');
    await expect(page).toHaveTitle(CHAPTER_SEO.promise.title);
    await expect.poll(() => sectionTop(page, 'promise'), { timeout: 15_000 }).toBeLessThan(40);
    // let the programmatic (smooth) scroll finish before the free scroll: it would otherwise win
    await scrollSettled(page);
    const entries = await page.evaluate<number>('history.length');
    await page.evaluate('window.scrollTo(0, 0)');
    await expect.poll(() => pathname(page), { timeout: 15_000 }).toBe('/');
    expect(await page.evaluate<number>('history.length')).toBe(entries);
  });

  test('no link or location uses a hash', async ({ page }) => {
    await page.goto('/');
    await storyMounted(page);
    const hashed = await page.evaluate<number>(
      "[...document.querySelectorAll('a[href]')].filter((a) => a.getAttribute('href')?.includes('#')).length",
    );
    expect(hashed).toBe(0);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('the skip button is first in the tab order and focuses main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('button', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('an unknown path renders the 404 state', async ({ page }) => {
    await page.goto('/nope');
    await expect(page.locator('[data-not-found]')).toBeVisible();
    await expect(page).toHaveTitle('404 — windle');
  });
});
