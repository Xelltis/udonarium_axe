import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

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

    const picture = (await piece.locator('img.image').first().boundingBox())!;
    await page.mouse.move(picture.x + picture.width / 2, picture.y + picture.height / 2);
    await page.mouse.move(picture.x + picture.width / 2 + 2, picture.y + picture.height / 2 + 2);
    const toggle = page.getByTestId('overview-memo-toggle');
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await toggle.click();

    await expect(page.getByTestId('overview-memo')).toHaveValue('ロープ\n王都の通行証');
  });
});
