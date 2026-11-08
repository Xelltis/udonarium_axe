import { expect, test } from '@playwright/test';

import { openSeatDisplay, waitAppReady } from './helpers';

test.describe('switching the theme', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows the name at once on hovering the icon, in the same tooltip as the Fav items', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    const theme = panel.getByTestId('seat-theme');
    const bubble = () =>
      theme.evaluate((el) => {
        const style = getComputedStyle(el, '::after');
        return { opacity: style.opacity, content: style.content };
      });

    await expect.poll(async () => (await bubble()).opacity).toBe('0');
    await theme.hover();
    await expect.poll(async () => (await bubble()).opacity, { timeout: 1000 }).toBe('1');
    await expect.poll(async () => (await bubble()).content).toBe('"テーマ: 自動"');
  });

  test('keeps the chosen theme after a reload', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await panel.getByTestId('seat-theme').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ui-theme'))).toBe('dark');

    await page.reload();
    await waitAppReady(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const reopened = await openSeatDisplay(page);
    await expect(reopened.getByTestId('seat-theme')).toHaveAttribute('data-label', 'テーマ: ダーク');
  });
});
