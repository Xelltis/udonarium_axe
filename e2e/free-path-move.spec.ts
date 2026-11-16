import { expect, test } from '@playwright/test';

import { becomeGm, closePanels, createCharacter, openPanel, rightClickPiece, waitAppReady } from './helpers';
import { centreOf, pedestal, piece, placeOf } from './see-through-helpers';

/** Waits for a piece to stand still, read from where it stands rather than from a picture it may not have. */
async function standStill(of: ReturnType<typeof piece>) {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await placeOf(of);
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [250] }
    )
    .toBe(true);
}

test.describe('moving along a polyline on a table without a grid', () => {
  test('once turned on in the room settings, plans a move as a polyline and walks to where it was drawn to', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, 'テーブル設定');
    await page.locator('select[name="tableGridType"]').selectOption('-1');
    await openPanel(page, '部屋設定');
    await page.getByTestId('room-settings-tab-move').click();
    const pathMove = page.locator('room-settings-panel input[name="pathMove"]');
    await pathMove.check();
    await expect(pathMove).toBeChecked();
    await closePanels(page);
    await createCharacter(page);

    const walker = piece(page, '新しいキャラクター');
    await standStill(walker);
    const before = await placeOf(walker);
    await rightClickPiece(walker);
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('移動', { exact: true }).click();

    await expect(page.getByTestId('free-path-reach')).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('move-plan-walk')).toHaveCount(0);

    const from = await centreOf(pedestal(walker));
    const to = { x: from.x + 90, y: from.y + 40 };
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await expect(page.getByTestId('free-path-ahead')).toBeAttached({ timeout: 5000 });
    await page.mouse.click(to.x, to.y);

    await expect(page.getByTestId('free-path-overlay')).toHaveCount(0, { timeout: 10000 });
    await standStill(walker);
    expect(await placeOf(walker)).not.toBe(before);
  });
});
