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
  await expect(cta).toBeInViewport();
  await cta.click();
  await expect(page.getByLabel('Describe the scene')).toBeFocused();
  await expect(page.getByLabel('Describe the scene')).toBeInViewport();
  await expect(cta).toBeHidden();
});
