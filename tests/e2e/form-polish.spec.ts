import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { DEMO_WAV_SHA256, sha256Hex } from '../../src/web/demo';

const PREVIEW_STATE = { timeout: 10_000 };

test.describe('form and demo-render polish (Requirement 15)', () => {
  test('Summon shows every field error at once, focuses the first, and leaves the running render alone', async ({ page }) => {
    await page.goto('/');
    const length = page.getByLabel('Length (seconds)');
    const stings = page.getByLabel('Sting at');
    await length.fill('2');
    await stings.fill('0:10, soon');
    await page.getByRole('button', { name: 'Summon the score' }).click();

    await expect(page.locator('#seconds-error')).toHaveText('Use 5 to 300 seconds.');
    await expect(page.locator('#stings-error')).toHaveText('"soon" is not a time. Use 1:10 or 70, separated by commas.');
    await expect(length).toHaveAttribute('aria-invalid', 'true');
    await expect(stings).toHaveAttribute('aria-invalid', 'true');
    await expect(length).toBeFocused();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#status')).toHaveText('Check the length and the sting times');

    // The demo render that was already running is not cancelled by a bad form, and its progress does not
    // overwrite the error message.
    await expect(page.locator('#play')).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator('#render-proof')).toHaveAttribute('data-sha256', DEMO_WAV_SHA256);
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');

    // Fixing one field clears only its error; fixing both brings the status back to what the page was doing.
    await length.fill('20');
    await expect(page.locator('#seconds-error')).toBeHidden();
    await expect(page.locator('#stings-error')).toBeVisible();
    await stings.fill('0:10');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready');
  });

  test('Download WAV, Download for Sega Genesis and Summon stay enabled while the demo renders', async ({ page }) => {
    await page.goto('/');
    const status = page.locator('#status');
    const wav = page.getByRole('button', { name: 'Download WAV' });
    const genesis = page.getByRole('button', { name: 'Download for Sega Genesis' });
    await expect(status).toHaveAttribute('data-state', 'preview', PREVIEW_STATE);
    await expect(wav).toBeEnabled();
    await expect(genesis).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Summon the score' })).toBeEnabled();

    // WAV queues first, says so, and delivers when the exact render lands.
    const wavDownload = page.waitForEvent('download', { timeout: 60_000, predicate: (d) => d.suggestedFilename().endsWith('.wav') });
    await wav.click();
    await expect(wav).toHaveAttribute('data-queued', 'true', { timeout: 2_000 });
    // The status line names the queued download (or, if the render lands first, the started one).
    await expect(status).toContainText(/WAV download (queued|started)/);

    // Genesis hands over the pre-rendered demo file at once: the same bytes the CLI writes.
    const [vgm] = await Promise.all([page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.vgm') }), genesis.click()]);
    expect(vgm.suggestedFilename()).toMatch(/^fright-score-.*-seed13\.vgm$/);
    const shipped = readFileSync(join(process.cwd(), 'samples/cellar-dread-genesis.vgm'));
    expect(await sha256Hex(readFileSync((await vgm.path())!))).toBe(await sha256Hex(shipped));

    const file = await wavDownload;
    expect(file.suggestedFilename()).toMatch(/^fright-score-.*-seed13\.wav$/);
    expect(await sha256Hex(readFileSync((await file.path())!))).toBe(DEMO_WAV_SHA256);
    await expect(wav).not.toHaveAttribute('data-queued', 'true');
    await expect(page.locator('#render-proof')).toHaveAttribute('data-sha256', DEMO_WAV_SHA256);
  });

  test('Summon during the demo render restarts with the new request', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'preview', PREVIEW_STATE);
    await page.getByRole('button', { name: 'Download WAV' }).click();
    await page.locator('label.mood', { hasText: 'Ritual' }).click();
    await page.getByLabel('Length (seconds)').fill('5');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#clock')).toHaveText('0:00.0 / 0:05.0');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#cue-meta')).toContainText('0:05.0');
    await expect(page.locator('#cue-meta')).not.toContainText('Demo cue');
    // The queued download belonged to the replaced cue: it is dropped, not delivered.
    await expect(page.getByRole('button', { name: 'Download WAV' })).not.toHaveAttribute('data-queued', 'true');
  });

  test('the "Rendering on the FS-666" label sits at the top right of the timeline canvas', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('#timeline');
    await expect(canvas).toHaveAttribute('data-progress-label', 'top-right', { timeout: 10_000 });
    const box = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return { width: c.clientWidth, x: Number(c.dataset.progressLabelX), y: Number(c.dataset.progressLabelY), w: Number(c.dataset.progressLabelW) };
    });
    expect(Math.abs(box.x + box.w - (box.width - 8))).toBeLessThanOrEqual(1);
    expect(box.y).toBeLessThanOrEqual(12);
    await expect(canvas).not.toHaveAttribute('data-progress-label', /./, { timeout: 60_000 });
  });

  test('a muted hint asks for sound on and headphones', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Sound on, best with headphones')).toBeVisible();
  });
});
