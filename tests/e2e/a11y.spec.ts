import { expect, test } from '@playwright/test';

test.describe('keyboard and form accessibility', () => {
  test('the timeline is a slider you can scrub with the keyboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    const slider = page.getByRole('slider', { name: /Score timeline/ });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', /^1:(29|30) of 1:30$/);
    expect(Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(89);
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0.0');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '6.0');
    await expect(page.locator('#clock')).toHaveAttribute('data-position', '6.00');
  });

  test('bad input is explained next to the field and marked invalid', async ({ page }) => {
    await page.goto('/');
    const length = page.getByLabel('Length (seconds)');
    await length.fill('2');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(length).toHaveAttribute('aria-invalid', 'true');
    await expect(length).toHaveAccessibleDescription('Use 5 to 300 seconds.');
    await length.fill('20');
    await expect(length).not.toHaveAttribute('aria-invalid', 'true');

    const stings = page.getByLabel('Sting at');
    await stings.fill('0:10, soon');
    await page.getByRole('button', { name: 'Summon the score' }).click();
    await expect(stings).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#stings-error')).toHaveText('"soon" is not a time. Use 1:10 or 70, separated by commas.');
    await expect(page.locator('#status')).toHaveAttribute('data-state', 'error');
  });
});
