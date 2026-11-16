import { expect, Page, test } from '@playwright/test';

import { holdsFor, openPanel, waitAppReady } from './helpers';

/**
 * Putting a state on a piece plays the effect of the same name over it, once, where the room asked
 * for that, and plays nothing where it did not or as the state is taken off.
 */

type Hooks = { effectsCast(): number };

/** How many effects have been cast for the room to play since the table was put up. */
function effectsCast(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.effectsCast());
}

test.describe('the effect of a state as it is put on a piece', () => {
  test('plays once as the state is ticked on with the room asking for it, and never without or as it is taken off', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await openPanel(page, 'インベントリ');
    const inventory = page.locator('ui-panel').filter({ hasText: 'インベントリ' });
    await inventory.locator('button[title="リッチ表示"]').dispatchEvent('click');
    const row = page.locator('game-object-inventory [data-testid="inventory-table-row"]').first();
    await expect(row).toBeVisible({ timeout: 5000 });
    const asleep = row.locator('input[type="checkbox"][title="行動できない。攻撃を受けると起きる"]');
    await expect(asleep).toBeAttached();

    // The room has not asked: the state goes on and nothing is cast.
    await asleep.dispatchEvent('click');
    await expect(asleep).toBeChecked();
    await holdsFor(async () => expect(await effectsCast(page)).toBe(0), 600);
    await asleep.dispatchEvent('click');
    await expect(asleep).not.toBeChecked();

    await openPanel(page, '状態異常');
    const asks = page.getByTestId('status-ailment-plant-effect');
    await expect(asks).not.toBeChecked();
    await asks.check();

    // Asked for: one effect is cast as the state goes on, and none as it comes off.
    await asleep.dispatchEvent('click');
    await expect(asleep).toBeChecked();
    await expect.poll(() => effectsCast(page)).toBe(1);
    await asleep.dispatchEvent('click');
    await expect(asleep).not.toBeChecked();
    await holdsFor(async () => expect(await effectsCast(page)).toBe(1), 600);
  });
});
