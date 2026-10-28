import { expect, test } from '@playwright/test';

import { chatInput, expectChatText } from '../helpers';

test.describe('the chat editor on a phone', () => {
  test('takes a line tapped in and sends it, kept to its share of the screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
    const closeStartupPanel = page.locator('ui-panel .bg-ui-titlebar button').last();
    if (await closeStartupPanel.count()) await closeStartupPanel.click();
    const pane = page.locator('app-mobile-chat-pane');
    await expect(pane.locator('[data-chat-input-mode="rich"]')).toBeVisible({ timeout: 20000 });

    const input = chatInput(pane);
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
