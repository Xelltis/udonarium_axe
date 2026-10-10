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

test.describe('スマートフォンで組み替えるキャラクターシート', () => {
  test('編集中の行は名前と値と「⋯」だけで、横のボタンが画面の外へはみ出さないこと', async ({ page }) => {
    const { card } = await editSection(page, 'リソース');
    const hp = row(card, 'HP');

    await expect(hp.getByTestId('row-more')).toBeVisible();
    await expect(hp.locator('.elm-row-actions')).toBeHidden();
    const panelRight = await page.evaluate(() => document.documentElement.clientWidth);
    expect((await hp.getByTestId('row-more').boundingBox())!.x).toBeLessThan(panelRight);
  });

  test('「＋ 項目を追加」から種別を選び、名前を付けた項目が並ぶこと', async ({ page }) => {
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

  test('「⋯」から種別をチェックに変えると、行がチェックボックスになること', async ({ page }) => {
    const { card } = await editSection(page, 'プロフィール');
    const memo = row(card, '名前メモ');

    await memo.getByTestId('row-more').tap();
    await page.getByTestId('field-editor').locator('[role="radio"][data-type="check"]').tap();
    await closeSheet(page);

    await expect(memo.locator('.elm-value-content input[type="checkbox"]')).toHaveCount(1);
  });

  test('消した項目を通知から元に戻せること', async ({ page }) => {
    const { card } = await editSection(page, 'リソース');

    await row(card, 'MP').getByTestId('row-more').tap();
    await page.getByTestId('field-editor-delete').tap();
    await expect(row(card, 'MP')).toHaveCount(0);
    await expect(page.getByTestId('snackbar')).toContainText('MP');

    await page.getByTestId('snackbar-action').tap();

    await expect(row(card, 'MP')).toBeVisible();
    await expect(row(card, 'MP').locator('input[name="data-value"]')).toHaveValue('80');
  });

  test('編集シートの ▲ で項目を一つ上へ動かせること', async ({ page }) => {
    const { card } = await editSection(page, 'リソース');

    await row(card, 'MP').getByTestId('row-more').tap();
    await page.getByTestId('field-editor-moveUp').tap();
    await closeSheet(page);

    const names = await card.locator('[data-testid="row-name-button"]').allTextContents();
    expect(names.map((name) => name.trim()).slice(0, 2)).toEqual(['MP', 'HP']);
  });

  test('取っ手を指で動かして項目を並べ替えられること', async ({ page }) => {
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
