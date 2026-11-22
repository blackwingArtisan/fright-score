import { expect, test } from '@playwright/test';

// Phone widths, run in the desktop project with an explicit viewport per test.
const PHONES = [
  { name: '390x844', width: 390, height: 844 },
  { name: '375x667', width: 375, height: 667 },
];

for (const phone of PHONES) {
  test(`at ${phone.name} the pinned write button never covers Jump to the scare`, async ({ page }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    const jump = page.locator('#jump');
    await expect(jump).toBeVisible();

    // While the transport is on screen the write button stays hidden, so it cannot overlap #jump.
    const cta = page.locator('#write-cta');
    await expect(cta).toBeHidden();
    const jumpBox = (await jump.boundingBox())!;
    const ctaBox = await cta.boundingBox();
    if (ctaBox) {
      const overlaps =
        jumpBox.x < ctaBox.x + ctaBox.width &&
        ctaBox.x < jumpBox.x + jumpBox.width &&
        jumpBox.y < ctaBox.y + ctaBox.height &&
        ctaBox.y < jumpBox.y + jumpBox.height;
      expect(overlaps).toBe(false);
    }

    // A tap at the center of the button reaches the button itself.
    const hitsJump = await page.evaluate(() => {
      const rect = document.getElementById('jump')!.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit?.closest('#jump')?.id === 'jump' && hit.id !== 'write-cta';
    });
    expect(hitsJump).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('at 375x667 Play and Jump to the scare sit inside the first viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.locator('#jump')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#play')).toBeInViewport({ ratio: 1 });
  const jumpBox = (await page.locator('#jump').boundingBox())!;
  expect(jumpBox.y + jumpBox.height).toBeLessThanOrEqual(667);
});

test('the write button appears once the transport scrolls out of view, and the form is reachable from it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await page.locator('.chip-wrap').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 1200));
  const cta = page.locator('#write-cta');
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page.getByLabel('Describe the scene')).toBeFocused();
});
