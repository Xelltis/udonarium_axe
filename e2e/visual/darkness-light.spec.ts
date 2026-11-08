import { expect, test } from '@playwright/test';

import { cellSpot, putAwayTutorial } from '../helpers';
import { becomeGm, chooseMenu, closePanels, freeze, prepare, rightClickTable, settle, snap } from './fixtures';

/** One light on the dark table, the starting table's tutorial put away first, as its light would light it too. */
test('a light in the dark looks the same at a fixed flicker phase', async ({ page }) => {
  await prepare(page);
  await putAwayTutorial(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  const menu = await rightClickTable(page, await cellSpot(page, 25.5, 11.5));
  await chooseMenu(page, menu, '光源を作成');
  await expect(page.locator('light-source')).toHaveCount(1);
  await page.locator('app-gm-toolbar [title^="暗闇"]').click();
  await settle(page, 50);
  await expect(page.locator('table-vision-overlay canvas')).toBeAttached();
  await snap(page, 'darkness-light');
});
