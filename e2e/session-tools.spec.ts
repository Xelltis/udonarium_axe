import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * Recording, restoring and turn order all had no coverage. None of them can be
 * driven to completion from one browser without a real session, so these check
 * the entry points open, report their empty state honestly, and — for turn
 * order — that the widget actually lists the pieces on the table.
 */
test.describe('running a session', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('says in the replay that there are no recordings, and offers a way to load one', async ({ page }) => {
    // The replay opens from the utility tab of the room settings.
    await openPanel(page, '部屋設定');
    const settings = page.locator('room-settings-panel');
    await expect(settings).toBeVisible({ timeout: 15000 });
    await settings.locator('[data-testid="room-settings-tab-utility"]').click();
    await settings.locator('[data-testid="room-settings-replay"]').click();

    const replay = page.locator('app-replay-workspace');
    await expect(replay).toBeVisible({ timeout: 15000 });
    // Rather than a blank page, it says there is nothing yet and what to do next.
    await expect(replay).toContainText('保存された記録はありません');
    await expect(replay).toContainText('読み込み');
  });

  test('says autosave has no generations yet, and saves one on the spot', async ({ page }) => {
    // Autosave lives in the autosave tab of the room settings.
    await openPanel(page, '部屋設定');
    const settings = page.locator('room-settings-panel');
    await expect(settings).toBeVisible({ timeout: 15000 });
    await settings.locator('[data-testid="room-settings-tab-archive"]').click();

    const snapshot = page.locator('app-room-snapshot-panel');
    await expect(snapshot).toBeVisible({ timeout: 15000 });
    await expect(snapshot).toContainText('まだスナップショットがありません');

    await snapshot.getByRole('button', { name: /今すぐ保存/ }).click();
    // Once saved, the count of generations moves. The whole room is packed into a zip, so with browsers
    // run side by side the usual 0.3 seconds can go past 10.
    await expect(snapshot).not.toContainText('まだスナップショットがありません', { timeout: 30000 });
  });

  test('shrinks the inventory to the turn order alone in the round view, listing the pieces on the table', async ({
    page,
  }) => {
    const names = await page.locator('game-character [data-testid="piece-name"]').allInnerTexts();
    expect(names.length).toBeGreaterThan(0);

    await openPanel(page, 'インベントリ');
    const inventory = page.locator('game-object-inventory');
    await expect(inventory).toBeVisible({ timeout: 10000 });

    // One button in the title bar switches the view, going round rich → simple (table) → round.
    // The button can end up under a floating toolbar.
    const panel = page.locator('ui-panel').filter({ hasText: 'インベントリ' });
    await panel.locator('button[title="リッチ表示"]').dispatchEvent('click');
    await panel.locator('button[title="簡略表示（表）"]').dispatchEvent('click');

    await expect(panel.locator('button[title="ラウンド表示"]')).toHaveCount(1, { timeout: 10000 });
    await expect(panel).toContainText('hourglass_bottom', { timeout: 10000 });
    await expect(panel).toContainText('restart_alt');
    await expect(panel).not.toContainText('墓場');

    // The pieces on the table are all stacked there.
    expect(await panel.locator('img').count()).toBeGreaterThanOrEqual(names.length);
  });
});
