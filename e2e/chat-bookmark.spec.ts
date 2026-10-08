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

function lineSaying(page: Page, text: string) {
  return page.locator('chat-tab chat-message').filter({ hasText: text });
}

test.describe('チャットのしおり', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('挟んだしおりに題名を付け、別のタブから描かれていない古い発言へ戻れること', async ({ page }) => {
    await say(page, ['犯人は左利きだったと思う']);
    const witness = lineSaying(page, '犯人は左利きだったと思う');
    await witness.locator('.msg-text').hover();
    await witness.getByTestId('chat-message-bookmark').click();
    await expect(witness.getByTestId('chat-message-bookmark-mark')).toBeVisible();

    await say(
      page,
      Array.from({ length: 24 }, (_, i) => `雑談${i + 1}`)
    );
    const textarea = page.locator('textarea.chat-input');
    await textarea.press('Control+ArrowRight');
    await expect(lineSaying(page, '犯人は左利きだったと思う')).toHaveCount(0);

    await page.getByTestId('chat-bookmarks-toggle').click();
    const item = page.getByTestId('chat-bookmark-item');
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId('chat-bookmark-title')).toHaveText('犯人は左利きだったと思う');

    await item.hover();
    await item.getByTestId('chat-bookmark-rename').click();
    const name = page.getByTestId('chat-bookmark-rename-input');
    await name.fill('事件の証言A');
    await name.press('Enter');
    await expect(item.getByTestId('chat-bookmark-title')).toHaveText('事件の証言A');

    await item.getByTestId('chat-bookmark-open').click();

    await expect(page.getByTestId('chat-bookmarks')).toHaveCount(0);
    const found = lineSaying(page, '犯人は左利きだったと思う');
    await expect(found).toBeInViewport();
    await expect(found).toHaveClass(/chat-message-highlight/);
    await expect(found.getByTestId('chat-message-bookmark-mark')).toHaveAttribute('title', /事件の証言A/);
  });

  test('しおりを外すと一覧から消えること', async ({ page }) => {
    await say(page, ['あとで見返す発言']);
    const line = lineSaying(page, 'あとで見返す発言');
    await line.locator('.msg-text').hover();
    await line.getByTestId('chat-message-bookmark').click();
    await expect(page.getByTestId('chat-bookmarks-toggle-count')).toHaveText('1');

    await page.getByTestId('chat-bookmarks-toggle').click();
    const item = page.getByTestId('chat-bookmark-item');
    await item.hover();
    await item.getByTestId('chat-bookmark-remove').click();

    await expect(page.getByTestId('chat-bookmarks-empty')).toBeVisible();
    await expect(line.getByTestId('chat-message-bookmark-mark')).toHaveCount(0);
  });
});
