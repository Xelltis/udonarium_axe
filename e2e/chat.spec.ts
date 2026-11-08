import { expect, test } from '@playwright/test';

import { chatInput, chatInputText, chatTabPill, waitAppReady } from './helpers';

test.describe('the stream chat widget', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens on a tab and closes again from its right click, and speaks into another tab from the one the title bar opens, made transparent', async ({
    page,
  }) => {
    const input = chatInput(page).first();
    await input.fill('流れを見たい発言');
    await input.press('Enter');
    await expect(page.locator('chat-message').last()).toContainText('流れを見たい発言', { timeout: 15000 });

    await chatTabPill(page, 'メインタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('「メインタブ」をストリームチャットウィジェットで開く').click();
    const stream = page.locator('chat-stream');
    await expect(stream).toBeVisible();
    await expect(stream).toContainText('流れを見たい発言');

    await chatTabPill(page, 'メインタブ').click({ button: 'right' });
    await page.locator('context-menu').getByText('ストリームチャットウィジェットを閉じる').click();
    await expect(stream).toHaveCount(0);

    await page
      .locator('ui-panel', { has: page.locator('chat-window') })
      .getByTestId('panel-control-forum')
      .click();
    await expect(stream).toBeVisible();
    await page.locator('ui-panel', { has: stream }).locator('button[title="透明モード"]').click();
    await expect(stream.getByTestId('chat-stream-tabs')).toBeVisible();

    await stream.locator('.chat-tab-pill', { hasText: 'サブタブ' }).click();
    const streamInput = chatInput(stream);
    await streamInput.click();
    await page.keyboard.type('ウィジェットから**話す**');
    await page.keyboard.press('Enter');

    const line = stream.locator('chat-message').last();
    await expect(line).toContainText('ウィジェットから話す', { timeout: 15000 });
    await expect(line.locator('.chat-deco-bold')).toHaveText('話す');
    await expect.poll(() => chatInputText(streamInput)).toBe('');
    await chatTabPill(page, 'サブタブ').click();
    await expect(page.locator('chat-window chat-message').last()).toContainText('ウィジェットから話す');
  });
});

test.describe('the character a chat line is sent as', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
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

test.describe('the scroll frame of the chat log', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('scrolls the log in a frame of its own, the panel not growing, and jumps back to the latest message from a button once scrolled back', async ({
    page,
  }) => {
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

    const log = page.locator('[data-testid="chat-log-scroll"]');
    const box = await log.evaluate((el) => {
      const panel = el.closest('ui-panel')!.querySelector<HTMLElement>('.overflow-auto');
      return {
        clientHeight: el.clientHeight,
        overflow: el.scrollHeight - el.clientHeight,
        panelOverflow: panel ? panel.scrollHeight - panel.clientHeight : -1,
      };
    });
    expect(box.clientHeight).toBeGreaterThan(0);
    expect(box.overflow).toBeGreaterThan(400);
    expect(box.panelOverflow).toBeLessThanOrEqual(1);
    await expect
      .poll(() => log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop), { timeout: 5000 })
      .toBeLessThanOrEqual(8);

    const jump = page.locator('chat-window button', { hasText: '最新メッセージへ移動' });
    await expect(jump).toBeHidden();

    await log.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(jump).toBeVisible({ timeout: 5000 });

    await jump.click();
    await expect(jump).toBeHidden({ timeout: 5000 });
  });
});
