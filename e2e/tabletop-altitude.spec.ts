import { expect, Page, test } from '@playwright/test';

import { createCharacter, openTableContextMenu, waitAppReady } from './helpers';

async function reopenCharacterMenu(page: Page) {
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('オブジェクトの高度設定 (altitudeHande)', () => {
  test('キャラクターの高度設定サブメニューに altitude スライダー UI が組み込まれていること', async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    const menu = await reopenCharacterMenu(page);
    await menu.getByText('高度設定').hover();
    // altitudeHandeが紐付いたサブメニューを開くと、コンテキストメニュー側で
    // 縦方向のrangeスライダー（name="altitude"）と数値入力（name="altitude-number"）が現れる。
    await expect(page.locator('context-menu input[name="altitude"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('context-menu input[name="altitude-number"]')).toBeVisible();
  });

  test('terrain でも同様に高度設定スライダーが現れること', async ({ page }) => {
    await waitAppReady(page);
    const tableMenu = await openTableContextMenu(page);
    await tableMenu.getByText('地形を作成').click();
    await expect(page.locator('terrain').first()).toBeAttached({ timeout: 10000 });
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('高度設定').hover();
    await expect(page.locator('context-menu input[name="altitude"]')).toBeVisible({ timeout: 5000 });
  });

  test('text-note の高度設定サブメニューにも altitude UI が居ること', async ({ page }) => {
    await waitAppReady(page);
    const tableMenu = await openTableContextMenu(page);
    await tableMenu.getByText('共有メモを作成').click();
    await expect(page.locator('text-note').first()).toBeAttached({ timeout: 10000 });
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('高度設定').hover();
    await expect(page.locator('context-menu input[name="altitude-number"]')).toBeVisible({ timeout: 5000 });
  });
});
