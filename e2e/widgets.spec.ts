import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, waitAppReady } from './helpers';

/**
 * The small always-on pieces — clock, link quality, mini player, language —
 * are toggled from this seat's display settings, opened from the FAB.
 *
 * Their host elements stay in the DOM with no box of their own, so whether a
 * widget is showing is a question about its content, not about the host.
 */
test.describe('ウィジェットと言語切替', () => {
  /** Shows or hides a widget from the display settings, and closes them again so they cover nothing. */
  async function toggleWidget(page: Page, key: string) {
    const display = await openSeatDisplay(page);
    await display.getByTestId(`seat-widget-${key}`).click();
    await page.keyboard.press('Escape');
    await expect(display).toBeHidden();
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
  });

  test('時計は表示の小窓から出し入れできること', async ({ page }) => {
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

  test('ミニプレイヤーは表示の小窓から出し入れできること', async ({ page }) => {
    // 時計と違い、こちらは要素を残したまま hidden で隠す。
    const player = page.locator('app-mini-jukebox > *');
    await expect(player).toBeVisible();

    await toggleWidget(page, 'miniPlayer');
    await expect(player).toBeHidden({ timeout: 5000 });

    await toggleWidget(page, 'miniPlayer');
    await expect(player).toBeVisible({ timeout: 5000 });
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
