import { expect, Page, test } from '@playwright/test';

import { cellSpot, drawSampleModels, openTableContextMenu } from '../helpers';
import { closePanels, prepare, snap } from './fixtures';

async function createCharacterAt(page: Page, position: { x: number; y: number }) {
  const before = await page.locator('game-character').count();
  const menu = await openTableContextMenu(page, position);
  await menu.getByText('キャラクターを作成').click();
  await expect(page.locator('game-character')).toHaveCount(before + 1, { timeout: 10000 });
}

test('two new pieces on the square grid look the same', async ({ page }) => {
  await drawSampleModels(page);
  await prepare(page);
  await closePanels(page);
  await createCharacterAt(page, await cellSpot(page, 25.5, 7.5));
  await createCharacterAt(page, await cellSpot(page, 25.5, 12.5));
  await closePanels(page);
  await snap(page, 'table-square');
});
