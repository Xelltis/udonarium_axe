import { expect, test } from '@playwright/test';

import { chatTabPill, openChatSettingsMenuItem, waitAppReady } from './helpers';

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
    const input = page.locator('chat-input textarea').first();
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
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('テストメッセージ');
    await expect(textarea).toHaveValue('テストメッセージ');
  });

  test('shows a sent chat message in the log', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('E2Eテスト送信');
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expect(textarea).toHaveValue('');
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

  test('has the colour settings button', async ({ page }) => {
    await expect(page.locator('chat-input').getByRole('button', { name: /色設定/ })).toBeVisible();
  });
});

test.describe('rolling dice in the chat', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows the dice result in the log when a dice command (2d6) is sent', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('2d6');
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expect(textarea).toHaveValue('');
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
    await expect(page.locator('chat-input ng-select')).toHaveCount(3);
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
    const textarea = page.locator('textarea.chat-input');
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
    const textarea = page.locator('textarea.chat-input');
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
