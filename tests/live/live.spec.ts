import { expect, test } from '@playwright/test';
import { DEMO_WAV_SHA256 } from '../../src/web/demo';

test.describe('the deployed site', () => {
  test('serves the app, plays the demo preview and renders the demo to the published hash', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Fright Score' })).toBeVisible();

    const listen = page.getByRole('button', { name: /Listen\. The scare lands at 1:10/ });
    await expect(listen).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Jump to the scare' })).toBeEnabled();

    await expect(page.locator('#render-proof')).toHaveAttribute('data-sha256', DEMO_WAV_SHA256, { timeout: 90_000 });
    await expect(page.locator('#render-proof')).toContainText('Live render matches the published demo');
  });
});
