import { expect, test } from '@playwright/test';
import { DEMO_WAV_SHA256 } from '../../src/web/demo';

test.describe('instant first load', () => {
  test('Listen works from the pre-rendered preview before the live render finishes', async ({ page }) => {
    await page.goto('/');
    const listen = page.getByRole('button', { name: /Listen\. The scare lands at 1:10/ });
    await expect(listen).toBeVisible({ timeout: 3_000 });
    // The exact render is still running in the background.
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'preview');
    // Requirement 15: Download WAV stays enabled during the exact render; a click queues the download.
    await expect(page.getByRole('button', { name: 'Download WAV' })).toBeEnabled();
    await listen.click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    await expect
      .poll(async () => Number(await page.locator('#clock').getAttribute('data-position')), { timeout: 10_000 })
      .toBeGreaterThan(0.2);

    // When the live render lands, playback carries on in the exact render and its hash is checked.
    await expect(page.getByRole('button', { name: 'Download WAV' })).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('#render-proof')).toHaveAttribute('data-sha256', DEMO_WAV_SHA256);
    await expect(page.locator('#render-proof')).toContainText('Live render matches the published demo');
  });
});
