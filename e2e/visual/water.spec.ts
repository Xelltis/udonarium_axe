import { expect, Locator, Page, test } from '@playwright/test';

import { cellSpot } from '../helpers';
import {
  becomeGm,
  chooseMenu,
  closeModal,
  closePanels,
  drawCanvasThrough,
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

/**
 * Where a new piece is put for the view from under the water, and the pond a little off it, in cells
 * of the starting table: on the open ground east of its pieces.
 */
const PIECE_CELL = { x: 25.5, y: 11.5 };
const POND_CELL = { x: 26.1, y: 12.1 };

/**
 * Where the pond a piece wades in is laid, in cells of the starting table: south of キャラクターB, whose
 * feet stand at (20.5, 14.5), near enough for the pond to take them in, and clear of the rings round
 * the feet of the pieces beside it, a press on which is the piece's.
 */
const PONDSIDE_OF_B = { x: 20.5, y: 16.1 };

/** The net of light drifts for as long as the page is open, so every shot holds it at one moment. */
const WATER_SNAP = { animationAt: 1200 };

/**
 * Where a press near a point of the table lands on the table itself rather than on the marks over a
 * piece or on a piece the canvas draws there, as the outline of the cells a piece stands on: the
 * point itself, or the nearest of a few around it, the names and gauges standing over the pieces on
 * the screen. The ring round a piece's feet, a press on which turns the piece or opens its menu, is
 * kept clear of by its box, as the page does not report it under the point until it is pressed.
 */
async function clearOfMarks(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const table = (await page.locator('#app-table-layer').boundingBox())!;
  const tries = [
    [0, 0],
    [20, 0],
    [0, 20],
    [30, 20],
    [40, -10],
    [-20, 30],
    [50, 30],
    [20, 50],
  ];
  for (const [dx, dy] of tries) {
    const point = { x: at.x + dx, y: at.y + dy };
    const clear = await page.evaluate(
      ({ x, y }) =>
        !document
          .elementFromPoint(x, y)
          ?.closest('game-character, terrain, table-ambience, dice-symbol, card, card-stack, light-source, ui-panel') &&
        ![...document.querySelectorAll('[data-testid="turn-ring"]')].some((ring) => {
          const box = ring.getBoundingClientRect();
          return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
        }) &&
        (window as unknown as { __axeTable: { pickAt(x: number, y: number): string | null } }).__axeTable.pickAt(
          x,
          y
        ) === null,
      { x: table.x + point.x, y: table.y + point.y }
    );
    if (clear) return point;
  }
  throw new Error('every point near the pond is under the marks over a piece');
}

/** Waits for the water to be built in the scene of the canvas. */
async function waterBuilt(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __axeTable: { sceneStats(): { waterParts: number } | null } }).__axeTable.sceneStats()
            ?.waterParts ?? 0
      )
    )
    .toBeGreaterThan(0);
}

/** Makes a piece at a point, and leaves the pointer off the table, where its card would cover the pond laid beside it. */
async function createPiece(page: Page, position: { x: number; y: number }) {
  const before = await page.locator('game-character').count();
  const menu = await rightClickTable(page, position);
  await chooseMenu(page, menu, 'キャラクターを作成');
  await expect(page.locator('game-character')).toHaveCount(before + 1, { timeout: 10000 });
  await page.mouse.move(1279, 799);
  await settle(page, 400);
}

/** Where the pond was laid on the table layer, the middle of it, where a press on a canvas opens its menu. */
let pondAt: { x: number; y: number } | null = null;

async function layPond(page: Page, position: { x: number; y: number }) {
  const at = await clearOfMarks(page, position);
  const menu = await rightClickTable(page, at);
  await hoverMenu(page, menu, '環境エフェクトを置く');
  await chooseMenu(page, menu, '水');
  await expect(page.locator('table-ambience')).toHaveCount(1);
  await settle(page, 400);
  pondAt = at;
}

/**
 * Takes the pointer off the pond once its settings are made, which it was left over when the pond
 * was laid: left over it, the pond's name comes up over the table, and goes again only as the clock
 * runs on.
 */
async function leavePond(page: Page) {
  await page.mouse.move(1279, 799);
  await settle(page, 400);
}

/**
 * Opens the pond's own menu by a press in the middle of it where the canvas draws it, which is where
 * the canvas takes the pond's presses, or from its element before that has been found.
 */
async function openPondMenu(page: Page): Promise<Locator> {
  if (pondAt) {
    await page.locator('#app-table-layer').click({ button: 'right', position: pondAt });
  } else {
    await page.locator('table-ambience').first().dispatchEvent('contextmenu');
  }
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  return menu;
}

/** Sets how high the water stands from the pond's own settings. */
async function setWaterLevel(page: Page, cells: string) {
  const menu = await openPondMenu(page);
  await chooseMenu(page, menu, '環境エフェクトの設定');
  const field = page.locator('input[name="ambienceSurface"]');
  await settleLazy(page, field);
  await field.click();
  await field.press('Control+A');
  await field.pressSequentially(cells);
  await field.press('Tab');
  await settle(page, 400);
  await closePanels(page);
  await leavePond(page);
}

