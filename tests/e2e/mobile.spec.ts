import { expect, test } from '@playwright/test';

test('works at phone width without horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Music box' }).click();
  await page.getByLabel('Length (seconds)').fill('8');
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Download WAV' })).toBeEnabled();
});

test('on a phone the cue and its Listen button come before the form, in the first screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  const listen = page.getByRole('button', { name: /Listen\. The scare lands at 1:10/ });
  await expect(listen).toBeInViewport();
  const stageTop = (await page.locator('.stage').boundingBox())!.y;
  const formTop = (await page.locator('#direction').boundingBox())!.y;
  expect(stageTop).toBeLessThan(formTop);
});

test('on a phone the form sits right after the transport, and a pinned button jumps to it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  const transport = (await page.locator('.transport').boundingBox())!;
  const form = (await page.locator('#direction').boundingBox())!;
  const chip = (await page.locator('.chip-wrap').boundingBox())!;
  expect(form.y).toBeGreaterThanOrEqual(transport.y + transport.height);
  expect(form.y).toBeLessThan(chip.y);

  const cta = page.getByRole('link', { name: 'Write your scene' });
  // The button stays hidden while the transport is on screen, and shows once the transport scrolls away.
  await expect(cta).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.chip-wrap')!.getBoundingClientRect().top + window.scrollY));
  await expect(cta).toBeInViewport();
  await cta.click();
  await expect(page.getByLabel('Describe the scene')).toBeFocused();
  await expect(page.getByLabel('Describe the scene')).toBeInViewport();
  await expect(cta).toBeHidden();
});

test('on a phone the Listen overlay is small, sits at the lower left, and fades once the render passes it', async ({ page }) => {
  await page.goto('/');
  const listen = page.getByRole('button', { name: /Listen\. The scare lands at 1:10/ });
  await expect(listen).toBeVisible({ timeout: 10_000 });
  const timeline = (await page.locator('#timeline').boundingBox())!;
  const box = (await listen.boundingBox())!;
  expect(box.x - timeline.x).toBeLessThan(16);
  expect(box.y + box.height).toBeGreaterThan(timeline.y + timeline.height * 0.7);
  expect(box.height).toBeLessThanOrEqual(48);
  expect(box.width).toBeLessThan(timeline.width * 0.75);
  await expect(page.locator('#listen')).toHaveClass(/listen--passed/, { timeout: 60_000 });
  await expect.poll(() => page.locator('#listen').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
});
