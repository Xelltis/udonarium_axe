import { expect, Page, test } from '@playwright/test';

import { chatTabPill, openPanel, waitAppReady } from './helpers';

async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

/** Starts the next round, or hands the turn on, from the round bar of the inventory. */
async function nextTurn(page: Page) {
  const inventory = page.locator('game-object-inventory');
  if ((await inventory.count()) === 0) await openPanel(page, 'インベントリ');
  await inventory.getByRole('button', { name: /次へ/ }).click();
}

/** Shows one tab of the chat window, under whatever panel may lie over its pill. */
async function showTab(page: Page, name: string) {
  await chatTabPill(page, name).dispatchEvent('click');
}

const roundStarted = (page: Page) =>
  page.locator('chat-window chat-message').filter({ hasText: 'ラウンド1開始です。' });

test.describe('where the system’s notices go', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('puts the round in the leftmost tab while the room has chosen nothing', async ({ page }) => {
    await becomeGm(page);

    await nextTurn(page);

    await showTab(page, 'メインタブ');
    await expect(roundStarted(page)).toHaveCount(1, { timeout: 5000 });
  });

  test('puts the round in the tab the master picks, and nothing of it in the leftmost one', async ({ page }) => {
    await becomeGm(page);
    await openPanel(page, '部屋設定');
    const panel = page.locator('room-settings-panel');
    await panel.getByTestId('room-settings-tab-notice').click();
    await panel.getByTestId('room-settings-notice-round').selectOption({ label: 'サブタブ' });

    await nextTurn(page);

    await showTab(page, 'サブタブ');
    await expect(roundStarted(page)).toHaveCount(1, { timeout: 5000 });
    await showTab(page, 'メインタブ');
    await expect(roundStarted(page)).toHaveCount(0);
  });

  test('shows a player the choices without letting them change any', async ({ page }) => {
    await openPanel(page, '部屋設定');
    const panel = page.locator('room-settings-panel');
    await panel.getByTestId('room-settings-tab-notice').click();

    await expect(panel.getByTestId('room-settings-notice-round')).toBeDisabled();
    await expect(panel.getByTestId('room-settings-notice-round')).toHaveText(/既定（一番左のタブ）/);
  });
});
