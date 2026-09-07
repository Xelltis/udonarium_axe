import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * Recording, restoring and turn order all had no coverage. None of them can be
 * driven to completion from one browser without a real session, so these check
 * the entry points open, report their empty state honestly, and — for turn
 * order — that the widget actually lists the pieces on the table.
 */
test.describe('セッション進行まわり', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('リプレイは記録が無いことを伝えたうえで読み込み口を出すこと', async ({ page }) => {
    await openPanel(page, 'リプレイ');

    const replay = page.locator('app-replay-workspace');
    await expect(replay).toBeVisible({ timeout: 15000 });
    // 白紙で終わらせず、まだ何も無いことと次の一手を出す。
    await expect(replay).toContainText('保存された記録はありません');
    await expect(replay).toContainText('読み込み');
  });

  test('自動保存はまだ世代が無いことを伝え、その場で保存できること', async ({ page }) => {
    // 自動保存は部屋設定の「自動保存」タブに入っている。
    await openPanel(page, '部屋設定');
    const settings = page.locator('room-settings-panel');
    await expect(settings).toBeVisible({ timeout: 15000 });
    await settings.locator('[data-testid="room-settings-tab-archive"]').click();

    const snapshot = page.locator('app-room-snapshot-panel');
    await expect(snapshot).toBeVisible({ timeout: 15000 });
    await expect(snapshot).toContainText('まだスナップショットがありません');

    await snapshot.getByRole('button', { name: /今すぐ保存/ }).click();
    // 保存できたら世代の数え上げが動く。
    await expect(snapshot).not.toContainText('まだスナップショットがありません', { timeout: 10000 });
  });

  test('インベントリを最小化すると行動順ウィジェットになり、卓上のコマが並ぶこと', async ({ page }) => {
    const names = await page.locator('game-character [data-testid="piece-name"]').allInnerTexts();
    expect(names.length).toBeGreaterThan(0);

    await openPanel(page, 'インベントリ');
    const inventory = page.locator('game-object-inventory');
    await expect(inventory).toBeVisible({ timeout: 10000 });

    // 最小化ボタンは浮いているツールバーの下に入ることがある。
    await page
      .locator('ui-panel')
      .filter({ hasText: 'インベントリ' })
      .locator('button')
      .filter({ hasText: /^\s*remove\s*$/ })
      .first()
      .dispatchEvent('click');

    // 一覧の絞り込みタブが畳まれ、手番送りの操作に入れ替わる。
    const panel = page.locator('ui-panel').filter({ hasText: 'インベントリ' });
    await expect(panel).toContainText('hourglass_bottom', { timeout: 10000 });
    await expect(panel).toContainText('restart_alt');
    await expect(panel).not.toContainText('墓場');

    // 卓上のコマがそのまま積まれている。
    expect(await panel.locator('img').count()).toBeGreaterThanOrEqual(names.length);
  });
});
