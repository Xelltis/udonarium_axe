import { expect, test } from '@playwright/test';

import { openFabMenu, waitAppReady } from './helpers';

test.describe('starting the application', () => {
  test('starts the app', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Udonarium/i);
  });

  test('shows the main UI after loading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-table-layer')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('game-table')).toBeAttached({ timeout: 20000 });
  });

  test('shows the nav items when the left FAB menu is opened', async ({ page }) => {
    await waitAppReady(page);
    await openFabMenu(page);
    // The labels are in data-label attributes, not in text nodes.
    for (const label of [
      '接続',
      'チャット',
      'テーブル関連',
      'メディア',
      'ゲームリソース',
      'セーブ&ロード',
      'ウィジェット',
      '表示',
    ]) {
      await expect(page.locator(`[data-label="${label}"]`)).toBeVisible();
    }
  });
});

test.describe('panels shown at start', () => {
  test('opens the connection and chat panels by itself at start-up', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[placeholder="ニックネーム"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('textarea.chat-input')).toBeVisible({ timeout: 20000 });
  });
});

test.describe('the connection panel (PeerMenu)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[placeholder="ニックネーム"]')).toBeVisible({ timeout: 20000 });
  });

  test('changes the nickname', async ({ page }) => {
    const input = page.locator('input[placeholder="ニックネーム"]');
    await input.fill('テストプレイヤー');
    await expect(input).toHaveValue('テストプレイヤー');
  });

  test('shows the user ID field', async ({ page }) => {
    await expect(page.locator('peer-menu').getByText(/^ID[:：]/)).toBeVisible();
  });

  test('shows either the change-icon button or the image', async ({ page }) => {
    // With no icon set a button shows; with one set, an img with the same title.
    await expect(
      page.locator('peer-menu').locator('[title="アイコンを変更する"], [aria-label="アイコンを変更する"]')
    ).toBeVisible();
  });

  test('changes the connection timeout setting', async ({ page }) => {
    const timeoutInput = page.locator('input[name="peer-timeout"]');
    await expect(timeoutInput).toBeVisible();
    await timeoutInput.fill('30');
    await expect(timeoutInput).toHaveValue('30');
  });

  test('has a show-details checkbox', async ({ page }) => {
    await expect(page.locator('input[name="disp-detail-flag"]')).toBeVisible();
  });

  test('has a show-lobby button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /ロビー/ })).toBeVisible();
  });
});

test.describe('the network indicator', () => {
  test('puts the network indicator in the DOM', async ({ page }) => {
    await page.goto('/');
    // It carries the hidden class by default, so it is checked with isAttached.
    await expect(page.locator('network-indicator')).toBeAttached({ timeout: 20000 });
  });
});
