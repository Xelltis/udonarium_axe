import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('アラームメニュー', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    // chat-window内のアラームボタン（歯車左の鈴アイコン）
    await page.locator('chat-window button[title="アラーム"]').click();
    await expect(page.locator('app-alarm-menu')).toBeVisible({ timeout: 5000 });
  });

  test('アラームボタンでメニューが開けること', async ({ page }) => {
    await expect(page.locator('app-alarm-menu input[name="alarmTitle"]')).toBeVisible();
    await expect(page.locator('app-alarm-menu input[name="alarmTime"]')).toBeVisible();
  });

  test('タイトル入力欄を編集できること', async ({ page }) => {
    const titleInput = page.locator('app-alarm-menu input[name="alarmTitle"]');
    await titleInput.fill('戦闘ラウンド');
    await expect(titleInput).toHaveValue('戦闘ラウンド');
  });

  test('時間入力欄を編集できること', async ({ page }) => {
    const timeInput = page.locator('app-alarm-menu input[name="alarmTime"]');
    await timeInput.fill('30');
    await expect(timeInput).toHaveValue('30');
  });

  test('音・ポップアップ・自分含めるの 3 チェックボックスがあること', async ({ page }) => {
    await expect(page.locator('app-alarm-menu input[name="isSound"]')).toBeAttached();
    await expect(page.locator('app-alarm-menu input[name="isPopUp"]')).toBeAttached();
    await expect(page.locator('app-alarm-menu input[name="includSelf"]')).toBeAttached();
  });

  test('「自分を含める」を外すと対象 0 人になりセットボタンが disabled になること', async ({ page }) => {
    // includSelf=trueが既定なので、最初は自分1人がカウントされている。
    // それを外すとselectedNum===0となり「セット」が無効化される。
    const includeSelf = page.locator('app-alarm-menu input[name="includSelf"]');
    await includeSelf.uncheck();
    const setBtn = page.locator('app-alarm-menu').getByRole('button', { name: /セット/ });
    await expect(setBtn).toBeDisabled();
  });

  test('自分しか部屋にいない場合のメッセージが表示されること', async ({ page }) => {
    await expect(page.locator('app-alarm-menu').getByText('自分しか部屋にいません')).toBeVisible();
  });
});
