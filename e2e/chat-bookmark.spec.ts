import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, expectChatText, waitAppReady } from './helpers';

/** Opens the toolbar over a line and picks a kind of bookmark from its bookmark button. */
async function bookmark(page: Page, line: Locator, kind: '共有' | '個人') {
  await line.locator('.msg-text').hover();
  await line.getByTestId('chat-message-action-bookmark').click();
  await page
    .locator('context-menu li')
    .filter({ hasText: `${kind}しおりを` })
    .first()
    .click();
}

async function say(page: Page, lines: string[]) {
  const textarea = chatInput(page);
  for (const line of lines) {
    await textarea.fill(line);
    await textarea.press('Enter');
    await expectChatText(textarea, '');
  }
}

function lineSaying(page: Page, text: string) {
  return page.locator('chat-tab chat-message').filter({ hasText: text });
}

test.describe('chat bookmarks', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('titles a bookmark, goes back to its old line from another tab while that line is not drawn, and drops it once removed', async ({
    page,
  }) => {
    await say(page, ['犯人は左利きだったと思う']);
    const witness = lineSaying(page, '犯人は左利きだったと思う');
    await bookmark(page, witness, '共有');
    await expect(witness.getByTestId('chat-message-bookmark-mark')).toBeVisible();
    await expect(page.getByTestId('chat-bookmarks-toggle-count')).toHaveText('1');

    await say(
      page,
      Array.from({ length: 24 }, (_, i) => `雑談${i + 1}`)
    );
    const textarea = chatInput(page);
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

    await page.getByTestId('chat-bookmarks-toggle').click();
    await item.hover();
    await item.getByTestId('chat-bookmark-remove').click();
    await expect(page.getByTestId('chat-bookmarks-empty')).toBeVisible();
    await expect(found.getByTestId('chat-message-bookmark-mark')).toHaveCount(0);
  });
});
