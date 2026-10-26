import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

test.describe('holding a turn and stepping in', () => {
  test('holds the piece whose turn it is, marks it, and steps it in from its row', async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'インベントリ');
    const inventory = page.locator('game-object-inventory');
    const next = inventory.getByRole('button', { name: /次へ/ });
    const hold = inventory.getByTestId('turn-hold');
    const held = inventory.getByTestId('inventory-turn-held');
    await expect(hold).toBeDisabled();

    await next.click();
    await next.click();
    await expect(hold).toBeEnabled();
    await hold.click();

    await expect(held).toHaveCount(1);
    const row = inventory.locator('[data-testid="inventory-item"]:has([data-testid="inventory-turn-held"])');
    await row.hover();
    await row.getByRole('button', { name: '割り込む' }).click();

    await expect(held).toHaveCount(0);
    await expect(page.locator('chat-message').last()).toContainText('割り込んで行動します');
  });
});
