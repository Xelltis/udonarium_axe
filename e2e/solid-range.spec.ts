import { expect, Page, test } from '@playwright/test';

import { idle, openTableContextMenu, putAwayTutorial, revealMenuEntry, rightClickPiece, waitAppReady } from './helpers';

function piece(page: Page, name: string) {
  return page.locator('game-character', { has: page.getByText(name, { exact: true }) });
}

async function closeMenu(page: Page) {
  await page.locator('#app-table-layer').dispatchEvent('mousedown');
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

/** Lifts a piece off the ground from its menu, by so many cells. */
async function raise(page: Page, name: string, cells: number) {
  await rightClickPiece(piece(page, name));
  const menu = page.locator('context-menu');
  await (await revealMenuEntry(page, menu, '高度設定')).hover();
  const altitude = menu.locator('input[name="altitude-number"]');
  await altitude.click();
  await altitude.press('Control+a');
  await altitude.pressSequentially(String(cells));
  await closeMenu(page);
}

test.describe('a range standing up off the table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
  });

  test('follows a piece as a cylinder round it, aiming at a piece on the ground within it and not at one flying over it', async ({
    page,
  }) => {
    await raise(page, 'モンスターB', 4);
    await idle(page);

    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '立体射程を作成')).hover();
    await menu.getByText('円柱', { exact: true }).click();
    const range = page.locator('range');
    await expect(range).toHaveCount(1, { timeout: 10000 });
    await idle(page);

    // The cylinder is three cells round モンスターA, and モンスターB stands two cells from it.
    await rightClickPiece(range);
    await page.locator('context-menu').getByText('キャラクターに追従', { exact: true }).click();
    const docking = page.locator('range-docking-character');
    await docking.locator('ng-select').click();
    await page.locator('.ng-option', { hasText: 'モンスターA' }).click();
    await docking.getByRole('button', { name: '接続実行' }).click();
    await idle(page);

    await rightClickPiece(range);
    await page.locator('context-menu').getByText('範囲内を対象にする', { exact: true }).click();

    await expect(piece(page, 'モンスターA').getByTestId('target-marker')).toBeVisible({ timeout: 5000 });
    await expect(piece(page, 'モンスターB').getByTestId('target-marker')).toHaveCount(0);
  });
});
