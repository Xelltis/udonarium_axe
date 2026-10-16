import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, revealMenuEntry, waitAppReady } from './helpers';

async function openInventory(page: Page) {
  await waitAppReady(page);
  await openPanel(page, 'インベントリ');
  await expect(page.locator('game-object-inventory')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
}

test.describe('the inventory panel', () => {
  test.beforeEach(async ({ page }) => {
    await openInventory(page);
  });

  test('shows the four tabs: table, shared, personal and graveyard', async ({ page }) => {
    const tabs = page.locator('game-object-inventory input[name="tab"]');
    await expect(tabs).toHaveCount(4);
  });

  test('switches between the tabs', async ({ page }) => {
    // The radios are display:none through [&_input[type=radio]]:hidden, so the labels themselves are clicked.
    const labels = page.locator('game-object-inventory form[name="game-object-inventory"] > label');
    const tabs = page.locator('game-object-inventory input[name="tab"]');
    await labels.nth(1).click();
    await expect(tabs.nth(1)).toBeChecked();
    await labels.nth(3).click();
    await expect(tabs.nth(3)).toBeChecked();
  });

  test('shows the "empty the graveyard" button on the graveyard tab', async ({ page }) => {
    const graveyardLabel = page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(3);
    await graveyardLabel.click();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /墓場を空にする/ })).toBeVisible();
  });

  test('has a display settings button', async ({ page }) => {
    await expect(page.locator('game-object-inventory button[title="表示設定"]')).toBeVisible();
  });

  test('has a move-multiple button', async ({ page }) => {
    await expect(page.locator('game-object-inventory button[title="一括移動"]')).toBeVisible();
  });

  test('opens the display settings, where the order and tags can be set', async ({ page }) => {
    // The order and tag settings have moved to a panel of their own.
    const settingsButton = page.locator('game-object-inventory button[title="表示設定"]');
    await settingsButton.click();
    const panel = page.locator('inventory-filter-panel');
    await expect(panel.locator('input[placeholder="タグ名"]').first()).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('select').first()).toBeVisible();
    // Two fields for what is shown sit side by side, one for the table and one for the inventory. The examples
    // of how to fill them in keep growing, so the fields are found by name rather than by wording.
    await expect(panel.locator('input[name="data-tag"]')).toBeVisible();
    await expect(panel.locator('input[name="table-data-tag"]')).toBeVisible();

    // Pressing the display settings button again closes the panel.
    await settingsButton.click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe('the inventory context menu', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
  });

  test('shows a context menu on a right-click on an object in the inventory', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 3000 });
  });

  test('offers "show details" in the inventory context menu', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 3000 });
    await expect(menu.getByText('詳細を表示')).toBeVisible();
  });

  test('opens the sheet from "show details" in the inventory', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 3000 });
    await menu.getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 5000 });
  });

  test('offers the moves in the inventory context menu', async ({ page }) => {
    const objects = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await expect(objects.first()).toBeVisible({ timeout: 5000 });
    await objects.first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 3000 });
    // For an object on the table, "move to table" would leave it where it is, so it gets no entry. The
    // other three places to move to are shown.
    await expect(await revealMenuEntry(page, menu, '共有イベントリに移動')).toBeVisible();
    await expect(await revealMenuEntry(page, menu, '個人イベントリに移動')).toBeVisible();
    await expect(await revealMenuEntry(page, menu, '墓場に移動')).toBeVisible();
  });
});
