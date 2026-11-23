import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { readZip } from '../../src/export/zip';
import { parseWav } from '../../src/wav/wav';

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function summonShort(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('label.mood', { hasText: 'Stalker' }).click();
  await page.getByLabel('Length (seconds)').fill('10');
  await page.getByLabel('Sting at').fill('0:08');
  await page.getByLabel('Seed').fill('11');
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
}

test.describe('Drop into Godot (Requirement 18)', () => {
  test('the button downloads a zip with the add-on, both WAVs and README.txt', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Drop into Godot' })).toBeVisible();
    // Nothing to export until a cue has rendered.
    await expect(page.locator('#export-godot')).toBeDisabled();
    await summonShort(page);
    await expect(page.locator('#export-godot')).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Godot pack (.zip)' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^fright-score-godot-.*-seed11\.zip$/);
    const files = readZip(readFileSync((await download.path())!));
    const names = files.map((f) => f.name);
    for (const name of ['fright_score_cue.gd', 'plugin.cfg', 'plugin.gd']) expect(names).toContain(`addons/fright_score/${name}`);
    expect(names).toContain('README.txt');
    const loop = files.find((f) => f.name.endsWith('-loop.wav'))!;
    const sting = files.find((f) => f.name.endsWith('-sting.wav'))!;
    expect(loop).toBeDefined();
    expect(sting).toBeDefined();
    expect(parseWav(loop.data).loop).toBeDefined();
    expect(parseWav(sting.data).durationSec).toBeCloseTo(5, 2);
    const readme = new TextDecoder().decode(files.find((f) => f.name === 'README.txt')!.data);
    expect(readme).toContain('A stock site charges about $18-48 for this. Yours, royalty-free.');
    await expect(page.locator('#godot-status')).toHaveText('Godot pack downloaded.');
    await expect(page.locator('#export-godot')).toBeEnabled();
  });

  test('the same cue gives the same zip twice', async ({ page }) => {
    await summonShort(page);
    const bytes: Buffer[] = [];
    for (let i = 0; i < 2; i++) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-godot').click()]);
      bytes.push(readFileSync((await download.path())!));
      await expect(page.locator('#godot-status')).toHaveText('Godot pack downloaded.');
    }
    expect(bytes[0].equals(bytes[1])).toBe(true);
  });

  for (const [width, height] of [[360, 740], [390, 844], [1360, 900]] as const) {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      test(`the card fits at ${width} px with ${reducedMotion} motion`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion });
        await page.goto('/');
        const card = page.locator('#godot-card');
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        const box = (await card.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      });
    }
  }
});
