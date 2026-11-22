import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const WAV_FILES = ['stalker-loop.wav', 'door-slam-sting.wav'];

async function enter(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the hallway' }).click();
  await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient', { timeout: 30_000 });
}

const measured = async (page: Page): Promise<number> => {
  const text = (await page.locator('#door-offset').textContent()) ?? '';
  return Number(/Sting landed ([0-9.]+) s after the door opened/.exec(text)?.[1]);
};

test.describe('door scene', () => {
  test('the door button lands the hit 0.6 s after the event, and E does too', async ({ page }) => {
    await enter(page);
    const door = page.getByRole('button', { name: 'Open the door' });
    await door.click();
    await expect(page.locator('#door-offset')).toContainText('Sting landed', { timeout: 10_000 });
    expect(Math.abs((await measured(page)) - 0.6)).toBeLessThanOrEqual(0.05);

    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient', { timeout: 15_000 });
    await door.focus();
    await page.locator('#door-offset').evaluate((el) => (el.textContent = 'cleared'));
    await page.keyboard.press('e');
    await expect(page.locator('#door-offset')).toContainText('Sting landed', { timeout: 10_000 });
    expect(Math.abs((await measured(page)) - 0.6)).toBeLessThanOrEqual(0.05);
  });

  test('nothing sounds or loads before the first gesture', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      if (/\.wav(\?|$)/.test(r.url())) requested.push(r.url());
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __ctx: number; AudioContext: typeof AudioContext };
      w.__ctx = 0;
      const Real = w.AudioContext;
      w.AudioContext = class extends Real {
        constructor(options?: AudioContextOptions) {
          super(options);
          w.__ctx++;
        }
      };
    });
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    // The app's own player may have made its context already; the scene must add none until the gesture.
    const count = () => page.evaluate(() => (window as unknown as { __ctx: number }).__ctx);
    const before = await count();
    expect(requested).toEqual([]);
    await expect(page.locator('#door')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#door-hint')).toContainText('locked until you enter the hallway');
    await expect(page.locator('#door-offset')).toHaveText('Enter the hallway, then open the door to measure the scare.');
    expect(await count()).toBe(before);
    await page.getByRole('button', { name: 'Enter the hallway' }).click();
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient', { timeout: 30_000 });
    expect(await count()).toBe(before + 1);
    expect(requested).toHaveLength(2);
  });

  test('the browser plays the same bytes as the Godot example', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => {
      if (/\.wav(\?|$)/.test(r.url())) urls.push(r.url());
    });
    await enter(page);
    expect(urls).toHaveLength(2);
    for (const file of WAV_FILES) {
      const stem = file.replace('.wav', '');
      const url = urls.find((u) => u.includes(stem));
      expect(url, `request for ${file}`).toBeTruthy();
      const hex = await page.evaluate(async (u) => {
        const buf = await (await fetch(u)).arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }, url!);
      const disk = createHash('sha256').update(readFileSync(`examples/godot/audio/${file}`)).digest('hex');
      expect(hex).toBe(disk);
    }
  });

  test('a second door event during a scare is ignored, and a new one works after the return', async ({ page }) => {
    await enter(page);
    const door = page.locator('#door');
    await door.click();
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'scaring');
    // The door reports aria-disabled during a scare, so Playwright's click would wait; send the event directly.
    await door.dispatchEvent('click');
    await expect(page.locator('#door-offset')).toContainText('Sting landed', { timeout: 10_000 });
    const first = await page.locator('#door-offset').textContent();
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient', { timeout: 15_000 });
    expect(await page.locator('#door-offset').textContent()).toBe(first);
    await door.click();
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'scaring');
  });

  test('E inside the scene does not play a live voice, E outside still does', async ({ page }) => {
    await enter(page);
    await page.locator('#door').focus();
    await page.keyboard.press('e');
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'scaring');
    await expect(page.locator('#live-status')).toHaveAttribute('data-voices', '0');
    await expect(page.locator('#live-status')).toHaveAttribute('data-frames', '0');
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient', { timeout: 15_000 });

    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.down('e');
    await expect(page.locator('#live-status')).not.toHaveAttribute('data-frames', '0', { timeout: 15_000 });
    await page.keyboard.up('e');
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient');
  });

  test('the door is a named button and state changes are announced', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open the door' })).toBeVisible();
    await expect(page.locator('#door-offset')).toHaveAttribute('role', 'status');
    await expect(page.locator('#door-offset')).toHaveAttribute('aria-live', 'polite');
    await page.getByRole('button', { name: 'Enter the hallway' }).click();
    await expect(page.locator('#door-announce')).toHaveText(/hallway/, { timeout: 30_000 });
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient', { timeout: 30_000 });
    await expect(page.locator('#door-announce')).toHaveText('You are in the hallway. The door is ready.');
    await page.locator('#door').click();
    await expect(page.locator('#door-announce')).toHaveText('The door opened. The loop cut out.');
    await expect(page.locator('#door-announce')).toContainText('The hit landed 0.6', { timeout: 10_000 });
  });

  test('Leave the hallway silences the scene and locks the door', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __ctxs: AudioContext[]; AudioContext: typeof AudioContext };
      w.__ctxs = [];
      const Real = w.AudioContext;
      w.AudioContext = class extends Real {
        constructor(options?: AudioContextOptions) {
          super(options);
          w.__ctxs.push(this);
        }
      };
    });
    await enter(page);
    // The scene's context is the last one made, because it is created on the Enter gesture.
    const stateOfLast = () =>
      page.evaluate(() => {
        const list = (window as unknown as { __ctxs: AudioContext[] }).__ctxs;
        return list[list.length - 1].state;
      });
    expect(await stateOfLast()).toBe('running');
    await page.getByRole('button', { name: 'Leave the hallway' }).click();
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('#door')).toHaveAttribute('aria-disabled', 'true');
    await expect.poll(stateOfLast).toBe('closed');
  });
});

test.describe('door scene at 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('does not scroll horizontally, before and after entering', async ({ page }) => {
    await page.goto('/');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Enter the hallway' }).click();
    await expect(page.locator('#door-scene')).toHaveAttribute('data-state', 'ambient', { timeout: 30_000 });
    expect(await overflow()).toBeLessThanOrEqual(0);
    const box = (await page.locator('#door-scene').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  });
});

test.describe('door scene with reduced motion', () => {
  test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

  test('the lamp flicker, door swing and hit flash compute to none', async ({ page }) => {
    await enter(page);
    await page.locator('#door').click();
    await expect(page.locator('#door-scene')).toHaveClass(/is-open/);
    const styles = await page.evaluate(() => {
      const root = document.getElementById('door-scene')!;
      const lamp = getComputedStyle(root.querySelector('.door__lamp')!);
      const leaf = getComputedStyle(root.querySelector('.door__leaf')!);
      const flash = getComputedStyle(root, '::after');
      return { lamp: lamp.animationName, leafTransition: leaf.transitionDuration, flash: flash.animationName, flashOpacity: flash.opacity };
    });
    expect(styles.lamp).toBe('none');
    expect(styles.flash).toBe('none');
    expect(styles.flashOpacity).toBe('0');
    expect(parseFloat(styles.leafTransition)).toBe(0);
  });
});
