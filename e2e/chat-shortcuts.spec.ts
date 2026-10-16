import { expect, test } from '@playwright/test';

import { chatTabPill, waitAppReady } from './helpers';

test.describe('keyboard shortcuts of the chat input', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('sends the message on Enter', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('Enterで送信');
    await textarea.press('Enter');
    // A message sent clears the textarea.
    await expect(textarea).toHaveValue('');
    await expect(page.locator('chat-tab').getByText('Enterで送信')).toBeVisible({ timeout: 5000 });
  });

  test('makes a new line on Shift+Enter, sending nothing', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('1行目');
    await textarea.press('Shift+Enter');
    await textarea.type('2行目');
    // The value still holds the line break, so nothing was sent.
    await expect(textarea).toHaveValue('1行目\n2行目');
  });

  test('switches to the tab on the right on Ctrl+→', async ({ page }) => {
    // The main tab (index=0) is active by default, and the sub tab is index=1.
    const textarea = page.locator('textarea.chat-input');
    await textarea.focus();
    await textarea.press('Control+ArrowRight');
    const subTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(1);
    await expect(subTabRadio).toBeChecked();
  });

  test('goes back to the main tab on Ctrl+←', async ({ page }) => {
    // Switches to the sub tab through its pill first, then goes back with ←.
    await chatTabPill(page, 'サブタブ').click();
    const subTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(1);
    await expect(subTabRadio).toBeChecked();

    // Right after the pill is pressed, the focus is on its radio. With focus() alone the key can go
    // off before the focus is fully back in the input, and the test moves on with no switch made.
    const textarea = page.locator('textarea.chat-input');
    await textarea.click();
    await expect(textarea).toBeFocused();
    await textarea.press('Control+ArrowLeft');

    const mainTabRadio = page.locator('chat-window input[name^="chat-tab"]').nth(0);
    await expect(mainTabRadio).toBeChecked();
  });
});
