import { expect, type Page, test } from '@playwright/test';
import { revealNav } from './story.ts';

test.use({ viewport: { width: 1440, height: 900 } });

const headerMark = (page: Page) => page.locator('[data-header-logo] [data-logo-jelly]');

async function dragBy(page: Page, dx: number, dy: number) {
  const box = await headerMark(page).boundingBox();
  if (!box) throw new Error('header mark not rendered');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
}

async function scrollAway(page: Page) {
  await page.evaluate('window.scrollTo(0, 1200)');
  await expect.poll(() => page.evaluate<number>('window.scrollY')).toBeGreaterThan(1000);
  // the bar hides while scrolling down: bring it back (a small step up) so the lockup can be grabbed
  await revealNav(page);
}

test.describe('logo jelly', () => {
  test('drag stretches the mark and does not navigate; a plain click still does', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await scrollAway(page);

    const historyBefore = await page.evaluate<number>('history.length');
    await dragBy(page, 40, 12);
    await expect(headerMark(page)).toHaveAttribute('data-jelly-dragging', '');
    await expect.poll(() => headerMark(page).evaluate((el) => el.style.transform)).toContain('scale(');
    await page.mouse.up();
    expect(await page.evaluate<number>('history.length')).toBe(historyBefore);
    // springs back and clears its inline transform at rest (~2s; measured 2-2.5 fps for software-GL pages in a
    // parallel run, and the sim drops frame gaps over JELLY.maxDt, so allow a long wall-clock wait)
    await expect.poll(() => headerMark(page).evaluate((el) => el.style.transform), { timeout: 30_000 }).toBe('');
    await expect(headerMark(page)).not.toHaveAttribute('data-jelly-dragging');

    await headerMark(page).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  });

  test('reduced motion: the mark stays static and the link works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await scrollAway(page);

    await dragBy(page, 40, 12);
    expect(await headerMark(page).evaluate((el) => el.style.transform)).toBe('');
    await page.mouse.up();

    await page.locator('[data-header-logo]').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    const path = page.locator('[data-header-logo] [data-logo-jelly] path');
    expect(await path.evaluate((el) => el.getAnimations().length)).toBe(0);
  });
});
