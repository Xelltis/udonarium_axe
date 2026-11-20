import { expect, Locator, Page, test } from '@playwright/test';

import { rightClickPiece, waitAppReady } from './helpers';
import { row, sectionCard } from './mobile/sheet-helpers';

/** Opens キャラクターB's sheet on a wide screen, from the menu of the piece. */
async function openSheet(page: Page): Promise<Locator> {
  await waitAppReady(page);
  const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
  await rightClickPiece(piece);
  await page.locator('context-menu').getByText('詳細を表示').click();
  const sheet = page.locator('game-character-sheet');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  return sheet;
}

/** Picks the kind of the item to add, names it and lets the editor go. */
async function addNamed(page: Page, type: string, name: string): Promise<void> {
  await page.getByTestId('add-field').locator(`[role="radio"][data-type="${type}"]`).click();
  const field = page.getByTestId('field-editor-name');
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press('Enter');
  await page.getByTestId('bottom-sheet-close').click();
  await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
}

test.describe('adding to a character sheet on a wide screen', () => {
  test('adds an item to a group from the "+" on its heading while the sheet is read, and from the end of the group while it is edited', async ({
    page,
  }) => {
    const sheet = await openSheet(page);
    const card = sectionCard(sheet, 'リソース');
    await card.scrollIntoViewIfNeeded();

    await card.getByTestId('group-add-field-in-view').first().click();
    await expect(page.getByTestId('add-field').getByTestId('add-field-sample').first()).toBeVisible();
    await addNamed(page, 'number', '防御');

    await expect(row(card, '防御')).toBeVisible();
    await card.getByRole('button', { name: 'edit', exact: true }).click();

    await expect(card.getByTestId('group-add-field')).toHaveCount(1);
    await expect(card.getByTestId('group-add-field')).toBeVisible();
    await expect(card.getByTestId('group-add-group')).toHaveCount(1);
    await expect(card.getByTestId('group-add-group')).toBeVisible();
    await expect(row(card, 'HP').getByRole('button', { name: '詳細設定', exact: true })).toBeVisible();

    await card.getByTestId('group-add-field').click();
    await addNamed(page, 'check', '気絶');
    await expect(row(card, '気絶').locator('.elm-value-content input[type="checkbox"]')).toHaveCount(1);
  });
  test('builds a check table in the table builder, then renames a column and adds a row on the table itself', async ({
    page,
  }) => {
    const sheet = await openSheet(page);
    const card = sectionCard(sheet, 'リソース');
    await card.scrollIntoViewIfNeeded();
    const edit = card.getByRole('button', { name: 'edit', exact: true });
    await edit.click();

    await card.getByRole('button', { name: '表を追加', exact: true }).first().click();
    const builder = page.getByTestId('table-builder');
    await expect(builder.getByTestId('table-builder-row')).toHaveCount(3);
    await builder.getByTestId('table-builder-column').first().getByRole('textbox', { name: '名前' }).fill('技巧');
    await builder.getByTestId('table-builder-apply').click();
    await expect(builder).toHaveCount(0);

    const table = card.locator('game-data-element-table-view').last();
    const columns = table.getByTestId('table-edit-column-button');
    await expect(columns).toHaveCount(2);
    await expect(columns.first()).toContainText('技巧');
    await expect(table.getByTestId('table-edit-row-button')).toHaveCount(3);

    await columns.nth(1).click();
    const name = table.getByTestId('table-edit-column-name');
    await name.fill('隠密');
    await name.press('Tab');
    await expect(columns.nth(1)).toContainText('隠密');

    await table.getByTestId('table-add-row').click();
    await expect(table.getByTestId('table-edit-row-button')).toHaveCount(4);

    await card.getByRole('button', { name: 'edit_off', exact: true }).click();
    const box = table.locator('tbody input[type="checkbox"]').first();
    await box.check();
    await expect(box).toBeChecked();
    await expect(table.getByTestId('table-edit-columns')).toHaveCount(0);
  });
});
