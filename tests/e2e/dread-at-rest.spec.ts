import { expect, test, type Page } from '@playwright/test';
import { createDirector } from '../../src/director';
import { scoreFromRequest } from '../../src/score/pipeline';
import { DEMO_SCENE, DEMO_SEED } from '../../src/web/demo';
import { stingTag } from '../../src/web/views/dread';

/** The heartbeat level the chip canvas reports, sampled every 150 ms for `ms`. */
async function sampleHeartbeat(page: Page, ms: number): Promise<string[]> {
  const seen: string[] = [];
  for (let t = 0; t < ms; t += 150) {
    seen.push((await page.locator('#chip').getAttribute('data-heartbeat-level')) ?? 'none');
    await page.waitForTimeout(150);
  }
  return seen;
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('dread at rest', () => {
  test('the chip pads beat at about 50 a minute and the masthead trace flickers by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#chip')).toHaveAttribute('data-heartbeat-bpm', '50');
    const levels = await sampleHeartbeat(page, 2_400);
    expect(new Set(levels).size).toBeGreaterThan(3);
    const trace = await page.locator('.masthead').evaluate((el) => getComputedStyle(el, '::before').animationName);
    expect(trace).not.toBe('none');
    await expect(page.locator('html')).toHaveAttribute('data-rest', 'true');
  });

  test('the heartbeat and the trace are static under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#chip')).toHaveAttribute('data-heartbeat-bpm', '50');
    const levels = await sampleHeartbeat(page, 1_500);
    expect(new Set(levels).size).toBe(1);
    const trace = await page.locator('.masthead').evaluate((el) => getComputedStyle(el, '::before').animationName);
    expect(trace).toBe('none');
  });

  test("the sting marker's tag reads the cue's sting time", async ({ page }) => {
    const score = await scoreFromRequest(createDirector('local', {}), { seed: DEMO_SEED, scene: DEMO_SCENE });
    const sting = score.plan.cues.find((c) => c.kind === 'sting');
    expect(sting).toBeDefined();
    await page.goto('/');
    await expect(page.locator('#timeline')).toHaveAttribute('data-sting-tag', stingTag(sting!.atSec), { timeout: 60_000 });
    await expect(page.locator('#timeline')).toHaveAttribute('data-sting-tag', '1:10');
    // The marker pulses by default.
    const pulses = new Set<string>();
    for (let t = 0; t < 2_400; t += 150) {
      pulses.add((await page.locator('#timeline').getAttribute('data-sting-pulse')) ?? 'none');
      await page.waitForTimeout(150);
    }
    expect(pulses.size).toBeGreaterThan(3);
  });

  test('the sting marker holds still under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#timeline')).toHaveAttribute('data-sting-tag', '1:10', { timeout: 60_000 });
    const pulses = new Set<string>();
    for (let t = 0; t < 1_500; t += 150) {
      pulses.add((await page.locator('#timeline').getAttribute('data-sting-pulse')) ?? 'none');
      await page.waitForTimeout(150);
    }
    expect(pulses.size).toBe(1);
  });

  test('the board is darker at rest and lifts to the plain mask while a cue plays', async ({ page }) => {
    await page.goto('/');
    const mask = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mask').trim());
    expect(await mask()).toBe('#081a15');
    await page.getByRole('button', { name: /Listen\. The scare lands at 1:10/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-rest', 'false');
    expect(await mask()).toBe('#0c241d');
    await expect(page.locator('#chip')).not.toHaveAttribute('data-heartbeat-level', /.+/);
  });

  for (const width of [360, 390, 1360]) {
    test(`fits without horizontal scroll at ${width} px, at rest and under reduced motion`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.locator('#chip')).toHaveAttribute('data-heartbeat-bpm', '50');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});
