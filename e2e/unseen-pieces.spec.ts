import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * A player's lists name only what the table draws for them. With the dark down, the pieces it
 * keeps back leave the inventory too, rather than being named there for anyone to read.
 */
test.describe('見えていないコマを一覧に出さない', () => {
  async function setRole(page: Page, role: 'GM' | 'PL') {
    const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await connection.getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) }).click();
  }

  /** How many pieces are on the table, and how many of them the table draws. */
  const pieces = (page: Page) =>
    page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('game-character'));
      return { all: all.length, drawn: all.filter((piece) => getComputedStyle(piece).display !== 'none').length };
    });

  const listed = (page: Page) =>
    page
      .locator('game-object-inventory')
      .locator('[data-testid="inventory-item"], [data-testid="inventory-table-row"]');

  test('暗闇でプレイヤーに見えないコマは、インベントリのテーブルに並ばないこと', async ({ page }) => {
    await waitAppReady(page);
    await setRole(page, 'GM');
    const darkness = page.locator('app-gm-toolbar [title^="暗闇"]');
    await expect(darkness).toBeVisible({ timeout: 10000 });
    await openPanel(page, 'インベントリ');
    await expect(listed(page).first()).toBeVisible({ timeout: 10000 });
    const before = await pieces(page);
    await expect(listed(page)).toHaveCount(before.all);

    await darkness.click();
    await setRole(page, 'PL');

    await expect.poll(async () => (await pieces(page)).drawn, { timeout: 10000 }).toBeLessThan(before.all);
    const after = await pieces(page);
    await expect(listed(page)).toHaveCount(after.drawn);
  });
});
