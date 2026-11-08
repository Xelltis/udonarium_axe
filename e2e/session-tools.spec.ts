import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * Autosave cannot be driven to a restore from one browser without a real session, so this checks
 * that its entry point opens, says honestly that it holds nothing yet, and packs the room into the
 * browser's storage on the spot.
 */
test.describe('running a session', () => {
  test('says autosave has no generations yet, and saves one on the spot', async ({ page }) => {
    await waitAppReady(page);
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
});
