import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, revealMenuEntry, waitAppReady } from './helpers';

async function reopenCharacterMenu(page: Page) {
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe("switching a character's flags", () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
  });

  test('checks the menu entry once "hide from inventory" is turned on', async ({ page }) => {
    // context-menu strips the ☐/☑ at the start of action.name from the span and draws
    // input[type=checkbox][checked?] instead. The state after the toggle is told by the checkbox in
    // the li being checked.
    const menu = await reopenCharacterMenu(page);
    await revealMenuEntry(page, menu, 'インベントリ非表示');
    await menu.locator('li', { hasText: 'インベントリ非表示' }).click();
    const menuAfter = await reopenCharacterMenu(page);
    await revealMenuEntry(page, menuAfter, 'インベントリ非表示');
    await expect(
      menuAfter.locator('li', { hasText: 'インベントリ非表示' }).locator('input[type="checkbox"]')
    ).toBeChecked();
  });

  test('checks the menu entry once "do not speak" is turned on', async ({ page }) => {
    const menu = await reopenCharacterMenu(page);
    await revealMenuEntry(page, menu, '発言しない');
    await menu.locator('li', { hasText: '発言しない' }).click();
    const menuAfter = await reopenCharacterMenu(page);
    await revealMenuEntry(page, menuAfter, '発言しない');
    await expect(menuAfter.locator('li', { hasText: '発言しない' }).locator('input[type="checkbox"]')).toBeChecked();
  });

  test('dims a character in the inventory once "hide from inventory" is on', async ({ page }) => {
    const menu = await reopenCharacterMenu(page);
    await revealMenuEntry(page, menu, 'インベントリ非表示');
    await menu.locator('li', { hasText: 'インベントリ非表示' }).click();
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    // A hidden character gets opacity-50, and stays in the DOM.
    const items = page.locator('game-object-inventory [data-testid="inventory-item"]');
    const hidden = items.filter({ has: page.locator('.opacity-50, [class*="opacity-50"]') });
    await expect(hidden.first()).toBeAttached({ timeout: 5000 });
  });

  test('offers "unlock" in the next menu once "lock" is chosen', async ({ page }) => {
    const menu = await reopenCharacterMenu(page);
    // A character is unlocked by default, so the lock entry shows.
    await menu.getByText('固定する').click();
    const menuAfter = await reopenCharacterMenu(page);
    await expect(menuAfter.getByText('固定解除')).toBeVisible();
  });
});
