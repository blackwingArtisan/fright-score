import { expect, test } from '@playwright/test';

test.describe('transport and loading states', () => {
  test('a new summon resets Play and the clock, and the panels show what is coming while it renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    await page.locator('label.mood', { hasText: 'Ritual' }).click();
    await page.getByLabel('Length (seconds)').fill('20');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    // While the new cue renders: a disabled Play, the clock on the new length, ghost text in the stitch.
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'rendering');
    await expect(page.locator('#play')).toHaveText('Play');
    await expect(page.locator('#play')).toBeDisabled();
    await expect(page.locator('#clock')).toHaveText('0:00.0 / 0:20.0');
    await expect(page.locator('#stitch-writes .stitch__ghost')).toBeVisible();
    await expect(page.locator('#stitch-plan')).toContainText('"mood": "ritual"');

    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#stitch-writes .stitch__ghost')).toHaveCount(0);
    await expect(page.locator('#play')).toBeEnabled();
  });

  test('Download WAV is the one primary action and the rest sit in a More menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Download WAV' })).toHaveClass(/btn--primary/);
    await expect(page.getByRole('button', { name: 'Download for Sega Genesis' })).toBeVisible();
    const share = page.getByRole('button', { name: 'Copy share link' });
    await expect(share).toBeHidden();
    await page.locator('#export-menu > summary').click();
    await expect(share).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(share).toBeHidden();
    await page.locator('#export-menu > summary').click();
    await page.locator('.cue-title').click();
    await expect(share).toBeHidden();
  });

  test('the piano is one tab stop and the arrow keys move between keys', async ({ page }) => {
    await page.goto('/');
    const keys = page.locator('.key');
    await expect(keys).toHaveCount(13);
    await expect(page.locator('.key[tabindex="0"]')).toHaveCount(1);
    await keys.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(keys.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(keys.nth(12)).toBeFocused();
    await expect(keys.nth(12)).toHaveAttribute('tabindex', '0');
    await expect(keys.first()).toHaveAttribute('tabindex', '-1');
    const outline = await keys.nth(12).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
  });
});
