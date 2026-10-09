import { expect, Locator, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';

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
    await bookmark(page, witness, '共有');
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
    await bookmark(page, line, '共有');
    await expect(page.getByTestId('chat-bookmarks-toggle-count')).toHaveText('1');

    await page.getByTestId('chat-bookmarks-toggle').click();
    const item = page.getByTestId('chat-bookmark-item');
    await item.hover();
    await item.getByTestId('chat-bookmark-remove').click();

    await expect(page.getByTestId('chat-bookmarks-empty')).toBeVisible();
    await expect(line.getByTestId('chat-message-bookmark-mark')).toHaveCount(0);
  });

  test('個人しおりは共有しおりと分かれて一覧に並び、個人だけに絞れること', async ({ page }) => {
    await say(page, ['みんなで覚えておく発言', '自分だけ覚えておく発言']);
    const shared = lineSaying(page, 'みんなで覚えておく発言');
    await bookmark(page, shared, '共有');
    const personal = lineSaying(page, '自分だけ覚えておく発言');
    await bookmark(page, personal, '個人');
    await expect(personal.locator('[data-testid="chat-message-bookmark-mark"][data-kind="personal"]')).toBeVisible();

    await page.getByTestId('chat-bookmarks-toggle').click();
    const items = page.getByTestId('chat-bookmark-item');
    await expect(items).toHaveCount(2);
    await expect(items.getByTestId('chat-bookmark-kind')).toHaveText(['共有', '個人']);

    await page.getByTestId('chat-bookmarks-filter-personal').click();
    await expect(items).toHaveCount(1);
    await expect(items.getByTestId('chat-bookmark-title')).toHaveText('自分だけ覚えておく発言');
  });
});
