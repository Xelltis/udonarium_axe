import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, openSeatWidgets, waitAppReady } from './helpers';

/**
 * The small always-on pieces — clock, link quality, mini player, language —
 * are toggled from the FAB: the widgets from their own menu, the language from the display one.
 *
 * Their host elements stay in the DOM with no box of their own, so whether a
 * widget is showing is a question about its content, not about the host.
 */
test.describe('ウィジェットと言語切替', () => {
  /** Shows or hides a widget from the widget menu, and closes it again so it covers nothing. */
  async function toggleWidget(page: Page, key: string) {
    const widgets = await openSeatWidgets(page);
    await widgets.getByTestId(`seat-widget-${key}`).click();
    await page.keyboard.press('Escape');
    await expect(widgets).toBeHidden();
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
  });

  test('時計はウィジェットの小窓から出し入れできること', async ({ page }) => {
    const clock = page.locator('app-digital-clock > *');
    await expect(clock).toHaveCount(0);

    await toggleWidget(page, 'clock');
    await expect(clock).toBeVisible({ timeout: 5000 });
    // 飾りではなく時刻が入っている。
    await expect(clock).toContainText(/\d{1,2}:\d{2}/);

    await toggleWidget(page, 'clock');
    await expect(clock).toHaveCount(0, { timeout: 5000 });
  });

  test('通信品質ウィジェットは参加者がいないことを伝えること', async ({ page }) => {
    const quality = page.locator('app-connection-quality > *');
    await expect(quality).toHaveCount(0);

    await toggleWidget(page, 'connectionQuality');
    await expect(quality).toBeVisible({ timeout: 5000 });
    // 単独で開いているので、相手がいないと出るのが正しい。
    await expect(quality).toContainText('接続中の参加者はいません');
  });

  test('ミニプレイヤーはウィジェットの小窓から出し入れできること', async ({ page }) => {
    // 時計と違い、こちらは要素を残したまま hidden で隠す。
    const player = page.locator('app-mini-jukebox > *');
    await expect(player).toBeVisible();

    await toggleWidget(page, 'miniPlayer');
    await expect(player).toBeHidden({ timeout: 5000 });

    await toggleWidget(page, 'miniPlayer');
    await expect(player).toBeVisible({ timeout: 5000 });
  });

  test('PL ツールはウィジェットの小窓から出し入れでき、隠したことはリロードしても残ること', async ({ page }) => {
    const toolbar = page.locator('app-pl-toolbar .pl-toolbar');
    await expect(toolbar).toBeVisible();

    await toggleWidget(page, 'plToolbar');
    await expect(toolbar).toHaveCount(0);

    await page.reload();
    await waitAppReady(page);
    const widgets = await openSeatWidgets(page);
    await expect(widgets.getByTestId('seat-widget-plToolbar')).toHaveAttribute('aria-pressed', 'false');
    await expect(toolbar).toHaveCount(0);

    await widgets.getByTestId('seat-widget-plToolbar').click();
    await expect(toolbar).toBeVisible();
  });

  test('表示の小窓を開いたままウィジェットを押すと、ウィジェットの小窓に替わること', async ({ page }) => {
    const display = await openSeatDisplay(page);
    await page.locator('[data-testid="fab-widgets"]').click();

    await expect(display).toBeHidden();
    await expect(page.locator('[data-testid="seat-widgets"]')).toBeVisible();
    await expect(page.locator('[data-testid="fab-widgets"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-testid="fab-display"]')).toHaveAttribute('aria-expanded', 'false');

    await page.locator('[data-testid="fab-widgets"]').click();
    await expect(page.locator('[data-testid="seat-widgets"]')).toBeHidden();
  });

  test('言語を切り替えると画面の文言が入れ替わること', async ({ page }) => {
    // タブ名は部屋のデータなので訳されない。訳される文言で確かめる。
    const panel = page.locator('peer-menu');
    await expect(panel).toContainText('ニックネーム');

    const display = await openSeatDisplay(page);
    const language = display.getByTestId('seat-lang');
    await language.click();
    await expect(panel).toContainText('Nickname', { timeout: 10000 });

    // 三つを巡って戻ること。切り替えっぱなしで終わらないのを確かめる。
    await language.click();
    await expect(panel).toContainText('닉네임', { timeout: 10000 });

    await language.click();
    await expect(panel).toContainText('ニックネーム', { timeout: 10000 });
  });
});
