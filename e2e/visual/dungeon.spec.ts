import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels, freeze, holdFlicker, holdSceneAt, prepare, settle, settleLazy, snap } from './fixtures';

/** The same dungeon every run: the generator lays rooms and walls out from the seed alone. */
const SEED = '1278372739';
/** Few rooms, so a board a software rasteriser has to draw stays small enough to settle. */
const ROOMS = '3';

const GRIDS = [
  { label: '四角', name: 'dungeon-square' },
  { label: 'ヘクス（縦）', name: 'dungeon-hex-flat' },
  { label: 'ヘクス（横）', name: 'dungeon-hex-pointy' },
] as const;

async function typeInto(page: Page, input: Locator, text: string) {
  await input.click();
  await input.press('Control+a');
  await input.pressSequentially(text);
  await settle(page);
}

/** Runs the stopped clock on until the locator shows, since nothing the page waits on moves otherwise. */
async function settleUntilVisible(page: Page, locator: Locator, limitMs: number) {
  for (let spent = 0; spent < limitMs; spent += 200) {
    if (await locator.isVisible()) return;
    await settle(page, 200);
  }
  await expect(locator).toBeVisible({ timeout: 1000 });
}

/**
 * Builds the dungeon with the clock already stopped.
 *
 * The generated torches flicker by the clock. Started on real time and stopped afterwards, the
 * flicker is left at whatever moment the stop caught it; stopped first, it is drawn at the same
 * moments every run.
 */
async function buildDungeon(page: Page, gridLabel: string, atmosphere?: string) {
  await page.locator('[data-testid="fab-entry-table"]').click();
  await settle(page);
  await page.locator('[data-testid="fab-submenu-table"] [data-testid="fab-entry-dungeonGenerator"]').click();
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  const grid = panel.getByRole('button', { name: gridLabel, exact: true });
  await settleLazy(page, grid);
  await grid.click();
  await settle(page);
  if (atmosphere) {
    await panel.getByRole('button', { name: atmosphere, exact: true }).click();
    await settle(page);
  }
  await typeInto(page, panel.locator('input[name="room-count-number"]'), ROOMS);
  await typeInto(page, panel.locator('#seed'), SEED);
  await panel.getByRole('button', { name: '生成する' }).click();
  const goTo = panel.getByRole('button', { name: 'このテーブルへ移動' });
  await settleUntilVisible(page, goTo, 120000);
  await goTo.click();
  await settle(page, 400);
  await expect.poll(() => page.evaluate(() => window.__axeTable?.sceneStats()?.chunks ?? 0)).toBeGreaterThan(0);
}

/**
 * Leaves the light over the floor out of the picture.
 *
 * The generated torches light the floor through the vision overlay, which is drawn again whenever
 * the images it casts shadows with finish loading. Loading runs on real time, so the glow is caught
 * at a different stage each run. The faces of the blocks, which these pictures watch, are drawn by
 * the terrain itself and stay in.
 */
async function hideFloorLight(page: Page) {
  await page.addStyleTag({
    content: 'table-vision-overlay canvas, table-vision-volume-overlay canvas { visibility: hidden !important; }',
  });
}

/**
 * Holds the generated torches of a table drawn on a canvas as they flicker at one moment. The
 * canvas lights the blocks with them too, and the clock stands wherever building the dungeon left
 * it, which it does on real time, by the time the shot is taken.
 */
async function holdTorches(page: Page) {
  await holdFlicker(page, TORCHES_HELD_AT_MS);
}

/** The moment the torches are held at, any one, so long as it is the same every run. */
const TORCHES_HELD_AT_MS = 2000;

/**
 * Presses the bare page under the board, so that the keys that follow turn and move the table. Pressed
 * at a point rather than on the body: a press on an element first waits for it to hold still over two
 * frames, and a generated board drawn without a graphics card can take longer than that wait a frame.
 */
async function focusTable(page: Page) {
  await page.mouse.click(1200, 780);
}

/** Gives textures fetched on real time a moment to arrive. */
async function letImagesArrive(page: Page) {
  await page.waitForTimeout(1000);
  await settle(page, 100);
}

/**
 * A generated dungeon, seen as the table first shows it and again with the camera turned.
 *
 * Blocks packed wall to wall hide most of each other's sides, so these pictures hold whatever
 * decides which of those sides are drawn to what the table looked like before.
 */
/**
 * Leaves the pieces standing in the dungeon out of the picture.
 *
 * These pictures watch the terrain. A piece's picture and the ring at its feet come out a shade
 * different now and then when the machine is busy, and would fail a picture whose terrain is the
 * same. The shadows the pieces throw on the walls are worked out from where they stand, and stay in.
 */
async function hidePieces(page: Page) {
  await page.addStyleTag({ content: 'game-character { visibility: hidden !important; }' });
}

