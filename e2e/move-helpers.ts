import { expect, Page } from '@playwright/test';

import { openPanel, sendMenuEvent } from './helpers';

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
  // The piece stands under the chat window the room opens with, where no click reaches it.
  await sendMenuEvent(page.locator('game-character').first());
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('移動', { exact: true }).click();
}
