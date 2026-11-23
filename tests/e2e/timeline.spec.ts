import { expect, test, type Page } from '@playwright/test';

async function summonCue(page: Page, seconds: number) {
  await page.goto('/');
  await page.locator('label.mood', { hasText: 'Stalker' }).click();
  await page.getByLabel('Length (seconds)').fill(String(seconds));
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.locator('#clock')).toContainText(`/ 0:${String(seconds).padStart(2, '0')}.0`);
}

const position = async (page: Page) => Number(await page.locator('#clock').getAttribute('data-position'));

test.describe('the timeline moves the playhead (Requirement 8.4)', () => {
  test('a click puts the playhead at that point of the cue while paused', async ({ page }) => {
    await summonCue(page, 20);
    const timeline = page.locator('#timeline');
    const width = (await timeline.boundingBox())!.width;
    expect(await position(page)).toBe(0);

    // Click along the top of the canvas: until the first play, the Listen button covers the middle of it.
    for (const fraction of [0.25, 0.75, 0.5]) {
      await timeline.click({ position: { x: width * fraction, y: 20 } });
      await expect.poll(async () => Math.abs((await position(page)) - 20 * fraction), { timeout: 5_000 }).toBeLessThan(0.3);
      await expect(page.locator('#clock')).toContainText(`0:${String(Math.floor(20 * fraction)).padStart(2, '0')}`);
      // The slider value follows (it updates a few times a second), so assistive technology hears the new position.
      await expect.poll(async () => Number(await timeline.getAttribute('aria-valuenow')), { timeout: 5_000 }).toBeCloseTo(20 * fraction, 0);
    }
    // Moving the playhead does not start playback.
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('a click while playing continues from the new point', async ({ page }) => {
    await summonCue(page, 20);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    const timeline = page.locator('#timeline');
    const width = (await timeline.boundingBox())!.width;
    await timeline.click({ position: { x: width * 0.6, y: 20 } });
    // The cue keeps playing, so the playhead is at or just past 60% (12 s) and moving.
    await expect.poll(() => position(page), { timeout: 5_000 }).toBeGreaterThan(12 - 0.3);
    expect(await position(page)).toBeLessThan(12 + 4);
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    const first = await position(page);
    await expect.poll(() => position(page), { timeout: 5_000 }).toBeGreaterThan(first + 0.3);
  });

  test('a click at either edge clamps to the start and the end', async ({ page }) => {
    await summonCue(page, 20);
    const timeline = page.locator('#timeline');
    const width = (await timeline.boundingBox())!.width;
    await timeline.click({ position: { x: width - 1, y: 20 } });
    await expect.poll(() => position(page), { timeout: 5_000 }).toBeGreaterThan(19);
    expect(await position(page)).toBeLessThanOrEqual(20);
    await timeline.click({ position: { x: 1, y: 20 } });
    await expect.poll(() => position(page), { timeout: 5_000 }).toBeLessThan(1);
  });
});
