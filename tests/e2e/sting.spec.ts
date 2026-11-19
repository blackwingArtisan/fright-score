import { expect, test, type Page } from '@playwright/test';

/** Summon a short chase cue with one sting, so the playhead reaches it within seconds. */
async function summonShortCue(page: Page, sting: string): Promise<void> {
  await page.goto('/');
  await page.locator('label.mood', { hasText: 'Chase' }).click();
  await page.getByLabel('Length (seconds)').fill('8');
  await page.getByLabel('Sting at').fill(sting);
  await page.getByLabel('Seed').fill('5');
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
}

/** Record the stage's styles the moment the sting class lands (it only stays for about 600 ms). */
async function watchSting(page: Page): Promise<void> {
  await page.evaluate(() => {
    const stage = document.querySelector('.stage')!;
    const scare = document.querySelector('.stage__scare')!;
    const timeline = document.querySelector('.timeline')!;
    new MutationObserver(() => {
      if (!stage.classList.contains('stage--sting')) return;
      const s = getComputedStyle(scare);
      (window as unknown as { __sting: unknown }).__sting = {
        vignette: s.animationName,
        frame: s.boxShadow,
        shake: getComputedStyle(timeline).animationName,
      };
    }).observe(stage, { attributes: true, attributeFilter: ['class'] });
  });
}

const seen = (page: Page) => page.evaluate(() => (window as unknown as { __sting?: { vignette: string; frame: string; shake: string } }).__sting);

test.describe('the sting payoff and the 60-second path', () => {
  test('the Listen overlay names the scare time and starts playback', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    const listen = page.getByRole('button', { name: /Listen\. The scare lands at 1:10/ });
    await expect(listen).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jump to the scare' })).toBeEnabled();
    await listen.click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    await expect(listen).toBeHidden();
  });

  test('Jump to the scare plays into the sting and the stage reacts when it lands', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await summonShortCue(page, '0:03');
    await expect(page.getByRole('button', { name: /The scare lands at 0:03/ })).toBeVisible();
    await watchSting(page);
    await page.getByRole('button', { name: 'Jump to the scare' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('.stage')).toHaveAttribute('data-stings', '1', { timeout: 15_000 });
    const style = await seen(page);
    expect(style?.vignette).toBe('scareVignette');
    expect(style?.shake).toBe('scareShake');
    // The flash clears again after about 600 ms.
    await expect(page.locator('.stage')).not.toHaveClass(/stage--sting/, { timeout: 3_000 });
    expect(errors).toEqual([]);
  });

  test('under reduced motion the sting shows a still red frame instead of moving', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await summonShortCue(page, '0:02');
    await watchSting(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.stage')).toHaveAttribute('data-stings', '1', { timeout: 15_000 });
    const style = await seen(page);
    expect(style?.vignette).toBe('none');
    expect(style?.shake).toBe('none');
    expect(style?.frame).toContain('inset');
  });

  test('the live-chip callout scrolls to the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /press A to K/ }).click();
    await expect(page.locator('#live')).toBeInViewport();
  });
});
