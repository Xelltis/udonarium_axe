import { expect, test } from '@playwright/test';

import { chooseMenu, closePanels, freeze, hoverMenu, prepare, rightClickTable, settle, snap } from './fixtures';

test('a rolling die looks the same a quarter second in', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  const menu = await rightClickTable(page, { x: 1040, y: 500 });
  await hoverMenu(page, menu, 'ダイスを作成');
  await chooseMenu(page, menu, 'D6');
  await expect(page.locator('dice-symbol')).toHaveCount(1);
  await settle(page, 400);
  await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
  await settle(page);
  const dieMenu = page.locator('context-menu');
  await expect(dieMenu.locator('li').first()).toBeVisible();
  await page.evaluate(() => {
    Math.random = () => 0.42;
  });
  await chooseMenu(page, dieMenu, 'ダイスを振る');
  await settle(page, 250);
  await snap(page, 'dice-roll', { animationAt: 250 });
});
