import { expect, Page, test } from '@playwright/test';

import {
  becomeGm,
  chooseMenu,
  closeModal,
  closePanels,
  freeze,
  openTableSetting,
  prepare,
  rightClickTable,
  settle,
  snap,
} from './fixtures';

async function createAt(page: Page, position: { x: number; y: number }, entry: string, selector: string) {
  const before = await page.locator(selector).count();
  const menu = await rightClickTable(page, position);
  await chooseMenu(page, menu, entry);
  await expect(page.locator(selector)).toHaveCount(before + 1, { timeout: 10000 });
  await settle(page, 400);
}

async function lookOutOf(page: Page, piece: ReturnType<Page['locator']>) {
  await piece.dispatchEvent('contextmenu');
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await menu.getByText('このコマの視点で見る', { exact: true }).dispatchEvent('click');
  await settle(page, 400);
  await expect(page.locator('first-person-view [data-quad="wall"]').first()).toBeAttached({ timeout: 10000 });
  await settle(page, 400);
}

async function standBeforeABlockAndLook(page: Page) {
  await createAt(page, { x: 700, y: 450 }, 'キャラクターを作成', 'game-character');
  const piece = page.locator('game-character').last();
  await createAt(page, { x: 800, y: 380 }, '地形を作成', 'terrain');
  await lookOutOf(page, piece);
}

test('a piece on the square grid looks at a block on the table it stands on', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await standBeforeABlockAndLook(page);
  await snap(page, 'first-person-square');
});

test('a piece on a hex grid looks at a hex block the same way', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await openTableSetting(page);
  await page.locator('modal select[name="tableGridType"]').selectOption('1');
  await settle(page);
  await closeModal(page);
  await standBeforeABlockAndLook(page);
  await snap(page, 'first-person-hex');
});
