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
