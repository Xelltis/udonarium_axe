import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** The game master can clear buffs off the whole table at once, from the buff manager or from chat. */
test.describe('clearing a buff off the whole table', () => {
  async function setRole(page: Page, role: 'GM' | 'PL') {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) })
      .click();
  }

  async function send(page: Page, text: string) {
    await page.locator('textarea.chat-input').fill(text);
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
  }

  const nameChoices = (page: Page) => page.locator('[data-testid="buff-sweep-name-value"] option');

  test('lets the GM clear buffs of one name off the whole table, from the buff manager and with && in the chat', async ({
    page,
  }) => {
    await waitAppReady(page);
    await setRole(page, 'GM');
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
    await openPanel(page, 'バフマネージャー');
    const panel = page.locator('app-buff-manager-panel');
    await panel.locator('[data-testid="buff-sweep"] summary').click();
    await panel.getByTestId('buff-sweep-name').check();
    await expect(nameChoices(page).first()).toBeAttached();
    const names = await nameChoices(page).allTextContents();
    expect(names.length).toBeGreaterThan(1);
    const [first, second] = names.map((name) => name.trim());

    // The chat shows its tutorial until the first message, so the && line is sent first.
    await send(page, `&&${first}-`);
    await expect(page.locator('chat-message').filter({ hasText: `卓全体から「${first}」を解除` })).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(nameChoices(page).filter({ hasText: first })).toHaveCount(0);

    await panel.getByTestId('buff-sweep-name-value').selectOption({ label: second });
    // The window of the chat just sent comes to the front over the button, so the click is sent to
    // it directly.
    await panel.getByTestId('buff-sweep-run').dispatchEvent('click');
    await page.locator('confirm-dialog').getByRole('button', { name: 'OK' }).click();
    await expect(page.locator('chat-message').filter({ hasText: `卓全体から「${second}」を解除しました` })).toHaveCount(
      1,
      { timeout: 5000 }
    );
    await expect(nameChoices(page).filter({ hasText: second })).toHaveCount(0);
  });

  test('clears nothing with && in the chat unless the sender is the GM, and says so', async ({ page }) => {
    await waitAppReady(page);
    await setRole(page, 'PL');
    await send(page, '&&none-');
    await expect(page.locator('chat-message').filter({ hasText: 'バフの一括解除はGMだけが使えます' })).toHaveCount(1, {
      timeout: 10000,
    });
  });
});
