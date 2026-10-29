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

  test('keeps the selects in one row on a phone and the edit buttons along the top of the box', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
    const closeStartupPanel = page.locator('ui-panel .bg-ui-titlebar button').last();
    if (await closeStartupPanel.count()) await closeStartupPanel.click();
    const input = page.locator('app-mobile-chat-pane chat-input');
    await expect(input.locator('ng-select[name="send-from"]')).toBeVisible({ timeout: 20000 });
    await expect(input.locator('ng-select[name="game-type"]')).toBeVisible();
    await expect(input.getByRole('button', { name: '?' })).toBeVisible();
    const edits = input.getByTestId('chat-input-frame').getByTestId('chat-input-edits');
    await expect(edits.getByTestId('chat-input-color')).toBeVisible();
    await expect(edits.getByTestId('chat-toolbar-bold')).toBeVisible();
    const selects = (await input.getByTestId('chat-input-selects').boundingBox())!;
    const band = (await edits.boundingBox())!;
    const box = (await input.locator('[data-chat-input-box]').boundingBox())!;
    expect(selects.height).toBeLessThan(48);
    expect(band.height).toBeLessThan(84);
    expect(band.y).toBeGreaterThan(selects.y + selects.height);
    expect(Math.abs(band.x - box.x)).toBeLessThan(1);
  });
});
