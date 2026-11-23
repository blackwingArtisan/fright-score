import { expect, test, type Page } from '@playwright/test';

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const ready = (page: Page) => expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
const data = async (page: Page, name: string) => Number(await page.locator('#chip').getAttribute(`data-${name}`));
const shown = async (page: Page) => ((await page.locator('#chip').getAttribute('data-lanes-shown')) ?? '').split(',').filter(Boolean);

test.describe('the chip panel at rest (Requirement 19)', () => {
  test('every shown lane has its full recorded envelope drawn as a ghost before playback', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#play')).toHaveText('Play');
    await expect(page.locator('#clock')).toHaveAttribute('data-position', '0.00');
    await expect(page.locator('#chip')).toHaveAttribute('data-ghost-lanes', '4');
    expect(await data(page, 'ghost-peak')).toBeGreaterThan(0.1);
    expect(await data(page, 'cursor')).toBe(0);
    // The ghost is really painted: the ribbon area to the right of the readouts holds copper pixels.
    const painted = await page.locator('#chip').evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')!;
      const { data: px } = ctx.getImageData(Math.floor(canvas.width * 0.7), 0, Math.floor(canvas.width * 0.3), canvas.height);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0 && px[i] > px[i + 2]) n++;
      return n;
    });
    expect(painted).toBeGreaterThan(200);
  });

  test('the playhead is a cursor on the ghost and follows a seek', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const slider = page.getByRole('slider', { name: /Score timeline/ });
    await slider.focus();
    await page.keyboard.press('Home');
    await expect.poll(() => data(page, 'cursor')).toBe(0);
    for (let i = 0; i < 4; i++) await page.keyboard.press('PageUp');
    await expect.poll(() => data(page, 'cursor')).toBeGreaterThan(0.1);
    await page.keyboard.press('End');
    await expect.poll(() => data(page, 'cursor')).toBeGreaterThan(0.9);
  });

  test('the panel collapses to four lanes, and "Show all N" shows and hides the rest', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const total = await data(page, 'lane-count');
    expect(total).toBeGreaterThan(4);
    const toggle = page.getByRole('button', { name: `Show all ${total}` });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await shown(page)).toHaveLength(4);
    const collapsedHeight = (await page.locator('#chip').boundingBox())!.height;

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(async () => (await shown(page)).length).toBe(total);
    await expect(page.locator('#chip')).toHaveAttribute('data-ghost-lanes', String(total));
    expect((await page.locator('#chip').boundingBox())!.height).toBeGreaterThan(collapsedHeight);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await shown(page)).length).toBe(4);
    expect((await page.locator('#chip').boundingBox())!.height).toBeCloseTo(collapsedHeight, 0);
  });

  test('on desktop the panel is an open details with no summary to click', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.locator('details#chip-panel')).toHaveJSProperty('open', true);
    await expect(page.locator('#chip-summary')).toBeHidden();
    await expect(page.locator('#chip')).toBeVisible();
  });

  for (const width of [360, 390]) {
    test(`at ${width} px the chip panel is a closed details that opens on tap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await ready(page);
      const panel = page.locator('details#chip-panel');
      await expect(panel).toHaveJSProperty('open', false);
      await expect(panel.locator('#chip')).toBeHidden();
      await expect(page.locator('#chip-summary')).toBeVisible();
      await expect(page.locator('#chip-summary')).toContainText('instruments');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.locator('#chip-summary').click();
      await expect(panel).toHaveJSProperty('open', true);
      await expect(page.locator('#chip')).toBeVisible();
      await expect(page.locator('#chip')).toHaveAttribute('data-ghost-lanes', '4');
      await page.getByRole('button', { name: /^Show all \d+$/ }).click();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const box = (await page.locator('#chip').boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    });
  }

  test('at 520 px and wider the panel stays open', async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 844 });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('details#chip-panel')).toHaveJSProperty('open', true);
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`the ghost is drawn and nothing overflows at 360, 390 and 1360 px with ${reducedMotion} motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      for (const width of [1360, 390, 360]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await ready(page);
        if (width < 520) await page.locator('#chip-summary').click();
        await expect(page.locator('#chip')).toHaveAttribute('data-ghost-lanes', '4');
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      }
    });
  }
});
