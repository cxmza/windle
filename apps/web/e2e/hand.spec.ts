import { expect, type Page, test } from '@playwright/test';
import { storyMounted } from './story.ts';

const centers = (page: Page, annotation: string) =>
  page.locator(`[data-annotation=${annotation}] [data-stroke-center]`);

async function expectDrawn(page: Page, annotation: string, timeout?: number) {
  const paths = centers(page, annotation);
  await expect(paths).toHaveCount(2);
  for (const path of await paths.all()) await expect(path).toHaveCSS('stroke-dashoffset', '0px', { timeout });
}

test('market margin note ends fully drawn after its caption lands', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-market-chip]').scrollIntoViewIfNeeded();
  await expectDrawn(page, 'market-odds', 10_000);
});

test('buying YES moves the price', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-market-chip]').scrollIntoViewIfNeeded();
  const yes = page.locator('[data-price=yes]');
  await expect(yes).toHaveText(/72/, { timeout: 10_000 });
  await page.locator('[data-buy=yes]').click();
  await expect(yes).not.toHaveText(/^72/, { timeout: 5_000 });
});

test('countdown can be paused', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause timer' }).click();
  await expect(page.getByRole('button', { name: 'Resume timer' })).toBeVisible();
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('drawings are finished from the start and there is no pencil overlay', async ({ page }) => {
    await page.goto('/');
    await storyMounted(page);
    await expectDrawn(page, 'hero-underline', 1);
    await expectDrawn(page, 'market-odds', 1);
    await expect(page.locator('[data-pencil-cursor]')).toHaveCount(0);
  });
});

test('ecosystem chapter exposes three logo slots with sketches and safe links', async ({ page }, testInfo) => {
  await page.goto('/');
  await storyMounted(page);
  const slots = page.locator('#ecosystem [data-logo-slot]');
  await expect(slots).toHaveCount(3);
  for (const id of ['solana', 'pumpfun', 'x']) {
    await expect(page.locator(`[data-logo-slot=${id}] [data-stroke]`).first()).toBeAttached();
  }
  await expect(page.getByRole('link', { name: /^Solana/ })).toHaveAttribute('href', 'https://solana.com');
  // the hand overlay exists only with motion allowed (the reduced-motion project and the describe below cover its absence)
  if (!testInfo.project.name.includes('reduced')) {
    await expect(page.locator('[data-drawing-hand]')).toHaveAttribute('data-hand-state', 'idle');
  }
});

test.describe('reduced motion: drawing hand', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('is not rendered and logo sketches are already finished', async ({ page }) => {
    await page.goto('/');
    await storyMounted(page);
    await expect(page.locator('[data-drawing-hand]')).toHaveCount(0);
    const center = page.locator('[data-logo-slot=x] [data-stroke-center]').first();
    await expect(center).toHaveCSS('stroke-dashoffset', '0px', { timeout: 1 });
  });
});
