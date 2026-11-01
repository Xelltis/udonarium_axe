import { expect, Page, test } from '@playwright/test';

import { openPanel, revealMenuEntry, waitAppReady } from './helpers';
import { piece } from './see-through-helpers';

/** A piece put into stealth stays on the game master's table, marked, and goes from everyone else's. */
test.describe('a piece in stealth', () => {
  async function setRole(page: Page, role: 'GM' | 'PL') {
    const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await connection.getByText('接続情報', { exact: true }).click({ position: { x: 8, y: 6 } });
    await connection.getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) }).click();
  }

  test("leaves a player's table and inventory, and stays marked on the game master's", async ({ page }) => {
    await waitAppReady(page);
    await setRole(page, 'GM');
    const lurker = piece(page, 'キャラクターA');
    await expect(lurker.getByTestId('piece-name')).toBeVisible({ timeout: 10000 });

    await lurker.dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, menu, 'ステルス（GMと持ち主・仲間にだけ見える）')).click();

    await expect(lurker.getByTestId('stealth-mark')).toBeAttached({ timeout: 5000 });
    await openPanel(page, 'インベントリ');
    const row = page
      .locator('game-object-inventory [data-testid="inventory-item"]')
      .filter({ hasText: 'キャラクターA' });
    await expect(row).toHaveCount(1, { timeout: 5000 });
    await expect(row.getByTestId('inventory-stealth-mark')).toBeVisible();

    await setRole(page, 'PL');

    await expect(lurker.getByTestId('piece-name')).toBeHidden({ timeout: 5000 });
    await expect(row).toHaveCount(0);
  });
});
