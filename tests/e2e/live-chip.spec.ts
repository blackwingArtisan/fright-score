import { expect, test, type Page } from '@playwright/test';

test.describe('first view and the live chip', () => {
  test('shows a real demo cue on first load, ready to play, without touching the URL', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#status')).toHaveText('Ready: press Play');
    await expect(page.locator('#cue-meta')).toContainText('Demo cue from "Creeping dread in the cellar');
    await expect(page.locator('#director-notes')).toContainText('Sting at 1:10.0');
    await expect(page.getByRole('button', { name: 'Play' })).toHaveClass(/btn--beckon/);
    await expect(page.getByRole('button', { name: 'Download WAV' })).toBeEnabled();
    // The form stays clean, so the user's own request is not mixed with the demo.
    await expect(page.getByLabel('Describe the scene')).toHaveValue('');
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
  });

  test('a newer request replaces the demo render instead of racing it', async ({ page }) => {
    await page.goto('/');
    await page.locator('label.mood', { hasText: 'Chase' }).click();
    await page.getByLabel('Length (seconds)').fill('6');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#cue-meta')).toContainText('Chase');
    await expect(page.locator('#cue-meta')).not.toContainText('Demo cue');
    await expect(page.locator('#clock')).toContainText('/ 0:06.0');
  });

  test('synthesizes audio in real time on the AudioWorklet when a key is played', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Patch' }).selectOption('glass-bell');
    await expect(page.locator('#live-blurb')).toContainText('inharmonic bell');
    await expect(page.locator('#live-octave')).toHaveText('C5');

    const status = page.locator('#live-status');
    // Hold A (the bottom C) on the computer keyboard.
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.down('a');
    await expect(page.locator('.key[data-index="0"]')).toHaveClass(/key--down/);
    await expect.poll(async () => Number(await status.getAttribute('data-voices')), { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => Number(await status.getAttribute('data-peak')), { timeout: 10_000 }).toBeGreaterThan(0.01);
    await expect(status).toContainText('in real time');

    // A chord from the on-screen keys adds voices.
    const key = page.locator('.key[data-index="4"]');
    await key.scrollIntoViewIfNeeded();
    const box = (await key.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);
    await page.mouse.down();
    await expect.poll(async () => Number(await status.getAttribute('data-voices')), { timeout: 10_000 }).toBe(2);
    await page.mouse.up();
    await page.keyboard.up('a');

    // Released notes ring out, then the chip falls silent but keeps running.
    await expect.poll(async () => Number(await status.getAttribute('data-voices')), { timeout: 20_000 }).toBe(0);
    const before = Number(await status.getAttribute('data-frames'));
    await expect.poll(async () => Number(await status.getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });

  // Requirement 1.3b and 1.3c: the octave moves with Z and X and with the two buttons.
  // Choir Organ is the default patch; its keyboard starts at C3.
  const lowestKey = (page: Page) => page.locator('.key[data-index="0"]');

  test('Z and X shift the keyboard down and up one octave', async ({ page }) => {
    await page.goto('/');
    const label = page.locator('#live-octave');
    await expect(label).toHaveText('C3');
    await expect(lowestKey(page)).toHaveAttribute('aria-label', 'C3');
    await page.locator('body').click({ position: { x: 2, y: 2 } });

    await page.keyboard.press('x');
    await expect(label).toHaveText('C4');
    await expect(lowestKey(page)).toHaveAttribute('aria-label', 'C4');
    await expect(page.locator('.key[data-index="12"]')).toHaveAttribute('aria-label', 'C5');
    await page.keyboard.press('x');
    await expect(label).toHaveText('C5');
    await page.keyboard.press('z');
    await page.keyboard.press('z');
    await page.keyboard.press('z');
    await expect(label).toHaveText('C2');
    await expect(lowestKey(page)).toHaveAttribute('aria-label', 'C2');
    // Capital letters count too, and pressing the octave keys makes no sound.
    await page.keyboard.press('Shift+X');
    await expect(label).toHaveText('C3');
    await expect(page.locator('#live-status')).toHaveAttribute('data-voices', '0');
    await expect(page.locator('#live-status')).toContainText('Dormant');
  });

  test('Z and X do nothing while typing in a form field', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Describe the scene').fill('');
    await page.getByLabel('Describe the scene').press('x');
    await page.getByLabel('Describe the scene').press('z');
    await expect(page.getByLabel('Describe the scene')).toHaveValue('xz');
    await expect(page.locator('#live-octave')).toHaveText('C3');
  });

  test('the octave buttons shift the keyboard by one octave', async ({ page }) => {
    await page.goto('/');
    const label = page.locator('#live-octave');
    await expect(label).toHaveText('C3');
    await page.getByRole('button', { name: 'Octave up' }).click();
    await expect(label).toHaveText('C4');
    await expect(lowestKey(page)).toHaveAttribute('aria-label', 'C4');
    await page.getByRole('button', { name: 'Octave up' }).click();
    await expect(label).toHaveText('C5');
    await page.getByRole('button', { name: 'Octave down' }).click();
    await page.getByRole('button', { name: 'Octave down' }).click();
    await page.getByRole('button', { name: 'Octave down' }).click();
    await expect(label).toHaveText('C2');
    await expect(lowestKey(page)).toHaveAttribute('aria-label', 'C2');
    // Choosing another patch puts the keyboard back at that patch's comfortable octave (Requirement 1.3d).
    await page.getByRole('combobox', { name: 'Patch' }).selectOption('music-box');
    await expect(label).toHaveText('C5');
  });

  // Requirement 1.6b: nothing touches the audio worklet before the first key.
  test('does not load the AudioWorklet until the first key is pressed', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __worklets: string[]; __nodes: number };
      w.__worklets = [];
      w.__nodes = 0;
      const original = AudioWorklet.prototype.addModule;
      AudioWorklet.prototype.addModule = function (url: string | URL, options?: WorkletOptions) {
        w.__worklets.push(String(url));
        return original.call(this, url, options);
      };
    });
    const loaded = () => page.evaluate(() => (window as unknown as { __worklets: string[] }).__worklets.length);
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });

    // Everything short of a key: pick a patch, shift the octave, play and pause the cue itself.
    await page.getByRole('combobox', { name: 'Patch' }).selectOption('glass-bell');
    await page.getByRole('button', { name: 'Octave up' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'playing');
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(500);
    expect(await loaded()).toBe(0);
    await expect(page.locator('#live-status')).toHaveAttribute('data-frames', '0');
    await expect(page.locator('#live-status')).toContainText('Dormant');

    // The first key loads it, once.
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('a');
    await expect.poll(loaded, { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => Number(await page.locator('#live-status').getAttribute('data-frames')), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    expect(await loaded()).toBe(1);
  });

  // Requirement 1.7: losing focus releases every voice, however the keys were held.
  test('releases every voice when the page loses focus while keys are held', async ({ page }) => {
    await page.goto('/');
    const status = page.locator('#live-status');
    const voices = async () => Number(await status.getAttribute('data-voices'));
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.down('a');
    await page.keyboard.down('d');
    const key = page.locator('.key[data-index="7"]');
    await key.scrollIntoViewIfNeeded();
    const box = (await key.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12);
    await page.mouse.down();
    await expect.poll(voices, { timeout: 10_000 }).toBe(3);
    await expect(page.locator('.key--down')).toHaveCount(3);

    // The keys stay held, so only the focus handler can end these voices. Choir Organ rings for two seconds
    // after a normal release, and the panic cuts it in a fraction of that.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('.key--down')).toHaveCount(0);
    await expect.poll(voices, { timeout: 1_500 }).toBe(0);

    await page.mouse.up();
    await page.keyboard.up('a');
    await page.keyboard.up('d');
    // The chip is still awake and takes new notes after the panic.
    await page.keyboard.down('f');
    await expect.poll(voices, { timeout: 10_000 }).toBe(1);
    await page.keyboard.up('f');
  });

  // Requirement 2.3: the Play button stops asking for attention once the visitor has played.
  test('the Play button stops beckoning after the first play', async ({ page }) => {
    await page.goto('/');
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(play).toHaveClass(/btn--beckon/);

    await play.click();
    const pause = page.getByRole('button', { name: 'Pause' });
    await expect(pause).toBeVisible();
    await expect(pause).not.toHaveClass(/btn--beckon/);
    await pause.click();
    await expect(play).not.toHaveClass(/btn--beckon/);

    // It stays quiet for the next cue too: the visitor has already found Play.
    await page.locator('label.mood', { hasText: 'Chase' }).click();
    await page.getByLabel('Length (seconds)').fill('6');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    await expect(page.locator('#cue-meta')).toContainText('Chase');
    await expect(play).not.toHaveClass(/btn--beckon/);
  });
});
