import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels, freeze, prepare, settle, settleLazy, snap } from './fixtures';

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
async function buildDungeon(page: Page, gridLabel: string) {
  await page.locator('[data-testid="fab-entry-table"]').click();
  await settle(page);
  await page.locator('[data-testid="fab-submenu-table"] [data-testid="fab-entry-dungeonGenerator"]').click();
  await settleLazy(page);
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: gridLabel, exact: true }).click();
  await settle(page);
  await typeInto(page, panel.locator('input[name="room-count-number"]'), ROOMS);
  await typeInto(page, panel.locator('#seed'), SEED);
  await panel.getByRole('button', { name: '生成する' }).click();
  const goTo = panel.getByRole('button', { name: 'このテーブルへ移動' });
  await settleUntilVisible(page, goTo, 120000);
  await goTo.click();
  await settle(page, 400);
  await expect(page.locator('terrain-batch-layer [data-terrain]').first()).toBeAttached();
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

/** Gives textures fetched on real time a moment to arrive. */
async function letImagesArrive(page: Page) {
  await page.waitForTimeout(1000);
  await settle(page, 100);
}

/** The offer to restore an earlier table comes and goes with the autosave, and is not what is watched. */
async function dismissRestoreOffer(page: Page) {
  const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
  if (await later.count()) {
    await later.first().dispatchEvent('click');
    await settle(page, 100);
  }
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
    await hidePieces(page);
    await closePanels(page);
    await settle(page, 400);
    await letImagesArrive(page);
    await dismissRestoreOffer(page);
    await snap(page, grid.name, { threshold: 0, maxDiffPixels: 0, timeout: 150000 });

    await page.locator('body').click({ position: { x: 1200, y: 780 } });
    for (let step = 0; step < 12; step++) await page.keyboard.press('Shift+ArrowRight');
    for (let step = 0; step < 4; step++) await page.keyboard.press('Shift+ArrowUp');
    await settle(page, 400);
    await letImagesArrive(page);
    await dismissRestoreOffer(page);
    await snap(page, `${grid.name}-turned`, { threshold: 0, maxDiffPixels: 0, timeout: 150000 });
  });
}
