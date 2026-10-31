import { expect, test } from '@playwright/test';

import { chatInput, chatTabPill, expectChatText, openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('the chat window', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows the chat tab pills (main tab and sub tab)', async ({ page }) => {
    await expect(chatTabPill(page, 'メインタブ')).toBeVisible();
    await expect(chatTabPill(page, 'サブタブ')).toBeVisible();
  });

  test('switches chat tabs', async ({ page }) => {
    // The radio itself is display:none through class="peer hidden". A click on the pill div in the
    // label checks the radio it belongs to.
    await chatTabPill(page, 'サブタブ').click();
    const subTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(1);
    await expect(subTabRadio).toBeChecked();
  });

  test('opens a separate window of the lines alone from a right click on a tab', async ({ page }) => {
    const input = chatInput(page).first();
    await input.fill('流れを見たい発言');
    await input.press('Enter');
    await expect(page.locator('chat-message').last()).toContainText('流れを見たい発言', { timeout: 15000 });

    await chatTabPill(page, 'メインタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('「メインタブ」を別窓で流す').click();

    const stream = page.locator('chat-stream');
    await expect(stream).toBeVisible();
    await expect(stream).toContainText('流れを見たい発言');
    // The window is for reading, so the buttons for acting on a line do not show.
    await expect(stream.locator('chat-message .material-icons')).toHaveCount(0);
  });

  test('closes the separate window from the same right click', async ({ page }) => {
    await chatTabPill(page, 'サブタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('「サブタブ」を別窓で流す').click();
    await expect(page.locator('chat-stream')).toBeVisible();

    await chatTabPill(page, 'サブタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('別窓を閉じる').click();

    await expect(page.locator('chat-stream')).toHaveCount(0);
  });

  test('shows the send button', async ({ page }) => {
    await expect(page.locator('chat-input').getByRole('button', { name: '送信' })).toBeVisible();
  });

  test('takes a chat message in the input', async ({ page }) => {
    const textarea = chatInput(page);
    await textarea.fill('テストメッセージ');
    await expectChatText(textarea, 'テストメッセージ');
  });

  test('shows a sent chat message in the log', async ({ page }) => {
    const textarea = chatInput(page);
    await textarea.fill('E2Eテスト送信');
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expectChatText(textarea, '');
    await expect(page.locator('chat-tab').getByText('E2Eテスト送信')).toBeVisible({ timeout: 10000 });
  });

  test('sends to "everyone" by default', async ({ page }) => {
    await expect(page.locator('chat-input').getByText('全員')).toBeVisible();
  });

  test('has the roll call and vote button', async ({ page }) => {
    await expect(page.locator('chat-window button[title="点呼・投票"]')).toBeVisible();
  });

  test('has the alarm button', async ({ page }) => {
    await expect(page.locator('chat-window button[title="アラーム"]')).toBeVisible();
  });

  test('opens the chat settings dropdown', async ({ page }) => {
    const summary = page.locator('chat-window summary[title="チャット設定"]');
    await summary.click();
    const dropdown = page.locator('chat-window details[open]');
    await expect(dropdown.getByRole('button', { name: /タブ設定/ })).toBeVisible();
    await expect(dropdown.getByRole('button', { name: /ダイス表設定/ })).toBeVisible();
    await expect(dropdown.getByRole('button', { name: /チャット設定/ })).toBeVisible();
  });

  test('has the dice bot help button (?)', async ({ page }) => {
    await expect(page.locator('chat-input').getByRole('button', { name: '?' })).toBeVisible();
  });

  test('has the colour settings button under the speech colour button', async ({ page }) => {
    await page.locator('chat-window [data-testid="chat-input-color"]').click();
    await expect(page.locator('chat-input').getByRole('button', { name: /色設定/ })).toBeVisible();
  });
});

test.describe('rolling dice in the chat', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows the dice result in the log when a dice command (2d6) is sent', async ({ page }) => {
    const textarea = chatInput(page);
    await textarea.fill('2d6');
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expectChatText(textarea, '');
    // The log also keeps the echo of the "2d6" sent, so the DiceBot result message is what picks
    // out one line.
    await expect(page.locator('chat-tab').getByText(/DiceBot.*\(2D6\)/)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('the chat tab settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens the tab settings panel from the gear menu', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
  });

  test('has a tab name field in the tab settings panel', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('app-chat-tab-setting input[name="tab-name"]')).toBeVisible();
  });

  test('renames a tab', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    const tabNameInput = page.locator('app-chat-tab-setting input[name="tab-name"]');
    await tabNameInput.fill('カスタムタブ名');
    await expect(tabNameInput).toHaveValue('カスタムタブ名');
    // The chat window's tab pill takes the new name.
    await expect(chatTabPill(page, 'カスタムタブ名')).toBeVisible({ timeout: 5000 });
  });

  test('adds a new tab', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    const initialTabCount = await page.locator('chat-window input[name^="chat-tab"]').count();
    await page.locator('app-chat-tab-setting button[title="タブを追加"]').click();
    await expect(page.locator('chat-window input[name^="chat-tab"]')).toHaveCount(initialTabCount + 1, {
      timeout: 5000,
    });
  });
});

