import { expect, test } from '@playwright/test';

import { becomeGm, chooseMenu, closePanels, freeze, prepare, rightClickTable, settle, snap } from './fixtures';

test('a light in the dark looks the same at a fixed flicker phase', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  const menu = await rightClickTable(page, { x: 1040, y: 500 });
  await chooseMenu(page, menu, '光源を作成');
  await expect(page.locator('light-source')).toHaveCount(1);
  await page.locator('app-gm-toolbar [title^="暗闇"]').click();
  await settle(page, 50);
  await expect(page.locator('table-vision-overlay canvas')).toBeAttached();
  await snap(page, 'darkness-light');
});
