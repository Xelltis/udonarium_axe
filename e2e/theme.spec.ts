import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, waitAppReady } from './helpers';

test.describe('テーマ切り替え', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('FAB の「表示」の小窓で、今のテーマに印が付いていること', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    // 起動時は theme='auto'。
    await expect(panel.getByTestId('seat-theme-auto')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByTestId('seat-theme-dark')).toHaveAttribute('aria-pressed', 'false');
  });

  test('ダークを選ぶと画面がダークになり、選んだものに印が移ること', async ({ page }) => {
    const panel = await openSeatDisplay(page);

    await panel.getByTestId('seat-theme-dark').click();
    await expect(panel.getByTestId('seat-theme-dark')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await panel.getByTestId('seat-theme-light').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('選んだテーマはリロードしても残ること', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await panel.getByTestId('seat-theme-dark').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ui-theme'))).toBe('dark');

    await page.reload();
    await waitAppReady(page);

    const reopened = await openSeatDisplay(page);
    await expect(reopened.getByTestId('seat-theme-dark')).toHaveAttribute('aria-pressed', 'true');
  });

  test('小窓は Escape と外側のクリックで閉じること', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    await openSeatDisplay(page);
    await page.mouse.click(900, 500);
    await expect(panel).toBeHidden();
  });
});

test.describe('FAB メニュー開閉', () => {
  // ラベルは開閉で入れ替わるので、どちらでも掴める形で参照する。
  const fabButton = (page: Page) => page.getByRole('button', { name: /メニューを(開く|閉じる)/ });

  test('FAB 閉時はメニュー項目が pointer-events: none で配置されていること', async ({ page }) => {
    await waitAppReady(page);
    const fab = fabButton(page);
    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-testid="fab-menu"] nav')).toHaveCSS('pointer-events', 'none');
  });

  test('FAB を開閉すると aria-expanded / aria-label が同期すること', async ({ page }) => {
    await waitAppReady(page);
    const fab = fabButton(page);

    // 既定は開いた状態（feat(app): default FAB to open）。
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
