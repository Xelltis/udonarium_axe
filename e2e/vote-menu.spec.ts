import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('点呼・投票メニュー (vote-menu)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
  });

  test('既定は「点呼」モード (vm_type=rollcall) であること', async ({ page }) => {
    const radios = page.locator('app-vote-menu input[name="vm_type"]');
    await expect(radios.nth(0)).toBeChecked();
  });

  test('「投票」ラジオに切り替えるとタイトル/選択肢入力欄が現れること', async ({ page }) => {
    const radios = page.locator('app-vote-menu input[name="vm_type"]');
    await radios.nth(1).check();
    await expect(page.locator('app-vote-menu input[name="voteTitle"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('app-vote-menu input[name="voteContents"]')).toBeVisible();
  });

  test('「投票」モードでタイトル/選択肢を入力できること', async ({ page }) => {
    const radios = page.locator('app-vote-menu input[name="vm_type"]');
    await radios.nth(1).check();
    const title = page.locator('app-vote-menu input[name="voteTitle"]');
    const choices = page.locator('app-vote-menu input[name="voteContents"]');
    await title.fill('夜長テスト');
    await choices.fill('はい いいえ 棄権');
    await expect(title).toHaveValue('夜長テスト');
    await expect(choices).toHaveValue('はい いいえ 棄権');
  });

  test('自分のみ部屋にいる場合、送信ボタンは includSelf を外すと disabled になること', async ({ page }) => {
    const includeSelf = page.locator('app-vote-menu input[name="includSelf"]');
    await includeSelf.uncheck();
    const sendBtn = page.locator('app-vote-menu').getByRole('button', { name: /送信/ });
    await expect(sendBtn).toBeDisabled();
  });

  test('自分のみ部屋にいる場合の案内文が表示されること', async ({ page }) => {
    await expect(page.locator('app-vote-menu').getByText('自分しか部屋にいません')).toBeVisible();
  });
});
