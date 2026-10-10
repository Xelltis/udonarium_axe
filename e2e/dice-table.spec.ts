import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('ダイス表設定パネル (詳細編集)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
  });

  test('既定では「ダイス表がありません」の空状態であること', async ({ page }) => {
    await expect(page.locator('dice-table-setting').getByText('ダイス表がありません')).toBeVisible();
  });

  test('「表を作成」ボタンで初回テーブルを作れること', async ({ page }) => {
    await page.locator('dice-table-setting').getByRole('button', { name: '表を作成' }).click();
    await expect(page.locator('dice-table-setting input[name="dice-table-name"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test('編集ボタンで表タイトル/ダイス/コマンド入力が活性化すること', async ({ page }) => {
    await page.locator('dice-table-setting button[title="新しい表を作る"]').click();
    await expect(page.locator('dice-table-setting input[name="dice-table-name"]')).toBeVisible({
      timeout: 5000,
    });
    // 既定はread-only（disabled属性付き）。「編集」ボタンでisEdit=trueになる。
    await page.locator('dice-table-setting').getByRole('button', { name: '編集' }).click();
    await expect(page.locator('dice-table-setting').getByText('編集中')).toBeVisible();
    const titleInput = page.locator('dice-table-setting input[name="dice-table-name"]');
    await titleInput.fill('暴走表');
    await expect(titleInput).toHaveValue('暴走表');
  });

  test('編集モードでダイス式とコマンドを入力できること', async ({ page }) => {
    await page.locator('dice-table-setting button[title="新しい表を作る"]').click();
    await expect(page.locator('dice-table-setting input[name="dice-table-name"]')).toBeVisible({
      timeout: 5000,
    });
    await page.locator('dice-table-setting').getByRole('button', { name: '編集' }).click();
    const dice = page.locator('dice-table-setting input[name="dice-table-dice"]');
    const command = page.locator('dice-table-setting input[name="dice-table-command"]');
    await dice.fill('2d6');
    await command.fill('runaway');
    await expect(dice).toHaveValue('2d6');
    await expect(command).toHaveValue('runaway');
  });

  test('「確定」ボタンで編集モードから view モードに戻れること', async ({ page }) => {
    await page.locator('dice-table-setting button[title="新しい表を作る"]').click();
    await expect(page.locator('dice-table-setting input[name="dice-table-name"]')).toBeVisible({
      timeout: 5000,
    });
    await page.locator('dice-table-setting').getByRole('button', { name: '編集' }).click();
    await expect(page.locator('dice-table-setting').getByText('編集中')).toBeVisible();
    await page.locator('dice-table-setting').getByRole('button', { name: '確定' }).click();
    // 編集ボタンが再表示される（viewモード）
    await expect(page.locator('dice-table-setting').getByRole('button', { name: '編集' })).toBeVisible();
  });
});
