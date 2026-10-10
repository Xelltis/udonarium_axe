import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

async function reopenCharacterMenu(page: Page) {
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('キャラクターのフラグ切替', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
  });

  test('「インベントリ非表示」を ON にした後、メニュー項目のチェックが checked に変わること', async ({ page }) => {
    // context-menuはaction.name先頭の☐/☑をspanからstripし、代わりに
    // input[type=checkbox][checked?]を描画する。トグル後の状態は、li内のチェック
    // ボックスがcheckedになっていることで確認する。
    const menu = await reopenCharacterMenu(page);
    await menu.locator('li', { hasText: 'インベントリ非表示' }).click();
    const menuAfter = await reopenCharacterMenu(page);
    await expect(
      menuAfter.locator('li', { hasText: 'インベントリ非表示' }).locator('input[type="checkbox"]')
    ).toBeChecked();
  });

  test('「発言しない」を ON にした後、メニュー項目のチェックが checked に変わること', async ({ page }) => {
    const menu = await reopenCharacterMenu(page);
    await menu.locator('li', { hasText: '発言しない' }).click();
    const menuAfter = await reopenCharacterMenu(page);
    await expect(menuAfter.locator('li', { hasText: '発言しない' }).locator('input[type="checkbox"]')).toBeChecked();
  });

  test('「インベントリ非表示」ON のキャラはインベントリでオパシティ低下表示になること', async ({ page }) => {
    const menu = await reopenCharacterMenu(page);
    await menu.locator('li', { hasText: 'インベントリ非表示' }).click();
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    // 非表示キャラはopacity-50が付与される（DOM上には残っている）。
    const items = page.locator('game-object-inventory [data-testid="inventory-item"]');
    const hidden = items.filter({ has: page.locator('.opacity-50, [class*="opacity-50"]') });
    await expect(hidden.first()).toBeAttached({ timeout: 5000 });
  });

  test('「固定する」を選ぶと次回メニューに「固定解除」が出ること', async ({ page }) => {
    const menu = await reopenCharacterMenu(page);
    // 既定は未固定なので「固定する」が表示される。
    await menu.getByText('固定する').click();
    const menuAfter = await reopenCharacterMenu(page);
    await expect(menuAfter.getByText('固定解除')).toBeVisible();
  });
});
