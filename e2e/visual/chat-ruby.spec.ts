import { expect, Page, test } from '@playwright/test';

import { openChatSettingsMenuItem } from '../helpers';
import { prepare } from './fixtures';

async function say(page: Page, line: string) {
  const textarea = page.locator('textarea.chat-input');
  await textarea.fill(line);
  await textarea.press('Enter');
  await expect(textarea).toHaveValue('');
}

test('ruby laid out 1:2:1, together in the middle and from the first letter', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => document.documentElement.style.setProperty('--chat-font-size', '24px'));
  await say(page, '|一二三四五《あい》と|漢字《かん|じ》と|日《にちようび》');
  const message = page.locator('chat-tab chat-message').filter({ hasText: '一二三四五' }).locator('.msg-text');
  await expect(message).toBeVisible();
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-even.png', { maxDiffPixels: 4 });

  await openChatSettingsMenuItem(page, 'チャット設定');
  await page.locator('chat-message-setting select[name="ruby-spacing"]').selectOption('tight');
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-tight.png', { maxDiffPixels: 4 });

  await page.locator('chat-message-setting select[name="ruby-align"]').selectOption('start');
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-start.png', { maxDiffPixels: 4 });
});
