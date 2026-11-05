import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { createCharacter, openTableContextMenu, revealMenuEntry, waitAppReady } from '../helpers';
import { askForStrictMoves, openMove } from '../move-helpers';

/**
 * What the page draws on the floor of a table drawn on a canvas. What it paints on canvases, as the
 * reach of a move and an arrow to a target, the canvas lays over its board, and takes up again when
 * the page stops.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { floorCanvases: number } | null;
  pieceBoxesOnPage(identifier: string): Box[];
  project(x: number, y: number, z: number): { x: number; y: number } | null;
};

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

function floorCanvases(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.floorCanvases ?? -1);
}

async function createCardStack(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
}

async function drawOne(page: Page) {
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('１枚引く').click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

async function openCardMenu(page: Page) {
  await page.locator('card').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

/** The box round a piece where the canvas draws it, round the face it lies on for a deck. */
async function drawnBox(page: Page, identifier: string): Promise<Box> {
  const boxes = await page.evaluate(
    (id) => (window as unknown as { __axeTable: Hooks }).__axeTable.pieceBoxesOnPage(id),
    identifier
  );
  return boxes[0];
}

test.describe('an arrow to a target over a table drawn on a canvas', () => {
  test('is laid on the floor from the piece to its target, and taken up once the target is let go', async ({
    page,
  }) => {
    await waitAppReady(page);
    await closePanels(page);
    await createCardStack(page);
    await drawOne(page);
    await idle(page);
    const before = await floorCanvases(page);
    const menu = await openCardMenu(page);
    await menu.getByText('ターゲットを指定').click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
    await page.locator('card-stack').first().dispatchEvent('mousedown');
    await page.locator('card-stack').first().dispatchEvent('mouseup');
    const arrow = page.getByTestId('target-arrow');
    await expect(arrow).toHaveCount(1, { timeout: 5000 });
    await expect.poll(() => floorCanvases(page)).toBe(before + 1);
    await idle(page);

    const ends = await arrow.evaluate((element) => {
      const read = (name: string) => Number((element as HTMLElement).dataset[name]);
      return [
        { x: read('fromX'), y: read('fromY') },
        { x: read('toX'), y: read('toY') },
      ];
    });
    const [from, to] = await page.evaluate(
      (points) =>
        points.map((point) => (window as unknown as { __axeTable: Hooks }).__axeTable.project(point.x, point.y, 0)!),
      ends
    );
    const card = await drawnBox(page, (await page.locator('card').first().getAttribute('data-object-id'))!);
    const deck = await drawnBox(page, (await page.locator('card-stack').first().getAttribute('data-object-id'))!);
    const report = JSON.stringify({ ends, from, to, card, deck });
    const within = (point: { x: number; y: number }, box: Box) =>
      point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
    expect(within(from, card), report).toBe(true);
    expect(within(to, deck), report).toBe(true);
  });
});

test.describe('marks painted on the floor of a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await askForStrictMoves(page);
    await closePanels(page);
    await idle(page);
  });

  test('lays the reach of a move on the board, beside the piece, and takes it up once the move is given up', async ({
    page,
  }) => {
    expect(await floorCanvases(page)).toBe(0);
    const piece = (await page.locator('game-character').first().boundingBox())!;
    const beside = { x: piece.x + piece.width + 4, y: piece.y + piece.height - 16, width: 16, height: 12 };
    const bare = await page.screenshot({ clip: beside });
    expect(await page.screenshot({ clip: beside }), 'nothing moves beside the piece before the move').toEqual(bare);

    await openMove(page);
    await expect(page.locator('[data-testid="move-plan-hint"]')).toBeVisible({ timeout: 5000 });
    await expect.poll(() => floorCanvases(page)).toBeGreaterThan(0);
    await expect(page.locator('table-move-range-overlay canvas').first()).toHaveClass(/opacity-0/);
    await idle(page);
    expect(await page.screenshot({ clip: beside }), 'the reach is drawn beside the piece').not.toEqual(bare);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="move-plan-hint"]')).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => floorCanvases(page)).toBe(0);
  });
});
