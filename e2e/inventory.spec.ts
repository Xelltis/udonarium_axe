import { expect, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

/** A row's middle is one of its fields, whose right-click is left to the browser, so menus are opened from its edge. */
const ROW_EDGE = { x: 6, y: 6 };

test.describe('the buttons on a row of the inventory', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
  });

  test('come into view on a pointer resting on the row without moving anything in it', async ({ page }) => {
    const row = page.locator('game-object-inventory [data-testid="inventory-item"]').first();
    await expect(row).toBeVisible({ timeout: 5000 });
    const field = row.locator('input').last();
    await page.mouse.move(0, 0);
    await row.evaluate((el) =>
      Promise.all((el.closest('.draggable-panel')?.getAnimations() ?? []).map((animation) => animation.finished))
    );
    const before = await field.boundingBox();

    await row.hover({ position: ROW_EDGE });
    await expect(row.getByTitle('メニュー')).toBeVisible();
    expect(await field.boundingBox()).toEqual(before);

    await row.click({ position: ROW_EDGE });
    await page.mouse.move(0, 0);
    await expect(row.getByTitle('メニュー')).toBeVisible();
    expect(await field.boundingBox()).toEqual(before);
  });
});
