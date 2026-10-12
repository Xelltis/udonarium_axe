import { expect, Page, test } from '@playwright/test';

import { centreOf, pedestal, piece, pinnedPiece, Point, settle as settlePiece } from '../see-through-helpers';
import { becomeGm, closePanels, prepare, snap } from './fixtures';

async function chooseRide(page: Page, name: string, entry: string) {
  await piece(page, name).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('乗り物', { exact: true }).hover();
  await menu.getByText(entry).click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
  // Off whatever piece the menu left the pointer over, whose card would cover the next one reached for.
  await page.mouse.move(5, 400);
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Turns the table to hexes from its settings with the clock running, as the hand that drags the
 * pieces about afterwards needs it to.
 */
async function useHexGridLive(page: Page) {
  await page.locator('#app-table-layer').click({ button: 'right', position: { x: 900, y: 250 } });
  const menu = page.locator('context-menu');
  await expect(menu.getByText('テーブル設定', { exact: true })).toBeVisible({ timeout: 15000 });
  await menu.getByText('テーブル設定', { exact: true }).click();
  const gridType = page.locator('modal select[name="tableGridType"]');
  await expect(gridType).toBeVisible({ timeout: 20000 });
  await gridType.selectOption('1');
  await page.locator('modal button', { hasText: 'close' }).first().dispatchEvent('click');
  await expect(page.locator('modal')).toHaveCount(0);
}

/** Puts キャラクターA on キャラクターB, made a mount, where キャラクターB stands. */
async function rideAOnB(page: Page) {
  const rider = await pinnedPiece(page, 'キャラクターA');
  const mount = piece(page, 'キャラクターB');
  await chooseRide(page, 'キャラクターB', '乗り物にする');
  await settlePiece(rider);
  await settlePiece(mount);
  await drag(page, await centreOf(rider.locator('img.image')), await centreOf(pedestal(mount)));
  await settlePiece(rider);
  const offer = page.getByTestId('snackbar');
  await expect(offer).toContainText('キャラクターB の上にいます', { timeout: 5000 });
  await offer.getByTestId('snackbar-action').click();
  await expect(mount.getByTestId('piece-riders').first()).toContainText('1', { timeout: 5000 });
  await settlePiece(rider);
  await page.waitForTimeout(600);
}

test('a piece riding a mount stands on it, on the square grid', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await rideAOnB(page);
  await snap(page, 'ride-square');
});

test('a piece riding a mount stands on it, on a hex grid', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await useHexGridLive(page);
  // The table turned to hexes leaves the pieces where they stood, between cells; picked up and put
  // down where it is, the mount stands on a cell the rider can be put down on as well.
  const mount = piece(page, 'キャラクターB');
  await settlePiece(mount);
  const at = await centreOf(mount.locator('img.image'));
  await drag(page, at, { x: at.x + 4, y: at.y + 4 });
  await settlePiece(mount);
  await rideAOnB(page);
  await snap(page, 'ride-hex');
});
