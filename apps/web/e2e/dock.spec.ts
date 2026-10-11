import { expect, test } from '@playwright/test';
import { openProtocolMenu, revealNav, scrollSettled, storyMounted } from './story.ts';

test.describe('desktop top bar', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('is a floating black bar: contained, centred, 16px from the top; lockup left, links and actions right', async ({
    page,
  }) => {
    await page.goto('/');
    const root = page.locator('[data-dock-root]');
    await expect(root).toHaveAttribute('data-nav-state', 'full');
    const pill = await page.locator('[data-dock]').boundingBox();
    expect(pill).not.toBeNull();
    if (!pill) return;
    expect(Math.round(pill.width)).toBe(1100);
    expect(Math.round(pill.height)).toBe(56);
    expect(Math.round(pill.y)).toBe(16);
    expect(Math.abs(pill.x + pill.width / 2 - 720)).toBeLessThan(2);
    const logo = await page.locator('[data-header-logo]').boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Primary' }).boundingBox();
    const signIn = await page.locator('[data-dock-signin]').boundingBox();
    const launch = await page.locator('[data-dock-cta]').boundingBox();
    expect(logo && nav && signIn && launch).toBeTruthy();
    if (!logo || !nav || !signIn || !launch) return;
    expect(logo.x + logo.width).toBeLessThanOrEqual(nav.x);
    expect(nav.x + nav.width).toBeLessThanOrEqual(signIn.x);
    expect(signIn.x + signIn.width).toBeLessThanOrEqual(launch.x);
    expect(launch.x + launch.width).toBeLessThanOrEqual(pill.x + pill.width);
    await expect(page.locator('[data-dock-root] [data-logo-jelly]:visible')).toHaveCount(1);
    await expect(page.locator('[data-dock]').getByRole('link', { name: 'Launch app' })).toHaveAttribute(
      'href',
      'https://app.windle.fun',
    );
    await expect(page.locator('[data-dock]').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
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

  test('the Protocol menu opens and moves with the keyboard', async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Protocol' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.locator('[data-dock-menu]');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('[data-dock-link]').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.locator('[data-dock-link]').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('collapses to a compact block, hides on the way down, returns compact on the way up, expands on hover', async ({
    page,
  }) => {
    await page.goto('/');
    const reduced = await page.evaluate<boolean>("matchMedia('(prefers-reduced-motion: reduce)').matches");
    const root = page.locator('[data-dock-root]');
    const pill = page.locator('[data-dock]');
    await expect(root).toHaveAttribute('data-nav-state', 'full');
    await page.evaluate('window.scrollTo(0, 200)');
    await expect(root).toHaveAttribute('data-nav-state', 'compact');
    await expect.poll(async () => Math.round((await pill.boundingBox())?.width ?? 0)).toBe(192);
    await expect(page.locator('[data-dock-signin]')).toBeHidden();
    await expect(page.locator('[data-dock-cta]')).toBeVisible();
    await expect(page.locator('[data-header-logo]')).toBeVisible();
    if (reduced) {
      await page.evaluate('window.scrollTo(0, 1400)');
      await scrollSettled(page);
      await expect(root).not.toHaveAttribute('data-nav-state', 'hidden');
      return;
    }
    await page.evaluate('window.scrollTo(0, 1400)');
    await expect(root).toHaveAttribute('data-nav-state', 'hidden');
    await scrollSettled(page);
    await page.evaluate('window.scrollBy(0, -80)');
    await expect(root).toHaveAttribute('data-nav-state', 'compact');
    await pill.hover();
    await expect(root).toHaveAttribute('data-nav-state', 'full');
    await expect.poll(async () => Math.round((await pill.boundingBox())?.width ?? 0)).toBe(1100);
    await expect(page.locator('[data-dock-signin]')).toBeVisible();
    await page.mouse.move(700, 600);
    await expect(root).toHaveAttribute('data-nav-state', 'compact');
    await page.evaluate('window.scrollTo(0, 0)');
    await expect(root).toHaveAttribute('data-nav-state', 'full');
  });

  test('keyboard focus inside the bar forces it visible and full', async ({ page }) => {
    await page.goto('/');
    await page.evaluate('window.scrollTo(0, 200)');
    const root = page.locator('[data-dock-root]');
    await expect(root).toHaveAttribute('data-nav-state', 'compact');
    await page.keyboard.press('Tab'); // skip link first, then into the bar
    await page.keyboard.press('Tab');
    await expect(root).toHaveAttribute('data-nav-state', 'full');
  });

  test('keeps the lockup and actions inside the viewport at lg and tablet widths', async ({ page }) => {
    for (const width of [1024, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const bar = await page.locator('[data-dock]').boundingBox();
      expect(bar && bar.x >= 0 && bar.x + bar.width <= width).toBe(true);
      const logo = await page.locator('[data-header-logo]').boundingBox();
      const launch = await page.locator('[data-dock-cta]:visible').boundingBox();
      expect(logo && launch && logo.x + logo.width <= launch.x).toBe(true);
      expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    }
  });

  test('scroll progress hairline fills along the bar', async ({ page }) => {
    await page.goto('/');
    await storyMounted(page);
    await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight / 2)');
    await revealNav(page);
    const share = await page.locator('[data-dock-progress-fill]').evaluate((el) => {
      const track = el.parentElement?.getBoundingClientRect().width ?? 1;
      return el.getBoundingClientRect().width / track;
    });
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.7);
  });
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test('shows the lockup, a compact Launch app and the menu button; the sheet opens and closes with Escape', async ({
    page,
  }) => {
    await page.goto('/');
    const pill = await page.locator('[data-dock]').boundingBox();
    expect(Math.round(pill?.height ?? 0)).toBe(56);
    expect(Math.round(pill?.y ?? 0)).toBe(16);
    const logo = await page.locator('[data-header-logo]').boundingBox();
    const launch = await page.locator('[data-dock-cta]:visible').boundingBox();
    const menuButton = page.getByRole('button', { name: 'Open menu' });
    const mb = await menuButton.boundingBox();
    expect(logo && launch && mb && logo.x + logo.width <= launch.x && launch.x + launch.width <= mb.x).toBe(true);
    expect(mb && mb.x + mb.width <= 390).toBe(true);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
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
