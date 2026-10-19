import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

async function openInventoryWithCharacter(page: Page) {
  await waitAppReady(page);
  await createCharacter(page);
  await openPanel(page, 'インベントリ');
  await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
}

test.describe('moving many inventory items at once (multi-move)', () => {
  test.beforeEach(async ({ page }) => {
    await openInventoryWithCharacter(page);
  });

  test('shows the multi-move bar when the move-multiple button is pressed', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    // The heading span at the left end of the multi-move bar. The material-icons ligature "open_with" is in
    // the same node's text, so the match is on a substring rather than anchored.
    await expect(
      page
        .locator('game-object-inventory')
        .getByText(/一括移動/)
        .first()
    ).toBeVisible({
      timeout: 5000,
    });
    // The three destination buttons: shared, personal and graveyard.
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /共有/ })).toBeVisible();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /個人/ })).toBeVisible();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /墓場/ })).toBeVisible();
  });

  test('toggles between "select all" and "deselect all"', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    const allSelect = page.locator('game-object-inventory').getByRole('button', { name: /全選択/ });
    await expect(allSelect).toBeVisible({ timeout: 5000 });
    await allSelect.click();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /全解除/ })).toBeVisible();
    await page
      .locator('game-object-inventory')
      .getByRole('button', { name: /全解除/ })
      .click();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /全選択/ })).toBeVisible();
  });

  test('hides the multi-move bar on leaving multi-move with "cancel"', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    const heading = page
      .locator('game-object-inventory')
      .getByText(/一括移動/)
      .first();
    await expect(heading).toBeVisible();
    await page
      .locator('game-object-inventory')
      .getByRole('button', { name: /キャンセル/ })
      .click();
    await expect(heading).toBeHidden();
  });

  test('moves the items to the shared tab, out of the table tab, on "select all" and then "shared"', async ({
    page,
  }) => {
    const items = page.locator('game-object-inventory [data-testid="inventory-item"]');
    const initialCount = await items.count();
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    await page
      .locator('game-object-inventory')
      .getByRole('button', { name: /全選択/ })
      .click();
    await page.locator('game-object-inventory').getByRole('button', { name: /共有/ }).click();
    await expect.poll(() => items.count(), { timeout: 5000 }).toBeLessThan(initialCount);
    // Switch to the shared tab.
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(1).click();
    await expect(items.first()).toBeVisible({ timeout: 5000 });
  });

  test('shows the "hide in inventory" and "show in inventory" buttons on the table tab', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    await expect(
      page.locator('game-object-inventory').getByRole('button', { name: /インベントリで非表示/ })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('game-object-inventory').getByRole('button', { name: /インベントリで表示/ })
    ).toBeVisible();
  });
});
