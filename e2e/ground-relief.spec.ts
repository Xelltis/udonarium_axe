import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { openPanel, waitAppReady } from './helpers';

/**
 * The ground of a table, which the master raises, digs and paints with a brush laid on the table or
 * shapes in the map editor, and what stands on it stands on. The heights and the paint are the
 * table's own, read as the canvas would draw them, with nothing drawn at all.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  whenIdle(): Promise<void>;
  pieceBoxesOnPage(identifier: string): Box[];
  groundAt(x: number, y: number): number;
  paintAt(x: number, y: number): number[] | null;
  sceneBoard(): { widthPx: number; depthPx: number } | null;
};

/**
 * Waits for what the screen lays over the table to stand where the table now puts it, with the
 * pointer off the table and the detail of any piece it passed over gone.
 */
async function idle(page: Page) {
  await page.mouse.move(5, 400);
  await expect(page.locator('overview-panel')).toHaveCount(0, { timeout: 5000 });
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/** The box on the page round the pedestal of a piece, once picking finds the piece. */
async function pedestalOf(page: Page, identifier: string): Promise<Box> {
  let pedestal: Box | undefined;
  await expect
    .poll(async () => {
      [pedestal] = await page.evaluate(
        (id) => (window as unknown as { __axeTable: Hooks }).__axeTable.pieceBoxesOnPage(id),
        identifier
      );
      return pedestal;
    })
    .toBeTruthy();
  return pedestal!;
}

/** How high the ground stands under the middle of a piece, in table pixels. */
async function groundUnder(page: Page, piece: Locator): Promise<number> {
  const [x, y] = (await piece.locator('[data-location]').first().getAttribute('data-location'))!.split(',').map(Number);
  return page.evaluate(({ x, y }) => (window as unknown as { __axeTable: Hooks }).__axeTable.groundAt(x + 25, y + 25), {
    x,
    y,
  });
}

/** How high the ground stands all over the board, read every half cell, in table pixels. */
function groundHeights(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const board = hooks.sceneBoard();
    const heights: number[] = [];
    for (let y = 0; y <= (board?.depthPx ?? 0); y += 25) {
      for (let x = 0; x <= (board?.widthPx ?? 0); x += 25) heights.push(hooks.groundAt(x, y));
    }
    return heights;
  });
}

/** How many points of the board the ground stands higher at than it did, of two readings of {@link groundHeights}. */
function raisedSince(before: readonly number[], after: readonly number[]): number {
  return after.filter((height, index) => height > before[index] + 1).length;
}

/** The most of each kind of ground painted anywhere on the board, grass, dirt, rock and sand in turn, each out of fifteen. */
function mostPainted(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const board = hooks.sceneBoard();
    const most = [0, 0, 0, 0];
    for (let y = 0; y <= (board?.depthPx ?? 0); y += 25) {
      for (let x = 0; x <= (board?.widthPx ?? 0); x += 25) {
        hooks.paintAt(x, y)?.forEach((share, kind) => (most[kind] = Math.max(most[kind], share)));
      }
    }
    return most;
  });
}

/** Lays a stroke of the brush across the editor's map, from a point a share of the way across and down it. */
async function strokeAcrossMap(page: Page, across: number, down: number): Promise<void> {
  const board = (await page.locator('app-map-editor-panel canvas').first().boundingBox())!;
  const from = { x: board.x + board.width * across, y: board.y + board.height * down };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + step * 12, from.y, { steps: 2 });
  await page.mouse.up();
}

async function bringTableIn(page: Page): Promise<void> {
  const editor = page.locator('app-map-editor-panel');
  await editor.getByRole('button', { name: 'テーブルを取り込む' }).click();
  await page.locator('confirm-dialog').getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('confirm-dialog')).toHaveCount(0);
}

test.describe('the ground of a table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
  });

  test('is raised under a piece by strokes of the brush, lifting the piece, and goes back when a stroke is taken back', async ({
    page,
  }) => {
    const character = page.locator('game-character', { has: page.getByText('モンスターA', { exact: true }) });
    const id = (await character.getAttribute('data-object-id'))!;
    const flat = await pedestalOf(page, id);
    const underfoot = await groundUnder(page, character);

    await page.getByTestId('toolbar-ground-brush').click();
    await expect(page.getByTestId('ground-brush-band')).toBeVisible();
    await expect(page.getByTestId('ground-brush-raise')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(5, 400);

    const at = { x: flat.x + flat.width / 2, y: flat.y - 20 };
    for (let stroke = 0; stroke < 3; stroke++) {
      await page.mouse.move(at.x - 60, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + 60, at.y, { steps: 10 });
      await page.mouse.up();
    }
    await idle(page);
    expect(await groundUnder(page, character)).toBeGreaterThan(underfoot + 10);

    const raised = await pedestalOf(page, id);
    expect(flat.y - raised.y, JSON.stringify([flat, raised])).toBeGreaterThan(10);

    for (let stroke = 0; stroke < 3; stroke++) await page.getByTestId('ground-brush-undo').click();
    await expect(page.getByTestId('ground-brush-undo')).toBeDisabled();
    await idle(page);

    expect(await groundUnder(page, character)).toBe(underfoot);
    const back = await pedestalOf(page, id);
    expect(Math.abs(back.y - flat.y), JSON.stringify([flat, back])).toBeLessThan(1);
  });

  test('is raised and painted the kind chosen from the relief shaped in the map editor once the functions are laid, and is brought back in with the table', async ({
    page,
  }) => {
    const first = await groundHeights(page);
    const unpainted = await mostPainted(page);

    await openPanel(page, 'マップエディター');
    const editor = page.locator('app-map-editor-panel');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await bringTableIn(page);

    await editor.locator('button[title^="起伏"]').click();
    await expect(editor.getByTestId('map-editor-relief')).toBeVisible();
    await editor.getByTestId('map-editor-relief-raise').click();
    await strokeAcrossMap(page, 0.3, 0.4);

    await editor.getByRole('button', { name: '機能だけ反映' }).click();
    await expect.poll(async () => raisedSince(first, await groundHeights(page)), { timeout: 10000 }).toBeGreaterThan(0);
    const raised = await groundHeights(page);
    expect(await mostPainted(page)).toEqual(unpainted);

    await editor.getByTestId('map-editor-relief-paint').click();
    await editor.getByTestId('map-editor-relief-layer-sand').click();
    await strokeAcrossMap(page, 0.3, 0.4);

    await editor.getByRole('button', { name: '機能だけ反映' }).click();
    await expect.poll(async () => (await mostPainted(page))[3], { timeout: 10000 }).toBeGreaterThan(unpainted[3]);
    expect((await mostPainted(page)).slice(0, 3)).toEqual(unpainted.slice(0, 3));
    expect(await groundHeights(page)).toEqual(raised);

    await bringTableIn(page);
    await expect(editor.locator('map-editor-layer-drawer i.material-icons', { hasText: 'landscape' })).toHaveCount(1);
  });
});