test.describe('the roll call and vote window', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens the window from the roll call and vote button', async ({ page }) => {
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
  });

  test('has the "include myself" checkbox', async ({ page }) => {
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('app-vote-menu input[name="includSelf"]')).toBeVisible();
    await expect(page.locator('app-vote-menu').getByText('自分を含める')).toBeVisible();
  });

  test('shows the message for when nobody but oneself is in the room', async ({ page }) => {
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('app-vote-menu').getByText('自分しか部屋にいません')).toBeVisible();
  });
});

test.describe('the character a chat line is sent as', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('has three ng-selects, for the sender, the recipient and the dice bot', async ({ page }) => {
    await expect(page.locator('chat-window chat-input ng-select')).toHaveCount(3);
  });

  test('puts the selects in the row over the box and the buttons that edit the line along the top of the box', async ({
    page,
  }) => {
    const input = page.locator('chat-window chat-input');
    const selects = input.getByTestId('chat-input-selects');
    const frame = input.getByTestId('chat-input-frame');
    const edits = frame.getByTestId('chat-input-edits');
    await expect(edits).toHaveAttribute('role', 'toolbar');
    await expect(selects.locator('ng-select')).toHaveCount(3);
    await expect(selects.getByRole('button', { name: '?' })).toBeVisible();
    await expect(edits.getByTestId('chat-toolbar-bold')).toBeVisible();
    await expect(edits.getByTestId('chat-input-stamp')).toBeVisible();
    for (const key of ['dice', 'reference', 'resource', 'buff', 'portrait', 'effect', 'quote']) {
      await expect(edits.getByTestId(`chat-toolbar-group-${key}`)).toBeVisible();
    }
    const boxOf = async (element: typeof selects) => (await element.boundingBox())!;
    const row = await boxOf(selects);
    const band = await boxOf(edits);
    const box = await boxOf(frame.locator('[data-chat-input-box]'));
    expect(row.height).toBeLessThan(36);
    expect(band.height).toBeLessThan(36);
    expect(band.y).toBeGreaterThan(row.y + row.height);
    expect(Math.abs(band.x - box.x)).toBeLessThan(1);
    expect(Math.abs(band.x + band.width - (box.x + box.width))).toBeLessThan(1);
    expect(box.y).toBeGreaterThanOrEqual(band.y + band.height - 1);

    const [from, to, gameType] = await Promise.all(
      (await selects.locator('ng-select').all()).map(async (select) => (await select.boundingBox())!)
    );
    expect(Math.abs(from.width - to.width)).toBeLessThan(2);
    expect(gameType.x - (to.x + to.width)).toBeLessThan(16);
    const color = await boxOf(edits.getByTestId('chat-input-color'));
    expect(band.x + band.width - (color.x + color.width)).toBeLessThan(16);

    await edits.getByTestId('chat-input-color').click();
    await expect(page.locator('chat-window').getByRole('button', { name: '持ち色2' })).toBeVisible();
    await expect(page.locator('chat-window').getByRole('button', { name: /色設定/ })).toBeVisible();
  });

  test('keeps the slider of a speaker with several portraits on the line of the buttons where there is room', async ({
    page,
  }) => {
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await sheet.locator('button[title="立ち絵を追加"]').click();
    await page.locator('modal img').nth(1).click();
    await page.locator('ui-panel', { has: sheet }).locator('.bg-ui-titlebar button').last().dispatchEvent('click');
    await expect(sheet).toBeHidden();
    await page.locator('chat-window ng-select[name="send-from"]').click();
    await page.locator('ng-dropdown-panel .ng-option', { hasText: 'モンスターA' }).click();

    const edits = page.locator('chat-window [data-testid="chat-input-edits"]');
    const slider = edits.getByTestId('chat-input-portraits');
    await expect(slider).toBeVisible();
    const band = (await edits.boundingBox())!;
    const knob = (await slider.boundingBox())!;
    const bold = (await edits.getByTestId('chat-toolbar-bold').boundingBox())!;
    expect(band.height).toBeLessThan(36);
    expect(Math.abs(knob.y + knob.height / 2 - (bold.y + bold.height / 2))).toBeLessThan(4);
    expect(knob.x + knob.width).toBeLessThan(bold.x);
  });

  test('writes the line in the box in the colour and on the bubble it will be shown in, as its button underlines', async ({
    page,
  }) => {
    await page.locator('chat-window [data-testid="chat-input-color"]').click();
    const second = page.locator('chat-window').getByRole('button', { name: '持ち色2' }).locator('span');
    const look = (element: Element) => [getComputedStyle(element).color, getComputedStyle(element).backgroundColor];
    const [color, bubble] = await second.evaluate(look);
    await page.locator('chat-window').getByRole('button', { name: '持ち色2' }).click();
    const box = page.locator('chat-window [data-chat-input-box]');
    await expect.poll(() => box.evaluate(look)).toEqual([color, bubble]);
    await expect
      .poll(() =>
        page
          .locator('chat-window [data-testid="chat-input-color-ink"]')
          .evaluate((element) => getComputedStyle(element).backgroundColor)
      )
      .toBe(color);
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('色');
    await expect.poll(() => input.evaluate((element) => getComputedStyle(element).color)).toBe(color);
  });

  test('takes one Tab stop in the row of buttons, the arrows moving along it', async ({ page }) => {
    const edits = page.locator('chat-window [data-testid="chat-input-edits"]');
    await expect(edits.getByTestId('chat-toolbar-bold')).toBeVisible();
    await edits.getByTestId('chat-toolbar-bold').focus();
    await page.keyboard.press('ArrowRight');
    await expect(edits.getByTestId('chat-toolbar-italic')).toBeFocused();
    await page.keyboard.press('End');
    await expect(edits.getByTestId('chat-input-color')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(chatInput(page)).toBeFocused();
  });

  test('opens the list of recipients upward from the chat at the foot of the screen, on the screen', async ({
    page,
  }) => {
    const select = page.locator('chat-window ng-select[name="send-to"]');
    await select.click();
    const list = page.locator('ng-dropdown-panel');
    await expect(list).toBeVisible();
    const opened = (await list.boundingBox())!;
    const anchor = (await select.boundingBox())!;
    expect(opened.y + opened.height).toBeLessThanOrEqual(anchor.y + 1);
    expect(opened.y).toBeGreaterThanOrEqual(0);
  });
});

