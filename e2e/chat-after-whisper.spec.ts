import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('あとから秘話', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  // 相手を選んで秘話にするところは、2 人目が入れない E2E では確かめられない（単体テストで固定）。
  test('自分の発言の秘話ボタンから相手の一覧が開き、ほかに誰もいなければそう出ること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('本当はノアにだけ言いたかった');
    await textarea.press('Enter');
    await expect(textarea).toHaveValue('');

    const line = page.locator('chat-tab chat-message').filter({ hasText: '本当はノアにだけ言いたかった' });
    await line.locator('.msg-text').hover();
    await line.getByTestId('chat-message-after-whisper').click();

    const picker = line.getByTestId('chat-message-after-whisper-picker');
    await expect(picker).toContainText('部屋にほかの参加者がいません');
    await expect(picker.getByTestId('chat-message-after-whisper-target')).toHaveCount(0);
  });
});
