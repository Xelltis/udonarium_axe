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

test.describe('searching the chat', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await say(page, [
      '合言葉はアヒル',
      ...Array.from({ length: 24 }, (_, i) => `雑談${i + 1}`),
      'アヒルの鳴き声がする',
    ]);
    // Going to another tab and back redraws only the last few lines of the log, so the first line
    // leaves the DOM.
    const textarea = page.locator('textarea.chat-input');
    await textarea.press('Control+ArrowRight');
    await textarea.press('Control+ArrowLeft');
    await expect(page.locator('chat-tab').getByText('合言葉はアヒル')).toHaveCount(0);
  });

  test('opens on Ctrl+F, and finds and shows even old lines that are not drawn', async ({ page }) => {
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

  test('clears the marks and goes back to the input when closed with Esc', async ({ page }) => {
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

  test('says so when nothing is found', async ({ page }) => {
    await page.getByTestId('chat-search-toggle').click();
    await page.getByTestId('chat-search-input').fill('ドラゴン');

    await expect(page.getByTestId('chat-search-count')).toHaveText('見つかりません');
    await expect(page.getByTestId('chat-search-older')).toBeDisabled();
  });
});
