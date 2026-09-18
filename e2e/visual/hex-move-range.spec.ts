import { expect, test } from '@playwright/test';

import { openPanel } from '../helpers';
import { closePanels, freeze, prepare, settle, settleLazy, snap, useHexGrid } from './fixtures';

/**
 * The reach of a piece a move is being planned for, on a hex table.
 *
 * The reach is filled cell by cell and outlined where it meets cells it does not hold, so the cell
 * polygons, the outline and the neighbour lookups on a hex grid all show up here.
 */
test('a planned move shows its reach on a hex table', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await useHexGrid(page);

  await openPanel(page, '部屋設定');
  await settleLazy(page);
  const panel = page.locator('room-settings-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await panel.locator('[data-testid="room-settings-tab-move"]').click();
  await settle(page, 100);
  const strict = panel.locator('input[name="moveStrict"]');
  await expect(strict).toBeVisible({ timeout: 5000 });
  if (!(await strict.isChecked())) await strict.check();
  await settle(page);
  await closePanels(page);

  await page.locator('game-character').first().dispatchEvent('contextmenu');
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await menu.getByText('移動', { exact: true }).dispatchEvent('click');
  await settle(page, 400);
  await expect(page.locator('table-move-range-overlay canvas')).toHaveCount(1, { timeout: 5000 });
  await snap(page, 'hex-move-range');
});
