import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { createCharacter, openTableContextMenu, revealMenuEntry, waitAppReady } from '../helpers';

/**
 * The glow round a light and the shape of what a piece sees, on a table drawn on a canvas: laid on
 * the screen where the canvas draws the place they stand, rather than among the page's own pieces.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
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

function boxesOf(page: Page, identifier: string): Promise<Box[]> {
  return page.evaluate(
    (id) => (window as unknown as { __axeTable: Hooks }).__axeTable.pieceBoxesOnPage(id),
    identifier
  );
}

/** The box round several boxes. */
function round(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return {
    x: left,
    y: top,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
  };
}

function holds(box: Box, point: { x: number; y: number }, slack = 0): boolean {
  return (
    point.x >= box.x - slack &&
    point.x <= box.x + box.width + slack &&
    point.y >= box.y - slack &&
    point.y <= box.y + box.height + slack
  );
}

test.describe('the shapes of light and of sight on a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    await idle(page);
  });

  test('stands the glow of a light on the screen over where the canvas draws the light', async ({ page }) => {
    const before = await page.locator('light-source').count();
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '光源を作成')).click();
    await expect(page.locator('light-source')).toHaveCount(before + 1, { timeout: 10000 });
    const id = (await page.locator('light-source').last().getAttribute('data-object-id'))!;
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length).toBeGreaterThan(0);

    await expect(page.locator('#app-game-table table-beam-overlay')).toHaveCount(0);
    const glow = page.locator('[data-testid="table-hud"] table-beam-overlay > div').last();
    await expect(glow).toBeVisible();
    const drawn = (await glow.boundingBox())!;
    const middle = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 };
    const light = round(await boxesOf(page, id));
    expect(holds(light, middle, 4), JSON.stringify({ light, middle })).toBe(true);
  });

  test('lays the shape of what a piece sees on the screen round where the canvas draws the piece', async ({ page }) => {
    await createCharacter(page);
    const id = (await page.locator('game-character').last().getAttribute('data-object-id'))!;
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length).toBeGreaterThan(0);
    const piece = round(await boxesOf(page, id));
    const menu = page.locator('context-menu');
    await page.mouse.click(piece.x + piece.width / 2, piece.y + piece.height / 2, { button: 'right' });
    await (await revealMenuEntry(page, menu, '視界・光源設定…')).click();
    await page.locator('input[name="visionRange"]').fill('3');
    await closePanels(page);
    await page.mouse.click(piece.x + piece.width / 2, piece.y + piece.height / 2, { button: 'right' });
    await (await revealMenuEntry(page, menu, '視界範囲を表示')).click();
    await idle(page);

    await expect(page.locator('#app-game-table table-vision-volume-overlay')).toHaveCount(0);
    const lines = page.locator('[data-testid="table-hud"] table-vision-volume-overlay > div');
    await expect.poll(() => lines.count()).toBeGreaterThan(0);
    const ground = (await lines.first().boundingBox())!;
    const standing = { x: piece.x + piece.width / 2, y: piece.y + piece.height / 2 };
    expect(holds(ground, standing), JSON.stringify({ ground, standing })).toBe(true);
    expect(ground.width).toBeGreaterThan(piece.width);
  });
});
