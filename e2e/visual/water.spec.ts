import { expect, Page, test } from '@playwright/test';

import {
  becomeGm,
  chooseMenu,
  closeModal,
  closePanels,
  freeze,
  hoverMenu,
  menuEntry,
  openTableSetting,
  prepare,
  rightClickTable,
  settle,
  settleLazy,
  snap,
  useHexGrid,
} from './fixtures';

/** Where a new piece is put for the view from under the water, and the pond a little off it. */
const PIECE_AT = { x: 760, y: 400 };
const POND_AT = { x: 790, y: 430 };

/** Where a piece of the starting table stands on the screen: the middle of the ground it stands on. */
async function feetOf(page: Page, name: string): Promise<{ x: number; y: number }> {
  const ground = page.locator('game-character').filter({ hasText: name }).locator('div').first();
  const box = await ground.boundingBox();
  if (!box) throw new Error(`${name} is not on the screen`);
  const table = await page.locator('#app-table-layer').boundingBox();
  return { x: box.x + box.width / 2 - (table?.x ?? 0), y: box.y + box.height / 2 - (table?.y ?? 0) };
}

/**
 * The net of light drifts for as long as the page is open, so every shot holds it at one moment.
 * A few pixels of its soft lines come out differently from run to run.
 */
const WATER_SNAP = { animationAt: 1200, maxDiffPixels: 48 };

async function createPiece(page: Page, position: { x: number; y: number }) {
  const before = await page.locator('game-character').count();
  const menu = await rightClickTable(page, position);
  await chooseMenu(page, menu, 'キャラクターを作成');
  await expect(page.locator('game-character')).toHaveCount(before + 1, { timeout: 10000 });
  await settle(page, 400);
}

async function layPond(page: Page, position: { x: number; y: number }) {
  const menu = await rightClickTable(page, position);
  await hoverMenu(page, menu, '環境エフェクトを置く');
  await chooseMenu(page, menu, '水');
  await expect(page.locator('table-ambience')).toHaveCount(1);
  await settle(page, 400);
}

/** Sets how high the water stands from the pond's own settings. */
async function setWaterLevel(page: Page, cells: string) {
  await page.locator('table-ambience').first().dispatchEvent('contextmenu');
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await chooseMenu(page, menu, '環境エフェクトの設定');
  const field = page.locator('input[name="ambienceSurface"]');
  await settleLazy(page, field);
  await field.click();
  await field.press('Control+A');
  await field.pressSequentially(cells);
  await field.press('Tab');
  await settle(page, 400);
  await closePanels(page);
}

/** Lays a pond round a piece of the starting table, which has a picture to wade with. */
async function wadeIn(page: Page) {
  const feet = await feetOf(page, 'キャラクターA');
  await layPond(page, { x: feet.x + 40, y: feet.y + 30 });
  await setWaterLevel(page, '1');
  await expect(page.locator('[data-water-copy]').first()).toBeAttached();
}

test('a piece wades into a pond on the square grid', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await wadeIn(page);
  await settle(page, 400);
  await snap(page, 'water-pond', WATER_SNAP);
});

test('a piece wades into a pond on a hex grid the same way', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await useHexGrid(page);
  await wadeIn(page);
  await settle(page, 400);
  await snap(page, 'water-pond-hex', WATER_SNAP);
});

test('the whole map under water', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openTableSetting(page);
  await page.locator('modal select[name="tableWeatherKind"]').selectOption({ label: '水中' });
  await settle(page);
  await closeModal(page);
  await settle(page, 800);
  await snap(page, 'weather-underwater', WATER_SNAP);
});

test('a piece looks out from under the surface of a pond', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await createPiece(page, PIECE_AT);
  const piece = page.locator('game-character').last();
  await layPond(page, POND_AT);
  await setWaterLevel(page, '2');
  await piece.dispatchEvent('contextmenu');
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await (await menuEntry(page, menu, 'このコマの視点で見る')).dispatchEvent('click');
  await settle(page, 400);
  await expect(page.locator('first-person-view [data-water-quad]').first()).toBeAttached({ timeout: 10000 });
  await expect(page.locator('first-person-view [data-sky-gradient]')).toBeAttached();
  await settle(page, 400);
  await snap(page, 'first-person-underwater', WATER_SNAP);
});
