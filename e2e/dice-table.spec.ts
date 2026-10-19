import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('the dice table settings panel (detailed editing)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
  });

  test('shows the empty state "no dice tables" by default', async ({ page }) => {
    await expect(page.locator('dice-table-setting').getByText('ダイス表がありません')).toBeVisible();
  });

  test('makes the first table with the "make a table" button', async ({ page }) => {
    await page.locator('dice-table-setting').getByRole('button', { name: '表を作成' }).click();
    await expect(page.locator('dice-table-setting input[name="dice-table-name"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test('enables the table title, dice and command inputs with the edit button', async ({ page }) => {
    await page.locator('dice-table-setting button[title="新しい表を作る"]').click();
    await expect(page.locator('dice-table-setting input[name="dice-table-name"]')).toBeVisible({
      timeout: 5000,
    });
    // They are read-only by default, with the disabled attribute. The edit button sets isEdit = true.
    await page.locator('dice-table-setting').getByRole('button', { name: '編集' }).click();
    await expect(page.locator('dice-table-setting').getByText('編集中')).toBeVisible();
    const titleInput = page.locator('dice-table-setting input[name="dice-table-name"]');
    await titleInput.fill('暴走表');
    await expect(titleInput).toHaveValue('暴走表');
  });

  test('takes a dice expression and a command in edit mode', async ({ page }) => {
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

  test('goes back from edit mode to view mode with the "confirm" button', async ({ page }) => {
    await page.locator('dice-table-setting button[title="新しい表を作る"]').click();
    await expect(page.locator('dice-table-setting input[name="dice-table-name"]')).toBeVisible({
      timeout: 5000,
    });
    await page.locator('dice-table-setting').getByRole('button', { name: '編集' }).click();
    await expect(page.locator('dice-table-setting').getByText('編集中')).toBeVisible();
    await page.locator('dice-table-setting').getByRole('button', { name: '確定' }).click();
    // The edit button shows again (view mode).
    await expect(page.locator('dice-table-setting').getByRole('button', { name: '編集' })).toBeVisible();
  });
});
