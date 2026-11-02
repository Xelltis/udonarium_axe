import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { createCharacter, openTableContextMenu, revealMenuEntry, waitAppReady } from '../helpers';
import { askForStrictMoves, openMove } from '../move-helpers';

/**
 * What the page draws on the floor of a table drawn on a canvas. What it paints on canvases, as the
 * reach of a move, the canvas lays over its board, and takes up again when the page stops; the marks
 * it lays out, as an arrow to a target, are laid over the screen in the perspective the floor is
 * drawn in.
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
  test('is laid where the canvas draws the floor, from the piece to its target', async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    await createCardStack(page);
    await drawOne(page);
    const menu = await openCardMenu(page);
    await menu.getByText('ターゲットを指定').click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
    await page.locator('card-stack').first().dispatchEvent('mousedown');
    await page.locator('card-stack').first().dispatchEvent('mouseup');
    const parts = page.locator('table-target-overlay div');
    await expect(parts).toHaveCount(2, { timeout: 5000 });
    await idle(page);

    const arrow = await parts.evaluateAll((elements) => {
      const [shaft, head] = elements as HTMLElement[];
      const placed =
        /translate3d\(([-\d.]+)px, ([-\d.]+)px, [-\d.]+px\) rotateZ\(([-\d.e]+)deg\) translateX\(([-\d.]+)px\)/;
      const [, x, y, angle, offset] = placed.exec(head.style.transform)!.map(Number);
      const reach = offset + parseFloat(head.style.width);
      const radians = (angle * Math.PI) / 180;
      const rects = [shaft, head].map((element) => element.getBoundingClientRect());
      return {
        from: { x, y },
        to: { x: x + Math.cos(radians) * reach, y: y + Math.sin(radians) * reach },
        drawn: {
          left: Math.min(...rects.map((rect) => rect.left)),
          top: Math.min(...rects.map((rect) => rect.top)),
          right: Math.max(...rects.map((rect) => rect.right)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
        },
      };
    });
    const [from, to] = await page.evaluate(
      (ends) => ends.map((end) => (window as unknown as { __axeTable: Hooks }).__axeTable.project(end.x, end.y, 0)!),
      [arrow.from, arrow.to]
    );
    const card = await drawnBox(page, (await page.locator('card').first().getAttribute('data-object-id'))!);
    const deck = await drawnBox(page, (await page.locator('card-stack').first().getAttribute('data-object-id'))!);
    const report = JSON.stringify({ arrow, from, to, card, deck });

    const offDrawn = (point: { x: number; y: number }) =>
      Math.hypot(
        Math.max(arrow.drawn.left - point.x, 0, point.x - arrow.drawn.right),
        Math.max(arrow.drawn.top - point.y, 0, point.y - arrow.drawn.bottom)
      );
    expect(offDrawn(from), report).toBeLessThan(3);
    expect(offDrawn(to), report).toBeLessThan(3);
    expect(arrow.drawn.right - arrow.drawn.left, report).toBeLessThan(Math.abs(to.x - from.x) + 30);
    expect(arrow.drawn.bottom - arrow.drawn.top, report).toBeLessThan(Math.abs(to.y - from.y) + 30);
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
