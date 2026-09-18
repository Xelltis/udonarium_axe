import { expect, test } from '@playwright/test';

import { chatTabPill, openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('チャットウィンドウ', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('チャットタブピル (メインタブ・サブタブ) が表示されること', async ({ page }) => {
    await expect(chatTabPill(page, 'メインタブ')).toBeVisible();
    await expect(chatTabPill(page, 'サブタブ')).toBeVisible();
  });

  test('チャットタブを切り替えられること', async ({ page }) => {
    // ラジオ自体は class="peer hidden" で display:none、ラベル内のピル div を
    // クリックすると関連するラジオが checked になる。
    await chatTabPill(page, 'サブタブ').click();
    const subTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(1);
    await expect(subTabRadio).toBeChecked();
  });

  test('タブを右クリックして発言だけの別窓を開けること', async ({ page }) => {
    const input = page.locator('chat-input textarea').first();
    await input.fill('流れを見たい発言');
    await input.press('Enter');
    await expect(page.locator('chat-message').last()).toContainText('流れを見たい発言', { timeout: 15000 });

    await chatTabPill(page, 'メインタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('「メインタブ」を別窓で流す').click();

    const stream = page.locator('chat-stream');
    await expect(stream).toBeVisible();
    await expect(stream).toContainText('流れを見たい発言');
    // 読むための窓なので、発言の操作ボタンは出ない。
    await expect(stream.locator('chat-message .material-icons')).toHaveCount(0);
  });

  test('別窓は同じ右クリックから閉じられること', async ({ page }) => {
    await chatTabPill(page, 'サブタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('「サブタブ」を別窓で流す').click();
    await expect(page.locator('chat-stream')).toBeVisible();

    await chatTabPill(page, 'サブタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('別窓を閉じる').click();

    await expect(page.locator('chat-stream')).toHaveCount(0);
  });

  test('送信ボタンが表示されること', async ({ page }) => {
    await expect(page.locator('chat-input').getByRole('button', { name: '送信' })).toBeVisible();
  });

  test('チャットメッセージを入力できること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('テストメッセージ');
    await expect(textarea).toHaveValue('テストメッセージ');
  });

  test('チャットメッセージを送信するとログに表示されること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('E2Eテスト送信');
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expect(textarea).toHaveValue('');
    await expect(page.locator('chat-tab').getByText('E2Eテスト送信')).toBeVisible({ timeout: 10000 });
  });

  test('送信先が「全員」であること (デフォルト)', async ({ page }) => {
    await expect(page.locator('chat-input').getByText('全員')).toBeVisible();
  });

  test('点呼・投票ボタンが存在すること', async ({ page }) => {
    await expect(page.locator('chat-window button[title="点呼・投票"]')).toBeVisible();
  });

  test('アラームボタンが存在すること', async ({ page }) => {
    await expect(page.locator('chat-window button[title="アラーム"]')).toBeVisible();
  });

  test('チャット設定ドロップダウンが開けること', async ({ page }) => {
    const summary = page.locator('chat-window summary[title="チャット設定"]');
    await summary.click();
    const dropdown = page.locator('chat-window details[open]');
    await expect(dropdown.getByRole('button', { name: /タブ設定/ })).toBeVisible();
    await expect(dropdown.getByRole('button', { name: /ダイス表設定/ })).toBeVisible();
    await expect(dropdown.getByRole('button', { name: /チャット設定/ })).toBeVisible();
  });

  test('ダイスボットヘルプボタン (?) が存在すること', async ({ page }) => {
    await expect(page.locator('chat-input').getByRole('button', { name: '?' })).toBeVisible();
  });

  test('色設定ボタンが存在すること', async ({ page }) => {
    await expect(page.locator('chat-input').getByRole('button', { name: /色設定/ })).toBeVisible();
  });
});

test.describe('チャットでダイスロール', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('ダイスコマンド (2d6) を送信するとダイス結果がログに表示されること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('2d6');
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expect(textarea).toHaveValue('');
    // 送信ログには「2d6」エコーも残るため、DiceBot の結果メッセージで一意化する
    await expect(page.locator('chat-tab').getByText(/DiceBot.*\(2D6\)/)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('チャットタブ設定パネル', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('歯車メニューからタブ設定パネルが開けること', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
  });

  test('タブ設定パネルにタブ名入力欄があること', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('app-chat-tab-setting input[name="tab-name"]')).toBeVisible();
  });

  test('タブ名を変更できること', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    const tabNameInput = page.locator('app-chat-tab-setting input[name="tab-name"]');
    await tabNameInput.fill('カスタムタブ名');
    await expect(tabNameInput).toHaveValue('カスタムタブ名');
    // チャットウィンドウのタブピルが新しい名前に切り替わる
    await expect(chatTabPill(page, 'カスタムタブ名')).toBeVisible({ timeout: 5000 });
  });

  test('新しいタブを追加できること', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'タブ設定');
    await expect(page.locator('app-chat-tab-setting')).toBeVisible({ timeout: 5000 });
    const initialTabCount = await page.locator('chat-window input[name^="chat-tab"]').count();
    await page.locator('app-chat-tab-setting button[title="タブを追加"]').click();
    await expect(page.locator('chat-window input[name^="chat-tab"]')).toHaveCount(initialTabCount + 1, {
      timeout: 5000,
    });
  });
});

test.describe('点呼・投票ウィンドウ', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('点呼・投票ボタンをクリックするとウィンドウが開くこと', async ({ page }) => {
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
  });

  test('「自分を含める」チェックボックスがあること', async ({ page }) => {
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('app-vote-menu input[name="includSelf"]')).toBeVisible();
    await expect(page.locator('app-vote-menu').getByText('自分を含める')).toBeVisible();
  });

  test('自分しか部屋にいない場合のメッセージが表示されること', async ({ page }) => {
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('app-vote-menu').getByText('自分しか部屋にいません')).toBeVisible();
  });
});

test.describe('チャットのキャラクター送信元', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('送信元/宛先/ダイスボットの 3 つの ng-select が存在すること', async ({ page }) => {
    await expect(page.locator('chat-input ng-select')).toHaveCount(3);
  });
});

test.describe('ダイス表設定パネル', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('歯車メニューからダイス表設定パネルが開けること', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
  });

  test('「新しい表を作る」ボタンがあること', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('dice-table-setting button[title="新しい表を作る"]')).toBeVisible();
  });

  test('ダイス表を新規作成できること', async ({ page }) => {
    await openChatSettingsMenuItem(page, 'ダイス表設定');
    await expect(page.locator('dice-table-setting')).toBeVisible({ timeout: 5000 });
    const items = page.locator('dice-table-setting li[role="option"]');
    const initialCount = await items.count();
    await page.locator('dice-table-setting button[title="新しい表を作る"]').click();
    await expect(items).toHaveCount(initialCount + 1, { timeout: 5000 });
  });
});

test.describe('チャットログのスクロール枠', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('ログが自前のスクロール枠を持ち、パネル本体は伸びないこと', async ({ page }) => {
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

  test('ログを遡ると最新メッセージへ移動するボタンが出ること', async ({ page }) => {
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
