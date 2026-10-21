import { expect, Locator, Page, test } from '@playwright/test';

import { createCharacter, waitAppReady } from './helpers';

function newCharacterPiece(page: Page) {
  return page.locator('game-character').filter({ hasText: '新しいキャラクター' }).first();
}

async function openSheet(page: Page) {
  await newCharacterPiece(page).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('詳細を表示').click();
  const sheet = page.locator('game-character-sheet');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  return sheet;
}

function resourceRows(sheet: Locator, page: Page) {
  return sheet
    .locator('game-data-element, [game-data-element]')
    .filter({ has: page.locator('input[name="data-current-value"]') })
    .filter({ hasNot: page.locator('game-data-element, [game-data-element]') });
}

test.describe('a resource set to go over its maximum', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
  });

  test('stops at its maximum until set to go over it, and then keeps what is typed above it', async ({ page }) => {
    const sheet = await openSheet(page);
    await sheet.locator('button[title="編集"]').first().dispatchEvent('click');
    const row = resourceRows(sheet, page).first();
    const current = row.locator('input[name="data-current-value"]');
    const most = Number(await row.locator('input[name="data-value"]').first().inputValue());

    await current.fill(String(most + 50));
    await current.blur();
    await expect(current).toHaveValue(String(most));

    await row.locator('button[title="詳細設定"]').first().dispatchEvent('click');
    await row.locator('input[name="data-over-resource"]').check();
    await current.fill(String(most + 50));
    await current.blur();

    await expect(current).toHaveValue(String(most + 50));
    await expect(newCharacterPiece(page).locator('[data-testid="piece-gauge"]').first()).toContainText(
      `${most + 50}/${most}`
    );
  });
});
