import { expect, type Page, test } from '@playwright/test';

import { chatInput, chatInputText, openPanel, waitAppReady } from './helpers';

async function becomeGameMaster(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
}

/** Opens the scenario texts as the game master and writes one, a title and decorated words. */
async function writeText(page: Page) {
  await waitAppReady(page);
  await becomeGameMaster(page);
  await openPanel(page, 'シナリオテキスト');
  const panel = page.getByTestId('scenario-text-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await panel.getByTestId('scenario-text-create').click();
  const editor = panel.getByTestId('scenario-text-editor');
  await expect(editor).toBeVisible();
  const title = editor.getByTestId('scenario-text-title');
  await title.fill('古い屋敷');
  await title.blur();
  const words = editor.locator('[data-chat-line-edit]');
  await words.click();
  await page.keyboard.type('扉が**軋む**音');
  await expect.poll(() => chatInputText(words)).toBe('扉が**軋む**音');
  return panel;
}

test.describe('scenario texts', () => {
  test('says a text in the chat under its title, decorated as it was written', async ({ page }) => {
    const panel = await writeText(page);

    await panel.getByTestId('scenario-text-send').click();

    const line = page.locator('chat-tab chat-message').filter({ hasText: '扉が' }).last();
    await expect(line).toContainText('古い屋敷');
    await expect(line.locator('.chat-deco-bold')).toHaveText('軋む');
    await expect(panel.getByTestId('scenario-text-sent')).toBeVisible();
  });

  test('offers the text over the chat input as its words are typed, and puts them in the input', async ({ page }) => {
    await writeText(page);

    const input = chatInput(page);
    await input.focus();
    await page.keyboard.type('軋む');
    const suggestions = page.getByTestId('chat-text-suggestions');
    await expect(suggestions).toBeVisible({ timeout: 10000 });
    await suggestions.selectOption({ index: 0 });

    await expect.poll(() => chatInputText(input)).toBe('扉が**軋む**音');
  });

  test('splits a pasted script into texts at its headings', async ({ page }) => {
    await waitAppReady(page);
    await becomeGameMaster(page);
    await openPanel(page, 'シナリオテキスト');
    const panel = page.getByTestId('scenario-text-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });

    await panel.getByTestId('scenario-text-import').click();
    await panel.getByTestId('scenario-text-import-words').fill('# 導入\n雨が降っている。\n# 真相\n犯人は執事。');
    await panel.getByTestId('scenario-text-import-run').click();

    await expect(panel.getByTestId('scenario-text-row')).toHaveCount(2);
    await expect(panel.getByTestId('scenario-text-row').first()).toHaveAttribute('data-text-title', '導入');
  });
});
