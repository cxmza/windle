import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

type DragProbe = { sel: string; found: boolean; prevented: boolean; userDrag: string };

const SELECTORS = ['[data-header-logo]', '[data-dock-root] button', 'svg', '[data-solana-mark] svg', 'canvas'];

// runs in the page (the e2e tsconfig has no DOM lib, so the probe is a string)
const probe = (selectors: string[]) => `(${JSON.stringify(selectors)}).map((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { sel, found: false, prevented: false, userDrag: '' };
  const event = new DragEvent('dragstart', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return { sel, found: true, prevented: event.defaultPrevented, userDrag: getComputedStyle(el).getPropertyValue('-webkit-user-drag') };
})`;

test('images, icons, links, buttons and canvases have no native drag; body copy stays selectable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-header-logo]')).toBeVisible();
  const results = await page.evaluate<DragProbe[]>(probe(SELECTORS));
  for (const r of results) {
    if (r.sel === 'canvas' && !r.found) continue;
    expect(r, r.sel).toMatchObject({ found: true, prevented: true, userDrag: 'none' });
  }
  const copySelect = await page.evaluate<string>(
    "getComputedStyle(document.querySelector('[data-hero-sub]')).userSelect",
  );
  expect(copySelect).not.toBe('none');
});
