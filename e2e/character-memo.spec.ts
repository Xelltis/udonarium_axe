import { expect, test } from '@playwright/test';

import { spotOnPiece, waitAppReady } from './helpers';

/** The memo kept with a piece: written from its right-click menu, read on the card that opens on it. */
test.describe('the memo kept with a piece', () => {
  test('is written from the menu, and shown on the card in place of the status once switched to', async ({ page }) => {
    await waitAppReady(page);
    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
    await piece.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('メモ', { exact: true }).click();

    const memo = page.getByTestId('character-memo-text');
    await expect(memo).toBeVisible({ timeout: 10000 });
    await memo.fill('ロープ\n王都の通行証');
    await page
      .locator('ui-panel', { has: memo })
      .locator('button:has(i:text-is("close"))')
      .last()
      .dispatchEvent('click');
    await expect(memo).toHaveCount(0);

    const over = await spotOnPiece(piece);
    await page.mouse.move(over.x, over.y);
    await page.mouse.move(over.x + 2, over.y + 2);
    const toggle = page.getByTestId('overview-memo-toggle');
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await toggle.click();

    await expect(page.getByTestId('overview-memo')).toHaveValue('ロープ\n王都の通行証');
  });
});
