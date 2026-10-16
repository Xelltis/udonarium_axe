import { expect, Locator, Page, test } from '@playwright/test';

import { openCharacterSheet, row, sectionCard } from './sheet-helpers';

async function editSection(page: Page, name: string): Promise<{ sheet: Locator; card: Locator }> {
  const sheet = await openCharacterSheet(page);
  const card = sectionCard(sheet, name);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'edit', exact: true }).tap();
  await expect(card.getByRole('button', { name: 'edit_off', exact: true })).toBeVisible();
  return { sheet, card };
}

async function closeSheet(page: Page): Promise<void> {
  await page.getByTestId('bottom-sheet-close').tap();
  await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
}

test.describe('rearranging a character sheet on a phone', () => {
  test('shows only the name, the value and "⋯" on a row being edited, so no buttons beside them run off the screen', async ({
    page,
  }) => {
    const { card } = await editSection(page, 'リソース');
    const hp = row(card, 'HP');

    await expect(hp.getByTestId('row-more')).toBeVisible();
    await expect(hp.locator('.elm-row-actions')).toBeHidden();
    const panelRight = await page.evaluate(() => document.documentElement.clientWidth);
    expect((await hp.getByTestId('row-more').boundingBox())!.x).toBeLessThan(panelRight);
  });

  test('adds an item from "+ add item" by choosing its type and giving it a name', async ({ page }) => {
    const { card } = await editSection(page, 'リソース');

    await card.getByTestId('group-add-field').first().tap();
    await page.getByTestId('add-field').locator('[role="radio"][data-type="number"]').tap();
    const name = page.getByTestId('field-editor-name');
    await expect(name).toBeFocused();
    await name.fill('防御');
    await name.press('Enter');
    await closeSheet(page);

    await expect(row(card, '防御')).toBeVisible();
    await expect(row(card, '防御').locator('input[type="number"][name="data-value"]')).toHaveCount(1);
  });

  test('turns the row into a checkbox when its type is changed to check from "⋯"', async ({ page }) => {
    const { card } = await editSection(page, 'プロフィール');
    const memo = row(card, '名前メモ');

    await memo.getByTestId('row-more').tap();
    await page.getByTestId('field-editor').locator('[role="radio"][data-type="check"]').tap();
    await closeSheet(page);

    await expect(memo.locator('.elm-value-content input[type="checkbox"]')).toHaveCount(1);
  });

  test('brings a deleted item back from the notice', async ({ page }) => {
    const { card } = await editSection(page, 'リソース');

    await row(card, 'MP').getByTestId('row-more').tap();
    await page.getByTestId('field-editor-delete').tap();
    await expect(row(card, 'MP')).toHaveCount(0);
    await expect(page.getByTestId('snackbar')).toContainText('MP');

    await page.getByTestId('snackbar-action').tap();

    await expect(row(card, 'MP')).toBeVisible();
    await expect(row(card, 'MP').locator('input[name="data-value"]')).toHaveValue('80');
  });

  test('moves an item up one place with ▲ on the edit sheet', async ({ page }) => {
    const { card } = await editSection(page, 'リソース');

    await row(card, 'MP').getByTestId('row-more').tap();
    await page.getByTestId('field-editor-moveUp').tap();
    await closeSheet(page);

    const names = await card.locator('[data-testid="row-name-button"]').allTextContents();
    expect(names.map((name) => name.trim()).slice(0, 2)).toEqual(['MP', 'HP']);
  });

  test('reorders items as the handle is moved with a finger', async ({ page }) => {
    const { card } = await editSection(page, '能力');
    const handle = row(card, '器用度').locator('.elm-drag-handle');
    const box = (await handle.boundingBox())!;
    const height = (await row(card, '器用度').boundingBox())!.height;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const pointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true };

    await handle.dispatchEvent('pointerdown', { ...pointer, clientX: x, clientY: y });
    for (let step = 1; step <= 10; step++) {
      await handle.dispatchEvent('pointermove', { ...pointer, clientX: x, clientY: y + (height * 2.2 * step) / 10 });
    }
    await handle.dispatchEvent('pointerup', { ...pointer, clientX: x, clientY: y + height * 2.2 });

    const names = await card.locator('[data-testid="row-name-button"]').allTextContents();
    expect(names.map((name) => name.trim()).slice(0, 3)).toEqual(['敏捷度', '筋力', '器用度']);
  });
});
