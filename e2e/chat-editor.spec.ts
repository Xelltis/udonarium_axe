import { expect, type Page, test } from '@playwright/test';

import { chatInput, chatInputText, chatTabPill, expectChatText, waitAppReady } from './helpers';

/** Has the reader's chat typed into the editor, as a reader who switched it on would. */
async function withEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('chat-preferences')) {
      localStorage.setItem('chat-preferences', JSON.stringify({ richInput: true }));
    }
  });
  await waitAppReady(page);
  await expect(page.locator('chat-window [data-chat-input-mode="rich"]')).toBeVisible({ timeout: 10000 });
}

test.describe('the chat editor', () => {
  test.beforeEach(async ({ page }) => {
    await withEditor(page);
  });

  test('sends the line on Enter and breaks it on Shift+Enter', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('1行目');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('2行目');
    await expectChatText(input, '1行目\n2行目');

    await page.keyboard.press('Enter');
    await expectChatText(input, '');
    await expect(page.locator('chat-tab').getByText('2行目')).toBeVisible({ timeout: 5000 });
  });

  test('takes a line filled in whole, as a box would', async ({ page }) => {
    const input = chatInput(page);
    await input.fill('まとめて入れた行');
    await expectChatText(input, 'まとめて入れた行');
    await input.press('Enter');
    await expect(page.locator('chat-tab').getByText('まとめて入れた行')).toBeVisible({ timeout: 5000 });
  });

  test('brings back the line sent before on Ctrl+↑', async ({ page }) => {
    const input = chatInput(page);
    await input.fill('前に送った行');
    await input.press('Enter');
    await expectChatText(input, '');

    await input.press('Control+ArrowUp');
    await expectChatText(input, '前に送った行');
  });

  test('leaves Ctrl+→ and Ctrl+← to the window, which switches tabs', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await input.press('Control+ArrowRight');
    await expect(page.locator('chat-window input[name^="chat-tab"]').nth(1)).toBeChecked();

    await chatTabPill(page, 'サブタブ').click();
    await input.click();
    await input.press('Control+ArrowLeft');
    await expect(page.locator('chat-window input[name^="chat-tab"]').nth(0)).toBeChecked();
  });

  test('draws a decorated line as it will look once the caret leaves it', async ({ page }) => {
    const input = chatInput(page);
    await input.fill('とても**強く**言う');
    await input.evaluate((element) => (element as HTMLElement).blur());
    await expect(input.locator('.chat-deco-bold')).toHaveText('強く');
    await expect(input).toHaveText('とても強く言う');

    await input.click();
    await input.press('End');
    await input.press('ArrowLeft');
    await input.press('ArrowLeft');
    await input.press('ArrowLeft');
    await expect(input).toHaveText('とても**強く**言う');
    await expectChatText(input, 'とても**強く**言う');
  });

  test('writes the syntax picked from its button where the caret is', async ({ page }) => {
    const input = chatInput(page);
    await input.fill('攻撃 ');
    await page.locator('chat-window [data-testid="chat-input-syntax"]').click();
    const menu = page.locator('context-menu');
    await menu.getByText('ダイス', { exact: true }).hover();
    await menu.getByText('2D6', { exact: true }).click();
    await expectChatText(input, '攻撃 2D6 ');
  });

  test('marks what will not work, and lists it from the button beside the box', async ({ page }) => {
    const input = chatInput(page);
    await input.fill(':HP-1');
    const findings = page.locator('chat-window [data-testid="chat-input-findings"]');
    await expect(findings).toBeVisible({ timeout: 5000 });
    await expect(input.locator('.cm-lintRange-warning')).toHaveCount(1);

    await findings.click();
    await expect(page.locator('chat-window [data-testid="chat-input-finding-list"]')).toContainText(
      '発言者がコマではない'
    );
  });

  test('sends nothing on the Enter that makes a word with an input method', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'composition is driven through the Chrome DevTools Protocol');
    const input = chatInput(page);
    await input.click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'かな', selectionStart: 2, selectionEnd: 2 });
    await page.keyboard.press('Enter');
    await cdp.send('Input.insertText', { text: '仮名' });
    // The Enter here is no key an input method takes, so the browser may break the line with it;
    // all that matters is that nothing went out.
    await expect.poll(() => chatInputText(input)).toContain('仮名');
    await expect(page.locator('chat-tab').getByText('仮名')).toHaveCount(0);
  });
});

test.describe('the plain box', () => {
  test('stands in for the editor for a reader who switched it off', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('chat-preferences', JSON.stringify({ richInput: false })));
    await waitAppReady(page);
    const input = chatInput(page);
    await expect(input).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(page.locator('chat-window [data-chat-input-mode="plain"]')).toBeVisible();
  });
});