test.describe('the dice table settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens the dice table settings panel from the gear menu', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
  });

  test('has the "make a new table" button', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('dice-table-setting button[title="新しい表を作る"]')).toBeVisible();
  });

  test('makes a new dice table', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
    const items = page.locator('dice-table-setting li[role="option"]');
    const initialCount = await items.count();
    await page.locator('dice-table-setting button[title="新しい表を作る"]').click();
    await expect(items).toHaveCount(initialCount + 1, { timeout: 5000 });
  });
});

test.describe('the scroll frame of the chat log', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('gives the log a scroll frame of its own, so the panel itself does not grow', async ({ page }) => {
    const textarea = chatInput(page);
    const send = page.locator('chat-input').getByRole('button', { name: '送信' });
    for (let i = 0; i < 30; i++) {
      await textarea.fill(`スクロール検証 ${i}`);
      await send.click();
    }
    await expect(page.locator('chat-tab').getByText('スクロール検証 29')).toBeVisible({ timeout: 10000 });

    const log = page.locator('[data-testid="chat-log-scroll"]');
    const box = await log.evaluate((el) => {
      const panel = el.closest('ui-panel')!.querySelector<HTMLElement>('.overflow-auto');
      return {
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        panelOverflow: panel ? panel.scrollHeight - panel.clientHeight : -1,
      };
    });

    expect(box.clientHeight).toBeGreaterThan(0);
    expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
    expect(box.panelOverflow).toBeLessThanOrEqual(1);

    await expect
      .poll(() => log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop), { timeout: 5000 })
      .toBeLessThanOrEqual(8);
  });

  test('shows a button that jumps to the latest message once the log is scrolled back', async ({ page }) => {
    // Sixty lines are sent one at a time, about a third of a second each in WebKit, which with
    // the page's own start can run past the default thirty seconds.
    test.setTimeout(90_000);
    const textarea = chatInput(page);
    const send = page.locator('chat-input').getByRole('button', { name: '送信' });
    for (let i = 0; i < 60; i++) {
      await textarea.fill(`ジャンプ検証 ${i}`);
      await send.click();
    }
    await expect(page.locator('chat-tab').getByText('ジャンプ検証 59')).toBeVisible({ timeout: 10000 });

    const overflow = await page
      .locator('[data-testid="chat-log-scroll"]')
      .evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeGreaterThan(400);

    const jump = page.locator('chat-window button', { hasText: '最新メッセージへ移動' });
    await expect(jump).toBeHidden();

    await page.locator('[data-testid="chat-log-scroll"]').evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(jump).toBeVisible({ timeout: 5000 });

    await jump.click();
    await expect(jump).toBeHidden({ timeout: 5000 });
  });
});
