import { expect, Page, test } from '@playwright/test';

import { createCharacter, openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function reopenCharacterMenu(page: Page) {
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('setting an object’s altitude (altitudeHande)', () => {
  test('builds the altitude slider UI into a character’s altitude submenu', async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    const menu = await reopenCharacterMenu(page);
    await (await revealMenuEntry(page, menu, '高度設定')).hover();
    // Opening the submenu tied to altitudeHande makes the context menu show a vertical range slider
    // (name="altitude") and a number input (name="altitude-number").
    await expect(page.locator('context-menu input[name="altitude"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('context-menu input[name="altitude-number"]')).toBeVisible();
  });

  test('shows the altitude slider for terrain in the same way', async ({ page }) => {
    await waitAppReady(page);
    const tableMenu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, tableMenu, '地形を作成')).click();
    await expect(page.locator('terrain').first()).toBeAttached({ timeout: 10000 });
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, page.locator('context-menu'), '高度設定')).hover();
    await expect(page.locator('context-menu input[name="altitude"]')).toBeVisible({ timeout: 5000 });
  });

  test('has the altitude UI in the text-note’s altitude submenu too', async ({ page }) => {
    await waitAppReady(page);
    const tableMenu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, tableMenu, '共有メモを作成')).click();
    await expect(page.locator('text-note').first()).toBeAttached({ timeout: 10000 });
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, page.locator('context-menu'), '高度設定')).hover();
    await expect(page.locator('context-menu input[name="altitude-number"]')).toBeVisible({ timeout: 5000 });
  });
});
