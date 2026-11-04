import { expect, Locator, Page, test } from '@playwright/test';

import {
  becomeGm,
  chooseMenu,
  closeModal,
  closePanels,
  drawCanvasThrough,
  drawsOnCanvas,
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
  if (drawsOnCanvas()) await drawCanvasThrough(page);
  const piece = page.locator('game-character').filter({ hasText: name });
  const ground = drawsOnCanvas() ? piece.locator('[data-location]').first() : piece.locator('div').first();
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

/**
 * Where a press near a point of the table lands on the table itself rather than on the marks over a
 * piece: the point itself, or the nearest of a few around it. On a canvas the names and gauges stand
 * over the pieces on the screen, where the page's own table has the board.
 */
async function clearOfMarks(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  if (!drawsOnCanvas()) return at;
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
          ?.closest('game-character, terrain, table-ambience, dice-symbol, card, card-stack, light-source, ui-panel'),
      { x: table.x + point.x, y: table.y + point.y }
    );
    if (clear) return point;
  }
  throw new Error('every point near the pond is under the marks over a piece');
}

/** Waits for the water to be built: in the page's own marks, or in the scene of a canvas. */
async function waterBuilt(page: Page, mark: string) {
  if (!drawsOnCanvas()) {
    await expect(page.locator(mark).first()).toBeAttached();
    return;
  }
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

async function createPiece(page: Page, position: { x: number; y: number }) {
  const before = await page.locator('game-character').count();
  const menu = await rightClickTable(page, position);
  await chooseMenu(page, menu, 'キャラクターを作成');
  await expect(page.locator('game-character')).toHaveCount(before + 1, { timeout: 10000 });
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
 * Opens the pond's own menu: from its element on the page's own table, and by a press in the middle
 * of it where a canvas draws it, which is where a canvas takes the pond's presses.
 */
/**
 * Takes the pointer off the pond once its settings are made, on a canvas, where its menu was opened
 * by a press on it: left over it, the pond's name comes up over the table, and goes again only as
 * the clock runs on.
 */
async function leavePond(page: Page) {
  if (!drawsOnCanvas()) return;
  await page.mouse.move(1279, 799);
  await settle(page, 400);
}

async function openPondMenu(page: Page): Promise<Locator> {
  if (drawsOnCanvas() && pondAt) {
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

/** Lays a pond round a piece of the starting table, which has a picture to wade with. */
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

async function wadeIn(page: Page) {
  const feet = await feetOf(page, 'キャラクターA');
  await layPond(page, { x: feet.x + 40, y: feet.y + 30 });
  await setWaterLevel(page, '1');
  await waterBuilt(page, '[data-water-copy]');
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
  const menu = await rightClickTable(page, { x: 780, y: 400 });
  await chooseMenu(page, menu, '地形を作成');
  await expect(page.locator('terrain')).toHaveCount(1, { timeout: 10000 });
  await settle(page, 400);
  await layPond(page, { x: 700, y: 470 });
  await setWaterLevel(page, '1');
  await waterBuilt(page, '[data-water-shore]');
  await settle(page, 400);
  await snap(page, 'water-shore', { ...WATER_SNAP, animationAt: 900 });
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
  await waterBuilt(page, '[data-water-layer="scum"]');
  await settle(page, 400);
  await snap(page, 'water-stagnant', WATER_SNAP);
});

test('lotus leaves and flowers float on a lotus pond', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await wadeIn(page);
  await setWaterLook(page, '蓮池');
  await waterBuilt(page, '[data-water-layer="leaves"]');
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
  await waterBuilt(page, '[data-water-layer="flow"]');
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
  await createPiece(page, PIECE_AT);
  const piece = page.locator('game-character').last();
  await layPond(page, POND_AT);
  await setWaterLevel(page, '2');
  await piece.dispatchEvent('contextmenu');
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await (await menuEntry(page, menu, 'このコマの視点で見る')).dispatchEvent('click');
  await settleLazy(
    page,
    page.locator('first-person-view [data-water-quad], first-person-view [data-testid="first-person-canvas"]')
  );
  await expect(page.locator('first-person-view [data-sky-gradient]')).toBeAttached();
  await settle(page, 400);
  await snap(page, 'first-person-underwater', WATER_SNAP);
});
