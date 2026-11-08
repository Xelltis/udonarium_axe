import { expect, type Locator, type Page, test } from '@playwright/test';

import { chatInput, chatInputText, expectChatText, waitAppReady } from './helpers';

/** Says a line and opens it for editing in place, answering the line and the box it is edited in. */
async function sayAndEdit(page: Page, words: string): Promise<{ line: Locator; editor: Locator }> {
  const input = chatInput(page);
  await input.fill(words);
  await input.press('Enter');
  await expectChatText(input, '');
  const line = page.locator('chat-tab chat-message').filter({ hasText: words }).last();
  await line.locator('.msg-text').hover();
  await line.getByTestId('chat-message-action-edit').click();
  const editor = line.locator('[data-chat-line-edit]');
  await expect(editor).toBeVisible();
  return { line, editor };
}

test.describe('editing a line in place', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('chat-window [data-chat-input-mode="rich"]')).toBeVisible({ timeout: 10000 });
  });

  test('edits a line as it will look, at the size the chat is read at, with the formatting buttons and the stamps and no syntax to put in', async ({
    page,
  }) => {
    await page.evaluate(() => document.documentElement.style.setProperty('--chat-font-size', '19px'));
    const { line, editor } = await sayAndEdit(page, '今日は晴れ');
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(await editor.evaluate((box) => getComputedStyle(box).fontSize)).toBe('19px');
    const toolbar = line.getByTestId('chat-line-edit-toolbar');
    await expect(toolbar.getByTestId('chat-toolbar-bold')).toBeVisible();
    await expect(toolbar.getByTestId('chat-toolbar-ruby')).toBeVisible();
    await expect(toolbar.locator('[data-testid^="chat-toolbar-group-"]')).toHaveCount(0);

    await page.keyboard.type('、**とても**');
    await expect(editor.locator('.chat-deco-bold')).toHaveText('とても');
    await expect.poll(() => chatInputText(editor)).toBe('今日は晴れ、**とても**');
    await line.getByTestId('chat-line-edit-stamp').click();
    const picker = page.getByTestId('stamp-picker');
    await picker.getByTestId('stamp-picker-tab-seal').click();
    await picker.getByTestId('stamp-picker-choice-seal:ok').click();
    await expect(editor.locator('[data-chip="stamp"][data-stamp-id="seal:ok"]')).toHaveCount(1);
    await editor.press('Enter');

    await expect(editor).toHaveCount(0);
    await expect(line.locator('[data-chat-search-text] .chat-deco-bold')).toHaveText('とても');
    await expect(line.locator('[data-chat-search-text] [data-stamp-id="seal:ok"]')).toBeVisible();
  });

  test('puts an edit down at one Escape right after a mark that starts a name', async ({ page }) => {
    const { line, editor } = await sayAndEdit(page, '名前の前');
    await page.keyboard.type(' {');

    await page.keyboard.press('Escape');

    await expect(editor).toHaveCount(0);
    await expect(line.locator('[data-chat-search-text]')).toHaveText('名前の前');
  });
});
