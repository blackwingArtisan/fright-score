import { expect, test } from '@playwright/test';

test('on a wide screen the form stays in view while the board scrolls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'Write your scene' })).toBeHidden();
  await page.locator('#live').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Summon the score' })).toBeInViewport();
  const form = (await page.locator('#direction').boundingBox())!;
  expect(form.y).toBeGreaterThanOrEqual(0);
});
