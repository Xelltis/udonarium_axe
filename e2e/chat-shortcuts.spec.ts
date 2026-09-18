import { expect, test } from '@playwright/test';

import { chatTabPill, waitAppReady } from './helpers';

test.describe('チャット入力のキーボードショートカット', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('Enter キーでメッセージが送信されること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('Enterで送信');
    await textarea.press('Enter');
    // 送信成功時は textarea がクリアされる。
    await expect(textarea).toHaveValue('');
    await expect(page.locator('chat-tab').getByText('Enterで送信')).toBeVisible({ timeout: 5000 });
  });

  test('Shift+Enter は改行になり送信されないこと', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('1行目');
    await textarea.press('Shift+Enter');
    await textarea.type('2行目');
    // 値は改行を含んだまま (送信されていない)
    await expect(textarea).toHaveValue('1行目\n2行目');
  });

  test('Ctrl+→ でタブが右に切り替わること', async ({ page }) => {
    // 既定アクティブはメインタブ (index=0)、サブタブが index=1。
    const textarea = page.locator('textarea.chat-input');
    await textarea.focus();
    await textarea.press('Control+ArrowRight');
    const subTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(1);
    await expect(subTabRadio).toBeChecked();
  });

  test('Ctrl+← でメインタブに戻ること', async ({ page }) => {
    // サブタブピル経由でまずサブに切り替えてから ← で戻る。
    await chatTabPill(page, 'サブタブ').click();
    const subTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(1);
    await expect(subTabRadio).toBeChecked();

    // ピルを押した直後はフォーカスがラジオ側にある。focus() だけだと入力欄に
    // 戻りきる前にキーが飛び、切り替えが起きないまま先へ進んでしまう。
    const textarea = page.locator('textarea.chat-input');
    await textarea.click();
    await expect(textarea).toBeFocused();
    await textarea.press('Control+ArrowLeft');

    const mainTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(0);
    await expect(mainTabRadio).toBeChecked();
  });
});
