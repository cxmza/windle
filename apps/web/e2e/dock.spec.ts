import { expect, test } from '@playwright/test';
import { openProtocolMenu, scrollSettled, storyMounted } from './story.ts';

test.describe('desktop top bar', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('is three islands: lockup on the page, a compact centred glass capsule, a glass actions island on the right', async ({
    page,
  }) => {
    await page.goto('/');
    const capsule = await page.locator('[data-dock]').boundingBox();
    const actions = await page.locator('[data-dock-actions]').boundingBox();
    expect(capsule && actions).toBeTruthy();
    if (!capsule || !actions) return;
    expect(Math.round(capsule.height)).toBe(56);
    expect(Math.round(capsule.y)).toBe(16);
    expect(capsule.width).toBeLessThan(420);
    expect(Math.abs(capsule.x + capsule.width / 2 - 720)).toBeLessThan(2);
    expect(Math.round(actions.height)).toBe(56);
    expect(Math.round(actions.y)).toBe(16);
    const logo = await page.locator('[data-header-logo]').boundingBox();
    const signIn = await page.locator('[data-dock-signin]').boundingBox();
    const launch = await page.locator('[data-dock-cta]').boundingBox();
    expect(logo && signIn && launch).toBeTruthy();
    if (!logo || !signIn || !launch) return;
    expect(logo.x + logo.width).toBeLessThanOrEqual(capsule.x);
    expect(capsule.x + capsule.width).toBeLessThanOrEqual(actions.x);
    expect(signIn.x).toBeGreaterThanOrEqual(actions.x);
    expect(signIn.x + signIn.width).toBeLessThanOrEqual(launch.x);
    expect(launch.x + launch.width).toBeLessThanOrEqual(actions.x + actions.width);
    expect(actions.x + actions.width).toBeLessThanOrEqual(1440);
    for (const target of [signIn, launch]) expect(target.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('[data-dock-island] [data-header-logo]')).toHaveCount(0);
    await expect(page.locator('[data-dock-root] [data-logo-jelly]:visible')).toHaveCount(1);
    await expect(page.locator('[data-dock-actions]').getByRole('link', { name: 'Launch app' })).toHaveAttribute(
      'href',
      'https://app.windle.fun',
    );
    await expect(page.locator('[data-dock-actions]').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      'https://oauth.windle.fun',
    );
    await expect(page.locator('[data-dock]').getByRole('link', { name: /^Docs/ })).toHaveAttribute(
      'href',
      'https://docs.windle.fun',
    );
    await expect(page.locator('[data-dock-x]')).toHaveCount(0); // X lives in the footer and the mobile sheet
  });

  test('navigates to a chapter by clean path and marks it current', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-dock]').getByRole('link', { name: 'Ecosystem' }).click();
    await expect(page.locator('[data-dock] [data-dock-link=ecosystem]')).toHaveAttribute('aria-current', 'location', {
      timeout: 10_000,
    });
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ecosystem');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('the Protocol menu lists the chapters, navigates by path', async ({ page }) => {
    await page.goto('/');
    const menu = await openProtocolMenu(page);
    await expect(menu.locator('[data-dock-link]')).toHaveCount(7);
    await page
      .locator('[data-dock-menu]')
      .getByRole('link', { name: /Collateral/ })
      .click();
    await page.mouse.move(700, 700); // a pointer left over the trigger would re-open the menu on hover
    await expect(page.locator('[data-dock-menu]')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe('/collateral');
  });

  test('the Protocol menu opens under the capsule and moves with the keyboard', async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Protocol' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.locator('[data-dock-menu]');
    await expect(menu).toBeVisible();
    const capsule = await page.locator('[data-dock]').boundingBox();
    await expect
      .poll(async () => {
        const box = await menu.boundingBox();
        return box && capsule ? Math.abs(box.x + box.width / 2 - (capsule.x + capsule.width / 2)) : 99;
      })
      .toBeLessThan(4);
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('[data-dock-link]').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('[data-dock-link]').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('keeps one size, shape and position of every island at every scroll offset, up and down', async ({ page }) => {
    await page.goto('/');
    await storyMounted(page);
    const measure = () =>
      page.locator('[data-dock-island]').evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect();
          return [box.x, box.y, box.width, box.height].map(Math.round);
        }),
      );
    const initial = await measure();
    expect(initial).toHaveLength(2);
    for (const y of [200, 1400, 600, 0]) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await scrollSettled(page);
      expect(await measure()).toEqual(initial);
      await expect(page.locator('[data-dock-signin]')).toBeVisible();
      await expect(page.locator('[data-dock-root]')).not.toHaveAttribute('data-nav-state', /.*/);
    }
  });

  test('is glass: a near-clear tint with a small backdrop blur, not an opaque plate', async ({ page }) => {
    await page.goto('/');
    const style = await page.evaluate<{ bg: string; filter: string }>(
      "(() => { const cs = getComputedStyle(document.querySelector('[data-dock] [data-glass]')); return { bg: cs.backgroundColor, filter: cs.backdropFilter }; })()",
    );
    const alpha = Number(/\/\s*([\d.]+)/.exec(style.bg)?.[1] ?? /,\s*([\d.]+)\)$/.exec(style.bg)?.[1] ?? 1);
    expect(alpha).toBeLessThan(0.15);
    expect(style.filter).toContain('blur');
  });

  test('refracts in Chromium: each island gets a lens filter built for its measured size', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-dock] [data-glass][data-lens]')).toHaveCount(1);
    await expect(page.locator('[data-dock-actions] [data-glass][data-lens]')).toHaveCount(1);
    const fits = await page.evaluate<boolean[]>(`(() =>
      [...document.querySelectorAll('[data-dock-island]')].map((island) => {
        const glass = island.querySelector('[data-glass]');
        const id = /url\\("#([^"]+)"\\)/.exec(getComputedStyle(glass).backdropFilter)?.[1];
        const filter = id ? document.getElementById(id) : null;
        const box = island.getBoundingClientRect();
        return !!filter && Math.abs(Number(filter.getAttribute('width')) - box.width) < 1 && Math.abs(Number(filter.getAttribute('height')) - box.height) < 1;
      }))()`);
    expect(fits).toEqual([true, true]);
  });

  test('a glass bubble slides to the hovered item and hides when the pointer leaves', async ({ page }) => {
    await page.goto('/');
    const bubble = page.locator('[data-dock-bubble]');
    const offset = (selector: string) => async () => {
      const [b, t] = await Promise.all([bubble.boundingBox(), page.locator(selector).boundingBox()]);
      return b && t ? Math.abs(b.x + b.width / 2 - (t.x + t.width / 2)) : 99;
    };
    await expect(bubble).not.toHaveAttribute('data-visible', '');
    await page.locator('[data-dock-docs]').hover();
    await expect(bubble).toHaveAttribute('data-visible', '');
    await expect.poll(offset('[data-dock-docs]')).toBeLessThan(2);
    await page.locator('[data-dock] [data-dock-link=ecosystem]').hover();
    await expect.poll(offset('[data-dock] [data-dock-link=ecosystem]')).toBeLessThan(2);
    await page.mouse.move(100, 600);
    await expect(bubble).not.toHaveAttribute('data-visible', '');
  });

  test('keeps the lockup and actions inside the viewport at lg and tablet widths without overlap', async ({ page }) => {
    for (const width of [1024, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const logo = await page.locator('[data-header-logo]').boundingBox();
      const capsule = await page.locator('[data-dock]').boundingBox();
      const actions = await page.locator('[data-dock-actions]').boundingBox();
      expect(logo && capsule && actions).toBeTruthy();
      if (!logo || !capsule || !actions) return;
      expect(logo.x).toBeGreaterThanOrEqual(0);
      expect(logo.x + logo.width).toBeLessThanOrEqual(capsule.x);
      expect(capsule.x + capsule.width).toBeLessThanOrEqual(actions.x);
      expect(actions.x + actions.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    }
  });
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test('shows the lockup and one small glass island with Launch app and the menu button; the sheet opens and closes with Escape', async ({
    page,
  }) => {
    await page.goto('/');
    const island = await page.locator('[data-dock-actions]').boundingBox();
    expect(Math.round(island?.height ?? 0)).toBe(56);
    expect(Math.round(island?.y ?? 0)).toBe(16);
    await expect(page.locator('[data-dock]')).toBeHidden();
    await expect(page.locator('[data-dock-island]:visible')).toHaveCount(1);
    const logo = await page.locator('[data-header-logo]').boundingBox();
    const launch = await page.locator('[data-dock-cta]:visible').boundingBox();
    const menuButton = page.getByRole('button', { name: 'Open menu' });
    const mb = await menuButton.boundingBox();
    expect(logo && launch && mb && logo.x + logo.width <= launch.x && launch.x + launch.width <= mb.x).toBe(true);
    expect(mb && mb.width >= 44 && mb.height >= 44 && mb.x + mb.width <= 390).toBe(true);
    await expect(page.locator('[data-dock-signin]')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
    await expect(page.locator('[data-dock-actions] [data-glass]')).not.toHaveAttribute('data-lens', '');
    expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);

    await menuButton.click();
    const sheet = page.locator('[data-dock-sheet]');
    await expect(sheet.getByRole('link', { name: /Ecosystem/ })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Launch app' })).toBeVisible();
    const row = await sheet.getByRole('link', { name: /Collateral/ }).boundingBox();
    expect(row?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(menuButton).toBeFocused();
  });

  test('the sheet covers the viewport and a chapter link closes it and navigates', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const sheet = page.locator('[data-dock-sheet]');
    await expect(sheet).toBeVisible();
    // the sheet rises in (scale + fade): measure once it has landed
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box && [box.x, box.y, box.width, box.height].map(Math.round);
      })
      .toEqual([0, 0, 390, 780]);
    await sheet.getByRole('link', { name: /Judge/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe('/judge');
  });

  test('ends with the information footer, flush with the page bottom (no dead space)', async ({ page }) => {
    await page.goto('/');
    await storyMounted(page);
    await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    const footer = page.locator('[data-site-footer]');
    await expect(footer).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Docs' })).toBeVisible();
    await expect
      .poll(async () => {
        const b = await footer.boundingBox();
        return b ? Math.abs(Math.round(780 - (b.y + b.height))) : 99;
      })
      .toBe(0);
    expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
  });
});
