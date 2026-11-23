import { expect, test } from '@playwright/test';

test.describe('rendering progress (Requirement 8.1)', () => {
  test('shows the user how far a render has got, from the first percent to done', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });

    // Record every change to the status line, the progress bar and the timeline label from here on.
    await page.evaluate(() => {
      interface Seen {
        state: string | null;
        text: string;
        width: string;
        label: string | null;
      }
      const seen: Seen[] = [];
      (window as unknown as { __seen: Seen[] }).__seen = seen;
      const status = document.getElementById('status')!;
      const bar = document.getElementById('progress-bar')!;
      const timeline = document.getElementById('timeline')!;
      const record = () =>
        seen.push({ state: status.getAttribute('data-state'), text: status.textContent ?? '', width: bar.style.width, label: timeline.getAttribute('data-progress-label') });
      const observer = new MutationObserver(record);
      observer.observe(status, { attributes: true, childList: true, characterData: true, subtree: true });
      observer.observe(bar, { attributes: true, attributeFilter: ['style'] });
      observer.observe(timeline, { attributes: true, attributeFilter: ['data-progress-label'] });
    });

    // A longer cue, so the render takes long enough to be seen in several steps.
    await page.locator('label.mood', { hasText: 'Chase' }).click();
    await page.getByLabel('Length (seconds)').fill('60');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'rendering');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 80_000 });

    const seen = await page.evaluate(() => (window as unknown as { __seen: { state: string; text: string; width: string; label: string | null }[] }).__seen);
    const rendering = seen.filter((s) => s.state === 'rendering');
    const percents = rendering.map((s) => Number(/^Rendering (\d+)%/.exec(s.text)?.[1] ?? NaN));
    expect(percents.every((p) => Number.isFinite(p)), JSON.stringify(rendering.slice(0, 3))).toBe(true);

    // The status line counts up, in several steps, and never goes backward.
    expect(new Set(percents).size).toBeGreaterThanOrEqual(4);
    expect(Math.min(...percents)).toBeLessThan(50);
    expect(Math.max(...percents)).toBeGreaterThanOrEqual(50);
    for (let i = 1; i < percents.length; i++) expect(percents[i], `step ${i}`).toBeGreaterThanOrEqual(percents[i - 1]);

    // The bar under the status fills the same way, and finishes full.
    const widths = seen.map((s) => parseFloat(s.width)).filter((w) => Number.isFinite(w));
    expect(new Set(widths).size).toBeGreaterThanOrEqual(4);
    expect(widths.at(-1)).toBe(100);

    // The timeline carries the "Rendering on the FS-666" label while the render runs, and drops it after.
    expect(seen.some((s) => s.label === 'top-right')).toBe(true);
    await expect(page.locator('#timeline')).not.toHaveAttribute('data-progress-label', /./);
    await expect(page.locator('#status')).toHaveText('Ready');
  });

  test('the status line is a polite live region, so a screen reader hears the progress', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('role', 'status');
    await expect(page.locator('#status')).toHaveAttribute('aria-live', 'polite');
  });
});
