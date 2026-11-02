import { expect, Page } from '@playwright/test';

import { openPanel } from './helpers';

/** Turns on the room's strict movement, which is what makes an ordinary press open a move. */
export async function askForStrictMoves(page: Page) {
  await openPanel(page, '部屋設定');
  const panel = page.locator('room-settings-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await panel.locator('[data-testid="room-settings-tab-move"]').click();
  const strict = panel.locator('input[name="moveStrict"]');
  await expect(strict).toBeVisible({ timeout: 5000 });
  if (!(await strict.isChecked())) await strict.check();
  await expect(strict).toBeChecked();
}

/** Opens the move the piece's own menu offers, which is the one a press opens under strict play. */
export async function openMove(page: Page) {
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('移動', { exact: true }).click();
}
