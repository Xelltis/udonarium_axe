import { expect, test } from '@playwright/test';

import { cellSpot, putAwayTutorial } from '../helpers';
import {
  becomeGm,
  chooseMenu,
  closePanels,
  freeze,
  prepare,
  rightClickTable,
  settle,
  snap,
  useHexGrid,
} from './fixtures';

/**
 * A light beside a walled terrain on a dark hex table.
 *
 * The darkness is cut to hex cells and the walls are read at their open faces, so the hex surface,
 * the cell lookups and the neighbour tables all have a hand in this picture. The starting table's
 * tutorial is put away first, as its light would light the dark table too.
 */
test('a light beside a wall on a dark hex table', async ({ page }) => {
  await prepare(page);
  await putAwayTutorial(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await useHexGrid(page);

  const terrainMenu = await rightClickTable(page, await cellSpot(page, 25.5, 14.5));
  await chooseMenu(page, terrainMenu, '地形を作成');
  await expect(page.locator('terrain').last()).toBeAttached();
  await settle(page, 400);

  const lightMenu = await rightClickTable(page, await cellSpot(page, 24.5, 10.5));
  await chooseMenu(page, lightMenu, '光源を作成');
  await expect(page.locator('light-source')).toHaveCount(1);

  await page.locator('app-gm-toolbar [title^="暗闇"]').click();
  await settle(page, 50);
  await expect(page.locator('table-vision-overlay canvas')).toBeAttached();
  await settle(page, 400);
  await snap(page, 'hex-darkness-walls');
});
