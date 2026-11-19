import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseWav } from '../../src/wav/wav';

test.describe('Fright Score in the browser', () => {
  test('summons a cue from a scene, plays it on the chip and exports a valid WAV', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Fright Score', level: 1 })).toBeVisible();

    await page.getByLabel('Describe the scene').fill('Creeping dread in the cellar, 12 seconds, builds to a sting at 0:09');
    await expect(page.locator('#heard')).toContainText('sting at 0:09');
    await page.getByLabel('Seed').fill('7');
    await page.getByRole('button', { name: 'Summon the score' }).click();

    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#cue-title')).not.toHaveText('No cue yet');
    await expect(page.locator('#cue-meta')).toContainText('BPM');
    await expect(page.locator('#director-notes')).toContainText('Sting at 0:09.0');
    await expect(page.locator('#render-stats')).toContainText(/True peak -\d+\.\d dBTP, -1\d\.\d LUFS/);

    // Play: the playhead moves.
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    await expect
      .poll(async () => Number(await page.locator('#clock').getAttribute('data-position')), { timeout: 10_000 })
      .toBeGreaterThan(0.3);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#status')).toHaveText('Paused');

    // Export: a real 44.1 kHz 16-bit stereo WAV of exactly the requested length.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download WAV' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^fright-score-.*-seed7\.wav$/);
    const info = parseWav(readFileSync((await download.path())!));
    expect(info.sampleRate).toBe(44_100);
    expect(info.channels).toBe(2);
    expect(info.bitsPerSample).toBe(16);
    expect(info.frameCount).toBe(12 * 44_100);
    let peak = 0;
    for (const s of info.samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(10_000);
    expect(peak).toBeLessThan(32_767);

    const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download score JSON' }).click()]);
    const score = JSON.parse(readFileSync((await jsonDownload.path())!, 'utf8'));
    expect(score.seed).toBe(7);
    expect(score.plan.cues.some((c: { kind: string; atSec: number }) => c.kind === 'sting' && c.atSec === 9)).toBe(true);

    expect(errors).toEqual([]);
  });

  test('the browser export matches the CLI byte for byte for the same request', async ({ page }) => {
    const { runCli } = await import('../../src/cli/score');
    const { mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const out = join(mkdtempSync(join(tmpdir(), 'fright-e2e-')), 'cli.wav');
    await runCli(['--mood', 'ritual', '--seconds', '8', '--seed', '21', '--out', out, '--quiet'], {}, () => {});

    await page.goto('/');
    await page.locator('label.mood', { hasText: 'Ritual' }).click();
    await page.getByLabel('Length (seconds)').fill('8');
    await page.getByLabel('Seed').fill('21');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download WAV' }).click()]);
    const browserBytes = readFileSync((await download.path())!);
    expect(browserBytes.equals(readFileSync(out))).toBe(true);
  });

  test('explains bad input instead of failing silently', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Length (seconds)').fill('2');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#status')).toContainText('5 to 300 seconds');
  });

  test('candle-flickers the masthead and disables it under prefers-reduced-motion', async ({ page }) => {
    await page.goto('/');
    // By default the cursed masthead title carries the candle-flicker animation.
    const onName = await page.locator('h1').evaluate((el) => getComputedStyle(el).animationName);
    expect(onName).not.toBe('none');
    // Under reduced motion the global reduced-motion rule turns the flicker off.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const offName = await page.locator('h1').evaluate((el) => getComputedStyle(el).animationName);
    expect(offName).toBe('none');
  });
});
