import { expect, type Page, test } from '@playwright/test';

import {
  chatInput,
  chatInputText,
  chatTabPill,
  createCharacter,
  expectChatText,
  openChatSettingsMenuItem,
  waitAppReady,
} from './helpers';

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

/** Puts a ruby in from the toolbar's ruby popover, the words and their reading typed into it. */
async function rubyFromToolbar(page: Page, base: string, reading: string): Promise<void> {
  await page.locator('chat-window [data-testid="chat-toolbar-ruby"]').click();
  await page.getByTestId('chat-toolbar-ruby-base').fill(base);
  await page.getByTestId('chat-toolbar-ruby-reading').fill(reading);
  await page.getByTestId('chat-toolbar-ruby-apply').click();
}

/** The lines in the log that hold a ruby. */
function linesWithRuby(page: Page) {
  return page.locator('chat-tab chat-message').filter({ has: page.locator('ruby.chat-ruby') });
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

  test('takes the bold back to the stars typed, and a chip back to its syntax, with Backspace right after', async ({
    page,
  }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('**強く**');
    await expect(input.locator('.chat-deco-bold')).toHaveText('強く');
    await page.keyboard.press('Backspace');
    await expect(input).toHaveText('**強く**');
    await expect(input.locator('.chat-deco-bold')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type('《vs》');
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(1);
    await page.keyboard.press('Backspace');
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(0);
    await expectChatText(input, '《vs');
  });

  test('takes a chip away whole with Backspace once the caret has moved on from it', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('《vs》');
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(1);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');

    await page.keyboard.press('Backspace');

    await expect(input.locator('[data-chip="effect"]')).toHaveCount(0);
    await expectChatText(input, '');
  });

  test('pastes syntax as the decorations and chips it writes, the letters as they are on Ctrl+Shift+V, and copies back as syntax', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const input = chatInput(page);
    await input.click();
    await page.evaluate(() => navigator.clipboard.writeText('今日は**晴れ**《vs》'));
    await page.keyboard.press('ControlOrMeta+v');
    await expect(input.locator('.chat-deco-bold')).toHaveText('晴れ');
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(1);
    await expectChatText(input, '今日は**晴れ**《vs》');

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('今日は**晴れ**《vs》');

    await page.keyboard.press('Delete');
    await page.evaluate(() => navigator.clipboard.writeText('**そのまま**'));
    await page.keyboard.press('ControlOrMeta+Shift+v');
    await expect(input).toHaveText('**そのまま**');
    await expect(input.locator('.chat-deco-bold')).toHaveCount(0);
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

  test('sends a line of a ruby alone, typed or put in from the toolbar', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('|漢字《かんじ》');
    await expect(input.locator('[data-chip="ruby"]')).toHaveCount(1);
    await input.press('Enter');
    await expectChatText(input, '');
    await expect(linesWithRuby(page)).toHaveCount(1);

    await rubyFromToolbar(page, '仮名', 'かな');
    await expectChatText(input, '|仮名《かな》');
    await input.press('Enter');
    await expectChatText(input, '');
    await expect(linesWithRuby(page)).toHaveCount(2);
    await expect(linesWithRuby(page).last().locator('rt')).toHaveText('かな');
  });

  test('takes a ruby off from the toolbar, sending the words left', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await rubyFromToolbar(page, '漢字', 'かんじ');
    await input.locator('[data-chip="ruby"]').click();
    await page.locator('chat-window [data-testid="chat-toolbar-ruby"]').click();
    await page.getByRole('button', { name: 'ルビを外す' }).click();
    await expectChatText(input, '漢字');

    await input.press('Enter');
    await expectChatText(input, '');
    await expect(page.locator('chat-tab chat-message').filter({ hasText: '漢字' })).toHaveCount(1);
    await expect(linesWithRuby(page)).toHaveCount(0);
  });

  test('selects the words a drag runs over from anywhere in the box, leaving the panel where it stands', async ({
    page,
  }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('ドラッグで選ぶ言葉');
    await expectChatText(input, 'ドラッグで選ぶ言葉');
    const panel = page.locator('.draggable-panel').filter({ has: page.locator('chat-window') });
    const before = (await panel.boundingBox())!;
    const box = (await page.locator('chat-window [data-chat-input-box]').boundingBox())!;
    const line = (await input.locator('p').first().boundingBox())!;
    expect(box.y + box.height - 8).toBeGreaterThan(line.y + line.height);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
    await page.mouse.down();
    await page.mouse.move(line.x + 4, line.y + line.height / 2, { steps: 8 });
    await page.mouse.up();

    const after = (await panel.boundingBox())!;
    expect([after.x, after.y]).toEqual([before.x, before.y]);
    expect(await page.evaluate(() => document.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
  });

  test('draws every chip in a line at one height, on one middle', async ({ page }) => {
    const from = page.locator('chat-window .chat-select--from');
    const search = from.locator('input[role="combobox"]');
    await search.fill('キャラクターC');
    await expect(
      page.locator('.ng-dropdown-panel').getByRole('option', { name: 'キャラクターC', exact: true })
    ).toBeVisible();
    await search.press('Enter');
    await expect(from.locator('.ng-value-label')).toHaveText('キャラクターC');
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('《殴打》 {HP} |漢字《かんじ》 ');
    await expect(input.locator('[data-chip="reference"][data-value]')).toHaveCount(1, { timeout: 5000 });
    const boxes = await input
      .locator('[data-chip="effect"], [data-chip="reference"]')
      .evaluateAll((chips) =>
        chips.map((chip) => chip.getBoundingClientRect()).map((box) => [box.height, box.top + box.height / 2])
      );
    expect(boxes).toHaveLength(2);
    expect(Math.abs(boxes[0][0] - boxes[1][0])).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[0][1] - boxes[1][1])).toBeLessThanOrEqual(1);
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
    const button = page.locator('chat-window [data-testid="chat-toolbar-style"]');
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

  test('opens a popover again at one press once it shut by itself', async ({ page }) => {
    const button = page.locator('chat-window [data-testid="chat-toolbar-style"]');
    const panel = page.locator('[data-testid="chat-toolbar-panel"]');
    await button.click();
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    await expect(panel).toBeVisible();
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

  test('writes the syntax picked from the button of its kind where it is read', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('攻撃 ');
    const dice = page.locator('chat-window [data-testid="chat-toolbar-group-dice"]');
    await expect(dice).toHaveAttribute('aria-label', 'ダイス');
    await dice.click();
    const panel = page.locator('[data-testid="chat-toolbar-panel"]');
    await panel.getByRole('listitem').filter({ hasText: '2D6' }).first().click();
    await expectChatText(input, '2D6 攻撃 ');

    await page.locator('chat-window [data-testid="chat-toolbar-group-effect"]').click();
    await panel.getByRole('listitem').filter({ hasText: '《vs》' }).click();
    await expectChatText(input, '2D6 攻撃 《vs》');
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(1);
  });

  test('puts a reference to the target in as a chip, from the reference button', async ({ page }) => {
    await page.locator('chat-window ng-select[name="send-from"]').click();
    await page.locator('ng-dropdown-panel .ng-option', { hasText: 'キャラクターA' }).click();
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('t:HP-');
    await expectChatText(input, 't:HP-');

    await page.locator('chat-window [data-testid="chat-toolbar-group-reference"]').click();
    const panel = page.locator('[data-testid="chat-toolbar-panel"]');
    await panel
      .getByRole('listitem')
      .filter({ hasText: /^\s*HP/ })
      .getByRole('button', { name: 't{}' })
      .click();

    await expectChatText(input, 't:HP-t{HP}');
    await expect(input.locator('[data-chip="reference"]')).toHaveCount(1);
  });

  test('takes in the closing brace already written when a name is picked for a reference', async ({ page }) => {
    await page.locator('chat-window ng-select[name="send-from"]').click();
    await page.locator('ng-dropdown-panel .ng-option', { hasText: 'キャラクターA' }).click();
    const input = chatInput(page);
    await input.click();

    await page.locator('chat-window [data-testid="chat-toolbar-group-reference"]').click();
    await page
      .locator('[data-testid="chat-toolbar-panel"]')
      .getByRole('listitem')
      .filter({ hasText: /^\s*ターゲットの値/ })
      .first()
      .click();
    await expectChatText(input, 't{}');
    await expect(page.locator('[data-testid="chat-suggestions"]')).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(input.locator('[data-chip="reference"]')).toHaveCount(1);
    await expect.poll(() => chatInputText(input)).toMatch(/^t\{[^{}]+\}$/);
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

  test('marks an effect with no piece targeted or selected to play on', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('《');
    await expect(page.locator('[data-testid="chat-suggestions"]')).toBeVisible();
    await page.keyboard.press('Enter');
    const chip = input.locator('[data-chip="effect"]');
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveClass(/chat-lint-warning/, { timeout: 5000 });
    await expect(chip).toHaveAttribute('data-tip', /対象のコマがいない/);
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

  test('shuts the list of findings once nothing is found any more', async ({ page }) => {
    const input = chatInput(page);
    await input.fill(':HP-1');
    const findings = page.locator('chat-window [data-testid="chat-input-findings"]');
    await expect(findings).toBeVisible({ timeout: 5000 });
    await findings.click();
    const list = page.locator('chat-window [data-testid="chat-input-finding-list"]');
    await expect(list).toBeVisible();

    // Cleared by keys from where the caret is, as a press would shut the list by itself.
    await input.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await expectChatText(input, '');

    await expect(list).toBeHidden({ timeout: 5000 });
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

  test('sends nothing on an Enter that comes right after the word is made', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('直後');
    await expect.poll(() => chatInputText(input)).toBe('直後');

    // Some browsers send the Enter that made the word once the word is done; it stands in for that.
    await input.evaluate((box) => {
      box.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '直後' }));
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    await page.waitForTimeout(300);
    expect(await chatInputText(input)).toBe('直後');
    await expect(page.locator('chat-tab').getByText('直後')).toHaveCount(0);
  });

  test('takes no name offered on an Enter that comes right after the word is made', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('《');
    await expect(page.locator('[data-testid="chat-suggestions"]')).toBeVisible();

    await input.evaluate((box) => {
      box.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '《' }));
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    await page.waitForTimeout(300);
    expect(await chatInputText(input)).toBe('《');
    await expect(input.locator('[data-chip="effect"]')).toHaveCount(0);
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

    const editor = palette.locator('[data-chat-palette-editor] [data-chat-palette-text]');
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

  test('keeps an edit to a variable line, and leaves Ctrl and the arrows to the caret there', async ({ page }) => {
    await withEditor(page);
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('チャットパレットを表示').click();
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    const editor = palette.locator('[data-chat-palette-editor] .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await editor.fill('//強さ=3\n2d6+{強さ} 殴る');
    await expectChatText(editor, '//強さ=3\n2d6+{強さ} 殴る');
    await palette.getByRole('button', { name: '確定' }).click();
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    await expect(editor).toBeVisible();
    const checkedTab = () =>
      palette.locator('input[name^="chat-tab"]:checked').evaluate((input) => input.parentElement!.textContent!.trim());
    const tab = await checkedTab();

    const settled = () =>
      page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await editor.locator('p').first().click();
    await page.keyboard.press('Control+ArrowLeft');
    await page.keyboard.press('End');
    await settled();
    await page.keyboard.press('Backspace');
    await page.keyboard.type('5');
    await expectChatText(editor, '//強さ=5\n2d6+{強さ} 殴る');
    await palette.getByRole('button', { name: '確定' }).click();
    await palette.getByRole('button', { name: '編集', exact: true }).click();

    await expectChatText(editor, '//強さ=5\n2d6+{強さ} 殴る');
    expect(await checkedTab()).toBe(tab);
  });
});

test.describe('the palette opened for editing', () => {
  test('opens the editor at about where the list was scrolled to', async ({ page }) => {
    await withEditor(page);
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('チャットパレットを表示').click();
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    const editor = palette.locator('[data-chat-palette-editor] .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await editor.fill(Array.from({ length: 200 }, (_, index) => `2d6 行${index}`).join('\n'));
    await expect(editor.locator('p')).toHaveCount(200);
    await palette.getByRole('button', { name: '確定' }).click();
    const list = palette.getByTestId('chat-palette-list');
    await expect(list.getByText('行199')).toBeAttached();
    await list.evaluate((element) => (element.scrollTop = element.scrollHeight));

    await palette.getByRole('button', { name: '編集', exact: true }).click();

    const host = palette.locator('[data-chat-palette-editor]');
    await expect(editor).toBeVisible();
    await expect
      .poll(() => host.evaluate((element) => element.scrollTop / Math.max(1, element.scrollHeight)))
      .toBeGreaterThan(0.5);
  });
});

test.describe('switching the editor off', () => {
  test('puts the caret back where it stood, in the plain box that takes the editor’s place', async ({ page }) => {
    await withEditor(page);
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('abcdef');
    await expectChatText(input, 'abcdef');
    for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowLeft');
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

    await openChatSettingsMenuItem(page, 'チャット設定');
    const toggle = page.locator('chat-message-setting [data-testid="chat-rich-input"]');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();

    const box = page.locator('chat-window textarea[data-chat-input]');
    await expect(box).toHaveValue('abcdef');
    expect(await box.evaluate((area: HTMLTextAreaElement) => [area.selectionStart, area.selectionEnd])).toEqual([3, 3]);
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

  test('sends a line of a ruby alone, put in from the toolbar', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('chat-preferences', JSON.stringify({ richInput: false })));
    await waitAppReady(page);
    const input = chatInput(page);
    await input.click();
    await rubyFromToolbar(page, '漢字', 'かんじ');
    await expectChatText(input, '|漢字《かんじ》');
    await input.press('Enter');
    await expectChatText(input, '');
    await expect(linesWithRuby(page)).toHaveCount(1);
  });
});

test.describe('the editor arriving after typing has begun', () => {
  test('marks what was typed into the box before the editor came, once it comes', async ({ page }) => {
    await waitAppReady(page);
    const from = page.locator('chat-window .chat-select--from');
    const search = from.locator('input[role="combobox"]');
    await search.fill('キャラクターC');
    await expect(
      page.locator('.ng-dropdown-panel').getByRole('option', { name: 'キャラクターC', exact: true })
    ).toBeVisible();
    await search.press('Enter');
    await expect(from.locator('.ng-value-label')).toHaveText('キャラクターC');
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('{HP} 2d6 ');

    await expect(page.locator('chat-window [data-chat-input-mode="rich"]')).toBeVisible({ timeout: 10000 });
    await expect(chatInput(page).locator('[data-chip="reference"][data-value]')).toHaveCount(1, { timeout: 5000 });
  });
});
