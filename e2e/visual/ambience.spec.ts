import { expect, Locator, Page, test } from '@playwright/test';

import { closePanels, freeze, hoverMenu, menuEntry, prepare, rightClickTable, settle, snap } from './fixtures';

/**
 * Chooses an entry of the menu in the same moment as the page's randomness is started over, with no
 * frame between: the table drawn on a canvas takes numbers from it as it makes its parts, and the
 * ground effect made takes its identifier from it, which sets how far along its motion is.
 */
async function chooseSeeded(page: Page, menu: Locator, text: string) {
  const entry = await menuEntry(page, menu, text);
  await entry.evaluate((element) => {
    (window as unknown as { reseedRandom(seed: number): void }).reseedRandom(0x2f6e2b1);
    (element as HTMLElement).click();
  });
  await settle(page);
}

for (const [kind, name] of [
  ['毒沼', 'ambience-swamp'],
  ['溶岩', 'ambience-lava'],
] as const) {
  test(`the ${name} ground looks the same one second in`, async ({ page }) => {
    await prepare(page);
    await closePanels(page);
    await freeze(page);
    const menu = await rightClickTable(page, { x: 1045, y: 498 });
    await hoverMenu(page, menu, '環境エフェクトを置く');
    await chooseSeeded(page, menu, kind);
    await expect(page.locator('table-ambience')).toHaveCount(1);
    await settle(page, 1200);
    await snap(page, name);
  });
}
