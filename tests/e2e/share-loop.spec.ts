import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseWav } from '../../src/wav/wav';

test('a share link reproduces the exact same cue in a fresh page', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Describe the scene').fill('Footsteps behind you in the parking garage, 10 seconds, scream at 0:08');
  await page.getByLabel('Seed').fill('99');
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  const title = await page.locator('#cue-title').textContent();
  expect(page.url()).toContain('seed=99');
  const [first] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download WAV' }).click()]);

  const fresh = await context.newPage();
  await fresh.goto(page.url());
  await expect(fresh.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(fresh.locator('#cue-title')).toHaveText(title!);
  await expect(fresh.getByLabel('Describe the scene')).toHaveValue(/parking garage/);
  const [second] = await Promise.all([fresh.waitForEvent('download'), fresh.getByRole('button', { name: 'Download WAV' }).click()]);
  expect(readFileSync((await second.path())!).equals(readFileSync((await first.path())!))).toBe(true);
});

test('a seamless loop exports whole bars with loop points', async ({ page }) => {
  await page.goto('/');
  await page.locator('label.mood', { hasText: 'Chase' }).click();
  await page.getByLabel('Length (seconds)').fill('10');
  await page.getByLabel(/Seamless loop/).check();
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.locator('#cue-meta')).toContainText('Seamless loop');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download WAV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/-loop-seed\d+\.wav$/);
  const info = parseWav(readFileSync((await download.path())!));
  expect(info.loop).toEqual({ startFrame: 0, endFrame: info.frameCount - 1 });
});
