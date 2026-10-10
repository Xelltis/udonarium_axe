import { expect, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';

async function say(page: Page, lines: string[]) {
  const textarea = page.locator('textarea.chat-input');
  for (const line of lines) {
    await textarea.fill(line);
    await textarea.press('Enter');
    await expect(textarea).toHaveValue('');
  }
}

test.describe('チャットの検索', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await say(page, [
      '合言葉はアヒル',
      ...Array.from({ length: 24 }, (_, i) => `雑談${i + 1}`),
      'アヒルの鳴き声がする',
    ]);
    // タブを行き来すると、ログは末尾の数行だけを描き直す。最初の発言は DOM から消える。
    const textarea = page.locator('textarea.chat-input');
    await textarea.press('Control+ArrowRight');
    await textarea.press('Control+ArrowLeft');
    await expect(page.locator('chat-tab').getByText('合言葉はアヒル')).toHaveCount(0);
  });

  test('Ctrl+F で開き、描かれていない古い発言まで探して見せること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.press('Control+f');
    const box = page.getByTestId('chat-search-input');
    await expect(box).toBeFocused();

    await box.fill('アヒル');
    await expect(page.getByTestId('chat-search-count')).toHaveText('2 / 2');
    await expect(page.locator('chat-tab').getByText('アヒルの鳴き声がする')).toBeInViewport();

    await box.press('Enter');
    await expect(page.getByTestId('chat-search-count')).toHaveText('1 / 2');
    const oldest = page.locator('chat-tab').getByText('合言葉はアヒル');
    await expect(oldest).toBeInViewport();
    await expect(oldest.locator('xpath=ancestor::chat-message')).toHaveAttribute('data-chat-search-current', '');
    expect(await page.evaluate(() => CSS.highlights.has('chat-search-current'))).toBe(true);

    await box.press('Shift+Enter');
    await expect(page.getByTestId('chat-search-count')).toHaveText('2 / 2');
  });

  test('Esc で閉じると印が消え、入力欄に戻ること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.press('Control+f');
    await page.getByTestId('chat-search-input').fill('アヒル');
    await expect(page.getByTestId('chat-search-count')).toHaveText('2 / 2');

    await page.getByTestId('chat-search-input').press('Escape');

    await expect(page.getByTestId('chat-search')).toHaveCount(0);
    await expect(textarea).toBeFocused();
    await expect(page.locator('chat-message[data-chat-search-current]')).toHaveCount(0);
    expect(await page.evaluate(() => CSS.highlights.size)).toBe(0);
  });

  test('見つからないときはそう表示すること', async ({ page }) => {
    await page.getByTestId('chat-search-toggle').click();
    await page.getByTestId('chat-search-input').fill('ドラゴン');

    await expect(page.getByTestId('chat-search-count')).toHaveText('見つかりません');
    await expect(page.getByTestId('chat-search-older')).toBeDisabled();
  });
});
