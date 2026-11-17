import { expect, test } from '@playwright/test';

test.describe('first view and the live chip', () => {
  test('shows a real demo cue on first load, ready to play, without touching the URL', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#status')).toHaveText('Ready: press Play');
    await expect(page.locator('#cue-meta')).toContainText('Demo cue from "Creeping dread in the cellar');
    await expect(page.locator('#director-notes')).toContainText('Sting at 1:10.0');
    await expect(page.getByRole('button', { name: 'Play' })).toHaveClass(/btn--beckon/);
    await expect(page.getByRole('button', { name: 'Download WAV' })).toBeEnabled();
    // The form stays clean, so the user's own request is not mixed with the demo.
    await expect(page.getByLabel('Describe the scene')).toHaveValue('');
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
  });

  test('a newer request replaces the demo render instead of racing it', async ({ page }) => {
    await page.goto('/');
    await page.locator('label.mood', { hasText: 'Chase' }).click();
    await page.getByLabel('Length (seconds)').fill('6');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#cue-meta')).toContainText('Chase');
    await expect(page.locator('#cue-meta')).not.toContainText('Demo cue');
    await expect(page.locator('#clock')).toContainText('/ 0:06.0');
  });

  test('synthesizes audio in real time on the AudioWorklet when a key is played', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Patch' }).selectOption('glass-bell');
    await expect(page.locator('#live-blurb')).toContainText('inharmonic bell');
    await expect(page.locator('#live-octave')).toHaveText('C5');

    const status = page.locator('#live-status');
    // Hold A (the bottom C) on the computer keyboard.
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.down('a');
    await expect(page.locator('.key[data-index="0"]')).toHaveClass(/key--down/);
    await expect.poll(async () => Number(await status.getAttribute('data-voices')), { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => Number(await status.getAttribute('data-peak')), { timeout: 10_000 }).toBeGreaterThan(0.01);
    await expect(status).toContainText('in real time');

    // A chord from the on-screen keys adds voices.
    const key = page.locator('.key[data-index="4"]');
    await key.scrollIntoViewIfNeeded();
    const box = (await key.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);
    await page.mouse.down();
    await expect.poll(async () => Number(await status.getAttribute('data-voices')), { timeout: 10_000 }).toBe(2);
    await page.mouse.up();
    await page.keyboard.up('a');

    // Released notes ring out, then the chip falls silent but keeps running.
    await expect.poll(async () => Number(await status.getAttribute('data-voices')), { timeout: 20_000 }).toBe(0);
    const before = Number(await status.getAttribute('data-frames'));
    await expect.poll(async () => Number(await status.getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });
});
