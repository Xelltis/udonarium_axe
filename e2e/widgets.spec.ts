import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, waitAppReady } from './helpers';

/**
 * The small always-on pieces — clock, link quality, mini player, language —
 * are toggled from the toolbar and the FAB, and none of them had coverage.
 *
 * Their host elements stay in the DOM with no box of their own, so whether a
 * widget is showing is a question about its content, not about the host.
 */
test.describe('ウィジェットと言語切替', () => {
  const toolbar = (page: Page, title: string) => page.locator(`app-pl-toolbar [title="${title}"]`);

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
  });

  test('時計はツールバーから出し入れできること', async ({ page }) => {
    const clock = page.locator('app-digital-clock > *');
    await expect(clock).toHaveCount(0);

    await toolbar(page, '時計').click();
    await expect(clock).toBeVisible({ timeout: 5000 });
    // 飾りではなく時刻が入っている。
    await expect(clock).toContainText(/\d{1,2}:\d{2}/);

    await toolbar(page, '時計').click();
    await expect(clock).toHaveCount(0, { timeout: 5000 });
  });

  test('通信品質ウィジェットは参加者がいないことを伝えること', async ({ page }) => {
    const quality = page.locator('app-connection-quality > *');
    await expect(quality).toHaveCount(0);

    await toolbar(page, '通信品質').click();
    await expect(quality).toBeVisible({ timeout: 5000 });
    // 単独で開いているので、相手がいないと出るのが正しい。
    await expect(quality).toContainText('接続中の参加者はいません');
  });

  test('ミニプレイヤーはツールバーから出し入れできること', async ({ page }) => {
    // 時計と違い、こちらは要素を残したまま hidden で隠す。
    const player = page.locator('app-mini-jukebox > *');
    await expect(player).toBeVisible();

    await toolbar(page, 'ミニプレイヤー').click();
    await expect(player).toBeHidden({ timeout: 5000 });

    await toolbar(page, 'ミニプレイヤー').click();
    await expect(player).toBeVisible({ timeout: 5000 });
  });

  test('言語を切り替えると画面の文言が入れ替わること', async ({ page }) => {
    // タブ名は部屋のデータなので訳されない。訳される文言で確かめる。
    const panel = page.locator('peer-menu');
    await expect(panel).toContainText('ニックネーム');

    const display = await openSeatDisplay(page);
    await display.getByTestId('seat-lang-en').click();
    await expect(panel).toContainText('Nickname', { timeout: 10000 });

    // どれを選んでも入れ替わり、日本語に戻せること。切り替えっぱなしで終わらないのを確かめる。
    await display.getByTestId('seat-lang-ko').click();
    await expect(panel).toContainText('닉네임', { timeout: 10000 });

    await display.getByTestId('seat-lang-ja').click();
    await expect(panel).toContainText('ニックネーム', { timeout: 10000 });
  });
});