/** Sets how murky the water is from the pond's own settings, as a percentage. */
async function setMurkiness(page: Page, percent: string) {
  const menu = await openPondMenu(page);
  await chooseMenu(page, menu, '環境エフェクトの設定');
  const field = page.locator('input[name="ambienceTurbidity"]');
  await settleLazy(page, field);
  await field.fill(percent);
  await settle(page, 400);
  await closePanels(page);
  await leavePond(page);
}

/** Gives the pond one of the looks water can have, from its own settings. */
async function setWaterLook(page: Page, label: string) {
  const menu = await openPondMenu(page);
  await chooseMenu(page, menu, '環境エフェクトの設定');
  const field = page.locator('select[name="ambienceWaterPreset"]');
  await settleLazy(page, field);
  await field.selectOption({ label });
  await settle(page, 400);
  await closePanels(page);
  await leavePond(page);
}

/** Sets the pond flowing, how fast as a percentage and which way by the arrow it is offered as. */
async function setFlow(page: Page, percent: string, direction: string) {
  const menu = await openPondMenu(page);
  await chooseMenu(page, menu, '環境エフェクトの設定');
  const speed = page.locator('input[name="ambienceFlowSpeed"]');
  await settleLazy(page, speed);
  await speed.fill(percent);
  await settle(page, 200);
  await page.locator('select[name="ambienceFlowDirection"]').selectOption({ label: direction });
  await settle(page, 400);
  await closePanels(page);
  await leavePond(page);
}

/** Lays a pond round a piece of the starting table, which has a picture to wade with. */
async function wadeIn(page: Page) {
  await drawCanvasThrough(page);
  await layPond(page, await cellSpot(page, PONDSIDE_OF_B.x, PONDSIDE_OF_B.y));
  await setWaterLevel(page, '1');
  await waterBuilt(page);
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

test('waves break on a block standing out of the water', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  const blocks = await page.locator('terrain').count();
  const menu = await rightClickTable(page, await cellSpot(page, 25.5, 9.5));
  await chooseMenu(page, menu, '地形を作成');
  await expect(page.locator('terrain')).toHaveCount(blocks + 1, { timeout: 10000 });
  await settle(page, 400);
  await layPond(page, await cellSpot(page, 24.5, 11));
  await setWaterLevel(page, '1');
  await waterBuilt(page);
  await settle(page, 400);
  await snap(page, 'water-shore', { ...WATER_SNAP, animationAt: 900 });
});

test('a ditch dug from a pond fills with its water, standing as high as the pond', async ({ page }) => {
  // Each step of the brush has the table drawn again, slowly in the software renderer the shots are
  // drawn with, so the stroke is laid with the page's clock running, before it is held.
  test.setTimeout(240_000);
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await page.getByTestId('toolbar-ground-brush').click();
  await page.getByTestId('ground-brush-lower').click();
  await page.getByTestId('ground-brush-radius').fill('1');
  await page.getByTestId('ground-brush-strength').fill('1');
  const from = await cellSpot(page, 13.5, 15.5);
  const to = await cellSpot(page, 19.5, 15.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
  await page.getByTestId('ground-brush-close').click();
  await expect(page.getByTestId('ground-brush-band')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __axeTable: { whenIdle(): Promise<void> } }).__axeTable.whenIdle());
  await freeze(page);
  await layPond(page, await cellSpot(page, 12.5, 15.5));
  await leavePond(page);
  await waterBuilt(page);
  await settle(page, 400);
  await snap(page, 'water-ditch', WATER_SNAP);
});

test('a piece fades into murky water', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await wadeIn(page);
  await setMurkiness(page, '85');
  await settle(page, 400);
  await snap(page, 'water-murky', WATER_SNAP);
});

test('scum floats on stagnant water and hides what stands in it', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await wadeIn(page);
  await setWaterLook(page, 'よどんだ水');
  await waterBuilt(page);
  await settle(page, 400);
  await snap(page, 'water-stagnant', WATER_SNAP);
});

test('lotus leaves and flowers float on a lotus pond', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await wadeIn(page);
  await setWaterLook(page, '蓮池');
  await waterBuilt(page);
  await settle(page, 400);
  await snap(page, 'water-lotus', WATER_SNAP);
});

test('murky water flows past a piece, carrying its silt and streaked by the current', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await wadeIn(page);
  await setMurkiness(page, '55');
  await setFlow(page, '70', '↘ 右下');
  await waterBuilt(page);
  await settle(page, 400);
  await snap(page, 'water-river', WATER_SNAP);
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
  await createPiece(page, await cellSpot(page, PIECE_CELL.x, PIECE_CELL.y));
  const piece = page.locator('game-character').last();
  await layPond(page, await cellSpot(page, POND_CELL.x, POND_CELL.y));
  await setWaterLevel(page, '2');
  await piece.dispatchEvent('contextmenu');
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await (await menuEntry(page, menu, 'このコマの視点で見る')).dispatchEvent('click');
  await settleLazy(page, page.locator('first-person-view [data-testid="first-person-canvas"]'));
  await settleLazy(page, page.locator('first-person-view [data-sky-gradient]'));
  await settle(page, 400);
  await snap(page, 'first-person-underwater', WATER_SNAP);
});
