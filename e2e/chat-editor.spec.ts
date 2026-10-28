import { expect, type Page, test } from '@playwright/test';

import { chatInput, chatInputText, chatTabPill, createCharacter, expectChatText, waitAppReady } from './helpers';

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

  test('turns stars typed round some words into bold, never showing them, and sends them as stars', async ({
    page,
  }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('とても**強く**言う');
    await expect(input.locator('.chat-deco-bold')).toHaveText('強く');
    await expect(input).toHaveText('とても強く言う');
    await expectChatText(input, 'とても**強く**言う');
  });

  test('keeps stars put in all at once, not closed where the caret stops, as they look', async ({ page }) => {
    const input = chatInput(page);
    await input.fill('a**b** c');
    await expect(input).toHaveText('a**b** c');
    await expect(input.locator('.chat-deco-bold')).toHaveCount(0);
    await expectChatText(input, 'a\\**b\\** c');
  });

  test('switches bold on and off from the toolbar, its button lit where the selection is bold', async ({ page }) => {
    const input = chatInput(page);
    const bold = page.locator('chat-window [data-testid="chat-toolbar-bold"]');
    await input.click();
    await page.keyboard.type('強く言う');
    await expectChatText(input, '強く言う');
    await page.keyboard.press('ControlOrMeta+a');
    await bold.click();
    await expectChatText(input, '**強く言う**');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');

    await bold.click();
    await expectChatText(input, '強く言う');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
  });

  test('carries bold on into what is typed after Ctrl+B', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('普通');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('太く');
    await expectChatText(input, '普通**太く**');
  });

  test('opens a bar over the words selected, standing clear of the toolbar', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('選んだ言葉');
    await expectChatText(input, '選んだ言葉');
    await page.keyboard.press('Shift+Home');
    const bubble = page.locator('[data-testid="chat-bubble"]');
    await expect(bubble).toBeVisible();
    const bar = (await bubble.boundingBox())!;
    const toolbar = (await page.locator('chat-window [data-testid="chat-toolbar"]').boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(toolbar.y + 1);

    await bubble.locator('[data-mark="italic"]').click();
    await expectChatText(input, '[斜体]選んだ言葉[/斜体]');
  });

  test('opens its popovers upward from the foot of the screen, and keeps them on it', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('赤く');
    await expectChatText(input, '赤く');
    await page.keyboard.press('ControlOrMeta+a');
    const button = page.locator('chat-window [data-testid="chat-toolbar-color"]');
    await button.click();
    const panel = page.locator('[data-testid="chat-toolbar-panel"]');
    await expect(panel).toBeVisible();
    const opened = (await panel.boundingBox())!;
    const anchor = (await button.boundingBox())!;
    const view = page.viewportSize()!;
    expect(opened.y + opened.height).toBeLessThanOrEqual(anchor.y + 1);
    expect(opened.y).toBeGreaterThanOrEqual(0);
    expect(opened.x + opened.width).toBeLessThanOrEqual(view.width);

    await panel.getByRole('button', { name: '赤' }).click();
    await expectChatText(input, '[赤]赤く[/赤]');
  });

  test('puts a reading over the words selected, as a ruby', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('漢字');
    await expectChatText(input, '漢字');
    await page.keyboard.press('ControlOrMeta+a');
    await page.locator('chat-window [data-testid="chat-toolbar-ruby"]').click();
    await page.locator('[data-testid="chat-toolbar-ruby-reading"]').fill('かんじ');
    await page.locator('[data-testid="chat-toolbar-ruby-apply"]').click();
    await expectChatText(input, '|漢字《かんじ》');
    await expect(input.locator('ruby')).toHaveCount(1);
  });

  test('writes the syntax picked from the insert button where it is read', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('攻撃 ');
    await page.locator('chat-window [data-testid="chat-toolbar-insert"]').click();
    const panel = page.locator('[data-testid="chat-toolbar-panel"]');
    await panel.locator('[data-group="dice"]').click();
    await panel.getByRole('listitem').filter({ hasText: '2D6' }).first().click();
    await expectChatText(input, '攻撃 2D6 ');

    await page.locator('chat-window [data-testid="chat-toolbar-insert"]').click();
    await panel.locator('[data-group="effect"]').click();
    await panel.getByRole('listitem').filter({ hasText: '《vs》' }).click();
    await expectChatText(input, '攻撃 2D6 《vs》');
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(1);
  });

  test('offers the names a syntax takes over the caret, Enter taking one, and sends on Enter with none offered', async ({
    page,
  }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('《');
    const list = page.locator('[data-testid="chat-suggestions"]');
    await expect(list).toBeVisible();
    const offered = (await list.boundingBox())!;
    const field = (await input.boundingBox())!;
    expect(offered.y + offered.height).toBeLessThanOrEqual(field.y + 2);
    const name = (await list.getByRole('option').first().textContent())!.trim();

    await page.keyboard.press('Enter');
    await expectChatText(input, `《${name}》`);
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(1);
    await expect(list).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expectChatText(input, '');
  });

  test('marks what will not work, and lists it from the button beside the box', async ({ page }) => {
    const input = chatInput(page);
    await input.fill(':HP-1');
    const findings = page.locator('chat-window [data-testid="chat-input-findings"]');
    await expect(findings).toBeVisible({ timeout: 5000 });
    await expect(input.locator('.chat-lint-warning')).toHaveCount(1);

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

test.describe('the palette written in the editor', () => {
  test('checks each line against the piece and the variables written above it', async ({ page }) => {
    await withEditor(page);
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('チャットパレットを表示').click();
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();

    const editor = palette.locator('[data-chat-palette-editor] [data-chat-input]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await editor.fill('//強さ=3\n2d6+{強さ} 殴る\n:気力-1');
    await expectChatText(editor, '//強さ=3\n2d6+{強さ} 殴る\n:気力-1');
    await expect(editor.locator('.chat-lint-error').first()).toHaveAttribute('data-tip', /気力/, { timeout: 5000 });
    await expect(editor.locator('.chat-lint-error').filter({ hasText: '強さ' })).toHaveCount(0);
    await expect(editor.locator('.chat-rich-reference')).toHaveCount(1);
    await expect(editor.locator('.chat-rich-quiet')).toHaveCount(1);
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

  test('takes the toolbar too, writing the marks round the selection', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('chat-preferences', JSON.stringify({ richInput: false })));
    await waitAppReady(page);
    const input = chatInput(page);
    await input.fill('強く');
    await input.selectText();
    await page.locator('chat-window [data-testid="chat-toolbar-bold"]').click();
    await expectChatText(input, '**強く**');
  });
});
