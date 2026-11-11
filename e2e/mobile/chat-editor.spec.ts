import { expect, test } from '@playwright/test';

import { chatInput, expectChatText } from '../helpers';

test.describe('the chat editor on a phone', () => {
  test('lays the speaker and whom it is said to in a row, the dice bot with the stamp and colour under them, and the box the width of the screen with the send button in it, writes at a size the phone does not zoom onto, and takes a line tapped in and sends it, kept to its share of the screen', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
    const closeStartupPanel = page.locator('ui-panel .bg-ui-titlebar button').last();
    if (await closeStartupPanel.count()) await closeStartupPanel.click();
    const pane = page.locator('app-mobile-chat-pane');
    await expect(pane.locator('[data-chat-input-mode="rich"]')).toBeVisible({ timeout: 20000 });

    const editor = pane.locator('chat-input');
    await expect(editor.locator('ng-select[name="send-from"]')).toBeVisible({ timeout: 20000 });
    await expect(editor.locator('ng-select[name="game-type"]')).toBeVisible();
    await expect(editor.getByRole('button', { name: '?' })).toBeVisible();
    await expect(editor.getByTestId('chat-input-avatar')).toBeVisible();
    await expect(editor.getByTestId('chat-input-line-tools').getByTestId('chat-input-color')).toBeVisible();
    const frame = editor.getByTestId('chat-input-frame');
    const edits = frame.getByTestId('chat-input-edits');
    await expect(edits.getByTestId('chat-toolbar-bold')).toBeVisible();
    const from = (await editor.locator('ng-select[name="send-from"]').boundingBox())!;
    const to = (await editor.locator('ng-select[name="send-to"]').boundingBox())!;
    const diceBot = (await editor.locator('ng-select[name="game-type"]').boundingBox())!;
    const selects = (await editor.getByTestId('chat-input-selects').boundingBox())!;
    const band = (await edits.boundingBox())!;
    const framed = (await frame.boundingBox())!;
    const send = (await frame.getByTestId('chat-input-send').boundingBox())!;
    const screen = page.viewportSize()!;
    expect(Math.abs(from.y - to.y)).toBeLessThan(1);
    expect(diceBot.y).toBeGreaterThan(from.y + from.height - 1);
    expect(band.height).toBeLessThan(84);
    expect(band.y).toBeGreaterThan(selects.y + selects.height);
    expect(framed.width).toBeGreaterThan(screen.width - 24);
    expect(send.x + send.width).toBeLessThanOrEqual(framed.x + framed.width + 1);

    const input = chatInput(pane);
    expect(await input.evaluate((box) => getComputedStyle(box).fontSize)).toBe('16px');
    const selectable = await page.evaluate(() => {
      const message = document.createElement('chat-message');
      const text = document.createElement('div');
      text.className = 'msg-text';
      const edited = document.createElement('div');
      edited.contentEditable = 'true';
      text.append(edited);
      message.append(text);
      document.body.append(message);
      const style = getComputedStyle(edited);
      const value = style.userSelect || style.getPropertyValue('-webkit-user-select');
      message.remove();
      return { value, touch: document.body.classList.contains('touch-input') };
    });
    expect(selectable).toEqual({ value: 'text', touch: true });

    await input.tap();
    await page.keyboard.type('スマホから **強く**');
    await expectChatText(input, 'スマホから **強く**');

    const box = await pane.locator('[data-chat-input-box]').boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.height).toBeLessThanOrEqual(viewport.height * 0.22 + 1);

    await page.keyboard.press('Enter');
    await expectChatText(input, '');
    await expect(pane.locator('chat-tab').getByText('スマホから')).toBeVisible({ timeout: 5000 });
  });
});
