import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, waitAppReady } from './helpers';

test.describe('switching the theme', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows the icon of the current theme in the FAB’s display small menu', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    // The theme is 'auto' at start-up.
    const theme = panel.getByTestId('seat-theme');
    await expect(theme).toHaveAttribute('data-label', 'テーマ: 自動');
    await expect(theme.locator('i.material-icons')).toHaveText('brightness_auto');
  });

  test('goes round auto → dark → light → auto with each press, changing the theme of the screen', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    const theme = panel.getByTestId('seat-theme');

    await theme.click();
    await expect(theme).toHaveAttribute('data-label', 'テーマ: ダーク');
    await expect(theme.locator('i.material-icons')).toHaveText('dark_mode');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await theme.click();
    await expect(theme).toHaveAttribute('data-label', 'テーマ: ライト');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await theme.click();
    await expect(theme).toHaveAttribute('data-label', 'テーマ: 自動');
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

  test('opens the skin panel from the display small menu', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await expect(page.locator('[data-testid="fab-entry-skin"]')).toHaveCount(0);

    await panel.getByTestId('seat-skin').click();

    await expect(page.locator('app-skin-panel')).toBeVisible({ timeout: 10000 });
    await expect(panel).toBeHidden();
  });

  test('keeps the chosen theme after a reload', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await panel.getByTestId('seat-theme').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ui-theme'))).toBe('dark');

    await page.reload();
    await waitAppReady(page);

    const reopened = await openSeatDisplay(page);
    await expect(reopened.getByTestId('seat-theme')).toHaveAttribute('data-label', 'テーマ: ダーク');
  });

  test('closes the small menu on Escape and on a click outside it', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    await openSeatDisplay(page);
    await page.mouse.click(900, 500);
    await expect(panel).toBeHidden();
  });
});

test.describe('opening and closing the FAB menu', () => {
  // The label changes as the menu opens and closes, so the button is found by either.
  const fabButton = (page: Page) => page.getByRole('button', { name: /メニューを(開く|閉じる)/ });

  test('leaves the menu items in place with pointer-events: none while the FAB is closed', async ({ page }) => {
    await waitAppReady(page);
    const fab = fabButton(page);
    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-testid="fab-menu"] nav')).toHaveCSS('pointer-events', 'none');
  });

  test('keeps aria-expanded and aria-label in step as the FAB opens and closes', async ({ page }) => {
    await waitAppReady(page);
    const fab = fabButton(page);

    // It starts open (feat(app): default FAB to open).
    await expect(fab).toHaveAttribute('aria-expanded', 'true');
    await expect(fab).toHaveAccessibleName(/メニューを閉じる/);

    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
    await expect(fab).toHaveAccessibleName(/メニューを開く/);

    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'true');
    await expect(fab).toHaveAccessibleName(/メニューを閉じる/);
  });
});
