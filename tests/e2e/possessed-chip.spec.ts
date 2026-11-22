import { expect, test, type Page } from '@playwright/test';
import { ghostAnnouncement, ghostHex, ghostMessage } from '../../src/web/views/ghost';

const SEED = 13;

/** A short cue with a sting at 0:02, played from the start with Jump to the scare. */
async function playShortCue(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await page.locator('label.mood', { hasText: 'Stalker' }).click();
  await page.getByLabel('Length (seconds)').fill('6');
  await page.getByLabel('Sting at').fill('0:02');
  await page.getByLabel('Seed').fill(String(SEED));
  await page.getByRole('button', { name: 'Summon the score' }).click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Jump to the scare' }).click();
}

/** Watches the rows every frame from the first ghost row on, for `ms`; returns how often they vanished. */
function watchGhost(page: Page, ms: number): Promise<{ appeared: boolean; gaps: number }> {
  return page.evaluate(
    (span) =>
      new Promise<{ appeared: boolean; gaps: number }>((resolve) => {
        let started = 0;
        let gaps = 0;
        let was = false;
        const tick = (now: number) => {
          const here = document.querySelectorAll('#stitch-writes li[data-ghost]').length > 0;
          if (here && !started) started = now;
          if (started && was && !here) gaps++;
          was = here;
          if (started && now - started > span) resolve({ appeared: true, gaps });
          else if (!started && now > 20_000) resolve({ appeared: false, gaps });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test.describe('the possessed chip (Requirement 16)', () => {
  test('when a sting lands, register-write rows flicker into a message spelled from the seed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await page.locator('label.mood', { hasText: 'Stalker' }).click();
    await page.getByLabel('Length (seconds)').fill('6');
    await page.getByLabel('Sting at').fill('0:02');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    const watching = watchGhost(page, 700);
    await page.getByRole('button', { name: 'Jump to the scare' }).click();
    const seen = await watching;
    expect(seen.appeared).toBe(true);
    expect(seen.gaps).toBeGreaterThan(0);

    // After the flicker ends the rows are ordinary register writes again.
    await expect(page.locator('#stitch-writes li[data-ghost]')).toHaveCount(0, { timeout: 5_000 });
  });

  test('the rows spell the seed\'s words with their bytes, stay out of the accessibility tree and are announced once', async ({ page }) => {
    // Reduced motion holds the message still for 1.5 s, so the rows can be read without racing the flicker.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await playShortCue(page);
    // Take the snapshot inside the page, in the frame the rows first appear, so a slow machine cannot miss it.
    const shown = await page.evaluate(
      () =>
        new Promise<{ word: string | undefined; hidden: string | null; text: string | null }[]>((resolve) => {
          const look = () => {
            const rows = [...document.querySelectorAll<HTMLElement>('#stitch-writes li[data-ghost]')];
            if (rows.length > 0) resolve(rows.map((el) => ({ word: el.dataset.ghost, hidden: el.getAttribute('aria-hidden'), text: el.textContent })));
            else requestAnimationFrame(look);
          };
          look();
        }),
    );
    const words = ghostMessage(SEED);
    expect(shown.map((r) => r.word)).toEqual([...words]);
    for (const [i, row] of shown.entries()) {
      expect(row.hidden).toBe('true');
      expect(row.text).toContain(ghostHex(words[i]));
    }
    const announce = page.locator('#ghost-announce');
    await expect(announce).toHaveAttribute('aria-live', 'polite');
    await expect(announce).toHaveText(ghostAnnouncement(SEED));
  });

  test('under reduced motion the message holds still instead of flickering', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await page.getByLabel('Length (seconds)').fill('6');
    await page.getByLabel('Sting at').fill('0:02');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    const watching = watchGhost(page, 1000);
    await page.getByRole('button', { name: 'Jump to the scare' }).click();
    const seen = await watching;
    expect(seen.appeared).toBe(true);
    expect(seen.gaps).toBe(0);
  });
});
