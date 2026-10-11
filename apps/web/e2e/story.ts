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

/** The bar is always in place: wait until the page is still and the bar sits at the top, then park the pointer on it. */
export async function revealNav(page: Page) {
  await scrollSettled(page);
  await expect.poll(async () => Math.round((await page.locator('[data-dock-root]').boundingBox())?.y ?? -99)).toBe(0);
  await page.locator('[data-dock]').hover();
}

/** Open the Protocol menu and return its panel. */
export async function openProtocolMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Protocol' });
  await trigger.click();
  const menu = page.locator('[data-dock-menu]');
  await expect(menu).toBeVisible();
  return menu;
}