for (const grid of GRIDS) {
  test(`a generated ${grid.name} looks the same from above and turned`, async ({ page }) => {
    test.setTimeout(600000);
    await prepare(page);
    await becomeGm(page);
    await closePanels(page);
    await freeze(page);
    await buildDungeon(page, grid.label);
    await hideFloorLight(page);
    await holdTorches(page);
    await hidePieces(page);
    await closePanels(page);
    await settle(page, 400);
    await letImagesArrive(page);
    await snap(page, grid.name, { timeout: 150000 });

    await focusTable(page);
    for (let step = 0; step < 12; step++) await page.keyboard.press('Shift+ArrowRight');
    for (let step = 0; step < 4; step++) await page.keyboard.press('Shift+ArrowUp');
    await settle(page, 400);
    await letImagesArrive(page);
    await snap(page, `${grid.name}-turned`, { timeout: 150000 });
  });
}

/**
 * The moment the stream and the mills are held at, any one, so long as it is the same every run: the
 * clock stands wherever generating the village left it, and the sails and the wheel turn by it.
 */
const MILLS_HELD_AT_MS = 5000;

/** Builds a settlement of the mood named in open country, from the seed, with the clock already stopped. */
async function buildSettlement(page: Page, mood: string, seed: string, gridLabel = '四角') {
  await page.locator('[data-testid="fab-entry-table"]').click();
  await settle(page);
  await page.locator('[data-testid="fab-submenu-table"] [data-testid="fab-entry-dungeonGenerator"]').click();
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  const field = panel.getByRole('button', { name: 'フィールド', exact: true });
  await settleLazy(page, field);
  await field.click();
  await settle(page);
  await panel.getByRole('button', { name: gridLabel, exact: true }).click();
  await settle(page);
  await panel.getByRole('button', { name: mood, exact: true }).click();
  await settle(page);
  await typeInto(page, panel.locator('#seed'), seed);
  await panel.getByRole('button', { name: '生成する' }).click();
  const goTo = panel.getByRole('button', { name: 'このテーブルへ移動' });
  await settleUntilVisible(page, goTo, 120000);
  await goTo.click();
  await settle(page, 400);
  await expect.poll(() => page.evaluate(() => window.__axeTable?.sceneStats()?.models ?? 0)).toBeGreaterThan(0);
}

/**
 * A generated village: its stream cut through the ground between the houses and under the road, the
 * mill on its bank with its wheel in the water, and the windmill, their wheel and sails turned as far
 * as the stopped clock has them.
 */
test('a generated village runs a stream past its watermill, and stands a windmill', async ({ page }) => {
  test.setTimeout(600000);
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await buildSettlement(page, '農村', '20261106');
  await hideFloorLight(page);
  await holdTorches(page);
  await hidePieces(page);
  await closePanels(page);
  await settle(page, 400);
  await letImagesArrive(page);
  await focusTable(page);
  for (let step = 0; step < 6; step++) await page.keyboard.press('Control+ArrowDown');
  await settle(page, 400);
  await letImagesArrive(page);
  await letImagesArrive(page);
  await holdSceneAt(page, MILLS_HELD_AT_MS);
  await snap(page, 'village-mills', { timeout: 150000 });
});

for (const grid of [
  { label: 'ヘクス（縦）', name: 'village-mills-hex-flat' },
  { label: 'ヘクス（横）', name: 'village-mills-hex-pointy' },
]) {
  test(`a generated village stands its mills on hexes, ${grid.name}`, async ({ page }) => {
    test.setTimeout(600000);
    await prepare(page);
    await becomeGm(page);
    await closePanels(page);
    await freeze(page);
    await buildSettlement(page, '農村', '20261106', grid.label);
    await hideFloorLight(page);
    await holdTorches(page);
    await hidePieces(page);
    await closePanels(page);
    await settle(page, 400);
    await letImagesArrive(page);
    await focusTable(page);
    for (let step = 0; step < 4; step++) await page.keyboard.press('Control+ArrowDown');
    await settle(page, 400);
    await letImagesArrive(page);
    await letImagesArrive(page);
    await holdSceneAt(page, MILLS_HELD_AT_MS);
    await snap(page, grid.name, { timeout: 150000 });
  });
}

/**
 * A generated sewer: its channels cut down the passages and falling over their weirs, a basin sunk in
 * a room and the pipes pouring into it out of the walls.
 */
test('a generated sewer runs its water down the passages and pours it into the basins', async ({ page }) => {
  test.setTimeout(600000);
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await buildDungeon(page, '四角', '下水道');
  await hideFloorLight(page);
  await holdTorches(page);
  await hidePieces(page);
  await closePanels(page);
  await settle(page, 400);
  await letImagesArrive(page);
  await focusTable(page);
  for (let step = 0; step < 4; step++) await page.keyboard.press('Control+ArrowDown');
  await settle(page, 400);
  await letImagesArrive(page);
  // The water runs and falls by the clock, which stands wherever generating the sewer left it.
  await holdSceneAt(page, MILLS_HELD_AT_MS);
  await snap(page, 'dungeon-sewer', { timeout: 150000 });

  for (let step = 0; step < 5; step++) await page.keyboard.press('Control+ArrowDown');
  await settle(page, 400);
  await letImagesArrive(page);
  await snap(page, 'dungeon-sewer-wide', { timeout: 150000 });
});
