import { expect, Locator, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';
import { row, sectionCard } from './mobile/sheet-helpers';

/** Opens キャラクターB's sheet on a wide screen, from the menu of the piece. */
async function openSheet(page: Page): Promise<Locator> {
  await waitAppReady(page);
  const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
  await piece.dispatchEvent('contextmenu');
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
});
