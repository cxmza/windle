import { expect, type Page, test } from '@playwright/test';
import { revealNav, storyMounted } from './story.ts';

test.use({ viewport: { width: 1440, height: 900 } });

const headerMark = (page: Page) => page.locator('[data-header-logo] [data-logo-jelly]');

test.describe('mark input', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('a press-and-drag on the hero title selects text, never grabs the 3D mark', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('h1');
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    if (!box) throw new Error('hero title not rendered');
    // across the first line of glyphs
    const y = box.y + box.height * 0.25;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 10 });
    await expect(page.locator('html')).not.toHaveAttribute('data-drag-cursor');
    await page.mouse.up();
    expect(await page.evaluate<number>('window.getSelection()?.toString().trim().length ?? 0')).toBeGreaterThan(0);
  });

  test('while a mark is dragged the pencil steps aside; the next plain click is not swallowed', async ({ page }) => {
    await page.goto('/');
    await storyMounted(page);
    await page.evaluate('window.scrollTo(0, 1200)');
    await expect.poll(() => page.evaluate<number>('window.scrollY')).toBeGreaterThan(1000);
    await revealNav(page); // the bar hides while scrolling down

    // the pencil overlay is a lazy chunk (App.tsx): it must be mounted before the trail is drawn
    await expect(page.locator('[data-pencil-cursor]')).toBeAttached();
    const historyBefore = await page.evaluate<number>('history.length');
    const box = await headerMark(page).boundingBox();
    if (!box) throw new Error('header mark not rendered');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x - 60, y + 40, { steps: 4 }); // draw a little trail first
    await page.mouse.move(x, y);
    await expect.poll(() => page.locator('[data-pencil-trail] path').getAttribute('d')).not.toBeNull();
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 12, { steps: 8 });
    await expect(page.locator('html')).toHaveAttribute('data-drag-cursor', 'grabbing');
    await expect(page.locator('[data-pencil-tip]')).toHaveCSS('opacity', '0');
    await expect.poll(() => page.locator('[data-pencil-trail] path').getAttribute('d')).toBe('');
    // release: the click this release produces is swallowed, and nothing stays armed for the next click
    await page.mouse.up();
    await expect(page.locator('html')).not.toHaveAttribute('data-drag-cursor');
    expect(await page.evaluate<number>('history.length')).toBe(historyBefore);

    await headerMark(page).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  });
});
