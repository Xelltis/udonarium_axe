import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('turning a line into a whisper afterwards', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  // Choosing whom to whisper to cannot be checked in E2E, where no second person can join; the unit
  // tests pin it down.
  test("says so in the more menu of one's own line when nobody else is there", async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('本当はノアにだけ言いたかった');
    await textarea.press('Enter');
    await expect(textarea).toHaveValue('');

    const line = page.locator('chat-tab chat-message').filter({ hasText: '本当はノアにだけ言いたかった' });
    await line.locator('.msg-text').hover();
    await line.getByTestId('chat-message-action-more').click();

    const menu = page.locator('context-menu');
    const nobody = menu.locator('li').filter({ hasText: 'あとから秘話にする（相手がいません）' });
    await expect(nobody).toHaveAttribute('aria-disabled', 'true');
  });
});
