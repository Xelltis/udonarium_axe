import { expect, test } from '@playwright/test';

import {
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

test('a piece on a hex grid wears the hex pedestal', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openTableSetting(page);
  await page.locator('modal select[name="tableGridType"]').selectOption('1');
  await settle(page);
  await closeModal(page);
  const menu = await rightClickTable(page, { x: 700, y: 450 });
  await chooseMenu(page, menu, 'キャラクターを作成');
  await page.mouse.move(1279, 799);
  await expect(page.locator('game-character')).toHaveCount(7);
  await settle(page, 400);
  await snap(page, 'hex-pedestal');
});
