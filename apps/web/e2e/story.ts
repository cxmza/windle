import { expect, type Page } from '@playwright/test';

/** Below-the-fold chapters mount after first paint (Story.tsx useDeferredChapters): wait until none is a placeholder. */
export async function storyMounted(page: Page) {
  await expect(page.locator('[data-placeholder]')).toHaveCount(0, { timeout: 15_000 });
}

/** Wait until the page has stopped scrolling (a programmatic smooth scroll may still be running). */
export async function scrollSettled(page: Page) {
  let last = -1;
  await expect
    .poll(async () => {
      const y = await page.evaluate<number>('Math.round(window.scrollY)');
      const same = y === last;
      last = y;
      return same;
    })
    .toBe(true);
}

/** The bar hides while the reader scrolls down: nudge up once the page is still and wait until it is back (compact or full). */
export async function revealNav(page: Page) {
  await scrollSettled(page);
  const root = page.locator('[data-dock-root]');
  if ((await root.getAttribute('data-nav-state')) === 'hidden') {
    await page.evaluate('window.scrollBy(0, -40)');
    await expect(root).not.toHaveAttribute('data-nav-state', 'hidden');
  }
  // the pill slides back in (transform transition): wait until it has landed
  await expect.poll(async () => Math.round((await root.boundingBox())?.y ?? -99)).toBe(0);
  // hovering expands a compact pill: settle at full width so the lockup stops moving
  const pill = page.locator('[data-dock]');
  await pill.hover();
  await expect(root).toHaveAttribute('data-nav-state', 'full');
  await expect.poll(async () => (await pill.boundingBox())?.width ?? 0).toBeGreaterThan(600);
  await expect
    .poll(async () => {
      const a = (await pill.boundingBox())?.width ?? 0;
      await page.waitForTimeout(100);
      return a === ((await pill.boundingBox())?.width ?? -1);
    })
    .toBe(true);
}

/** Open the Protocol menu (the bar is made full by the hover that opens it) and return its panel. */
export async function openProtocolMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Protocol' });
  await page.locator('[data-dock]').hover(); // a compact pill expands under the pointer first
  await expect(page.locator('[data-dock-root]')).toHaveAttribute('data-nav-state', 'full');
  await trigger.click();
  const menu = page.locator('[data-dock-menu]');
  await expect(menu).toBeVisible();
  return menu;
}
