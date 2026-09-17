import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, waitAppReady } from './helpers';

test.describe('テーマ切り替え', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('FAB の「表示」の小窓に、今のテーマのアイコンが出ること', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    // 起動時は theme='auto'。
    const theme = panel.getByTestId('seat-theme');
    await expect(theme).toHaveAttribute('data-label', 'テーマ: 自動');
    await expect(theme.locator('i.material-icons')).toHaveText('brightness_auto');
  });

  test('押すごとに自動 → ダーク → ライト → 自動 と巡り、画面のテーマが変わること', async ({ page }) => {
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

  test('アイコンに乗せると、名前が Fav の項目と同じ吹き出しですぐ出ること', async ({ page }) => {
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

  test('表示の小窓からスキンのパネルを開けること', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await expect(page.locator('[data-testid="fab-entry-skin"]')).toHaveCount(0);

    await panel.getByTestId('seat-skin').click();

    await expect(page.locator('app-skin-panel')).toBeVisible({ timeout: 10000 });
    await expect(panel).toBeHidden();
  });

  test('選んだテーマはリロードしても残ること', async ({ page }) => {
    const panel = await openSeatDisplay(page);
    await panel.getByTestId('seat-theme').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ui-theme'))).toBe('dark');

    await page.reload();
    await waitAppReady(page);

    const reopened = await openSeatDisplay(page);
    await expect(reopened.getByTestId('seat-theme')).toHaveAttribute('data-label', 'テーマ: ダーク');
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
