import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseVgm, YM2612_CLOCK_HZ } from '../../src/export/vgm';

test('exports the cue for the Sega Genesis as a VGM file of YM2612 register writes', async ({ page }) => {
  await page.goto('/');
  await page.locator('label.mood', { hasText: 'Stalker' }).click();
  await page.getByLabel('Length (seconds)').fill('10');
  await page.getByLabel('Sting at').fill('0:08');
  await page.getByLabel('Seed').fill('11');
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download for Sega Genesis' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^fright-score-.*-seed11\.vgm$/);
  const vgm = parseVgm(readFileSync((await download.path())!));
  expect(vgm.ym2612ClockHz).toBe(YM2612_CLOCK_HZ);
  expect(vgm.totalSamples).toBe(10 * 44_100);
  expect(vgm.waitedSamples).toBe(vgm.totalSamples);
  // The sting keys on exactly at 0:08.
  expect(vgm.writes.some((w) => w.reg === 0x28 && (w.value & 0xf0) !== 0 && w.at === 8 * 44_100)).toBe(true);
});
