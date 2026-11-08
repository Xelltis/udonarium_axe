import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { createCharacter, openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

/**
 * What the screen lays over a table drawn on a canvas, rather than among the page's own pieces: a
 * look laid over the ground, the glow of a light, the shape of what a piece sees, the marquee and
 * the arrow to a target. Each has to lie where the canvas draws the place it stands for, which the
 * table's camera and picking say with nothing drawn at all.
 */

type Box = { x: number; y: number; width: number; height: number };

type Point = { x: number; y: number };

type Hooks = {
  whenIdle(): Promise<void>;
  project(x: number, y: number, z: number): Point | null;
  pickAt(x: number, y: number): string | null;
  pieceBoxesOnPage(identifier: string): Box[];
};

/** How far apart the box round the laid area and the box round the ground it covers may lie, in pixels. */
const BOX_SLACK_PX = 2;

/** Waits for what the screen lays over the table to stand where the table now puts it, with the pointer off the table. */
async function idle(page: Page) {
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

function holds(box: Box, point: Point, slack = 0): boolean {
  return (
    point.x >= box.x - slack &&
    point.x <= box.x + box.width + slack &&
    point.y >= box.y - slack &&
    point.y <= box.y + box.height + slack
  );
}

/** Lays a poisoned marsh from the table's menu, and answers its identifier. */
async function layMarsh(page: Page): Promise<string> {
  const menu = await openTableContextMenu(page);
  await menu.getByText('環境エフェクトを置く').hover();
  await menu.getByText('毒沼', { exact: true }).click();
  const look = page.locator('table-ambience');
  await expect(look).toHaveCount(1);
  return (await look.getAttribute('data-object-id'))!;
}

/** Where the look stands on the board, as its element marks it. */
function placeOf(page: Page, identifier: string): Promise<string | null> {
  return page.locator(`table-ambience[data-object-id="${identifier}"] [data-location]`).getAttribute('data-location');
}

/** The box round where the canvas draws the ground the look covers, on the page. */
function groundBoxOf(page: Page, identifier: string): Promise<Box> {
  return page.evaluate((id) => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const look = document.querySelector(`table-ambience[data-object-id="${id}"]`)!;
    const [x, y] = look.querySelector('[data-location]')!.getAttribute('data-location')!.split(',').map(Number);
    const laid = look.querySelector<HTMLElement>('[data-part="area"]')!.parentElement!;
    const width = parseFloat(laid.style.width);
    const height = parseFloat(laid.style.height);
    const corners = [
      hooks.project(x, y, 0)!,
      hooks.project(x + width, y, 0)!,
      hooks.project(x + width, y + height, 0)!,
      hooks.project(x, y + height, 0)!,
    ];
    const left = Math.min(...corners.map((corner) => corner.x));
    const top = Math.min(...corners.map((corner) => corner.y));
    return {
      x: left,
      y: top,
      width: Math.max(...corners.map((corner) => corner.x)) - left,
      height: Math.max(...corners.map((corner) => corner.y)) - top,
    };
  }, identifier);
}

/** How far apart the laid area of a look and the box round the ground it covers lie, at the side furthest apart. */
async function areaOffGround(page: Page, identifier: string, sides: readonly (keyof Box)[]): Promise<number> {
  const laid = (await page.locator('table-ambience [data-part="area"]').boundingBox())!;
  const drawn = await groundBoxOf(page, identifier);
  return Math.max(...sides.map((side) => Math.abs(laid[side] - drawn[side])));
}

test.describe('a look laid over the ground of a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
  });

  test('lies on the screen over the ground it covers, opens its menu there, and is dragged about the table, laid where it is held as it goes', async ({
    page,
  }) => {
    const id = await layMarsh(page);
    await idle(page);

    await expect(page.locator('#app-game-table table-ambience')).toHaveCount(0);
    const area = page.locator('[data-testid="table-hud"] table-ambience [data-part="area"]');
    await expect(area).toBeVisible();
    expect(await areaOffGround(page, id, ['x', 'y', 'width', 'height'])).toBeLessThan(BOX_SLACK_PX);

    const start = (await area.boundingBox())!;
    const grab = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    expect(
      await page.evaluate(({ x, y }) => (window as unknown as { __axeTable: Hooks }).__axeTable.pickAt(x, y), grab)
    ).toBe(id);
    await page.mouse.click(grab.x, grab.y, { button: 'right' });
    await expect(page.locator('context-menu').getByText('環境エフェクトの設定', { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await page.locator('#app-table-layer').dispatchEvent('mousedown');
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
    await idle(page);

    const before = await placeOf(page, id);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 60, grab.y + 20, { steps: 6 });
    await page.mouse.move(grab.x - 140, grab.y + 40, { steps: 6 });
    await expect.poll(async () => start.x - (await area.boundingBox())!.x).toBeGreaterThan(80);
    await page.mouse.up();
    await idle(page);

    await expect.poll(() => placeOf(page, id)).not.toBe(before);
    await expect.poll(() => areaOffGround(page, id, ['x', 'y'])).toBeLessThan(BOX_SLACK_PX);
  });
});

test.describe('the shapes of light and of sight over a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    await idle(page);
  });

  test('stands the glow of a light on the screen over where picking finds the light', async ({ page }) => {
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

  test('lays the shape of what a piece sees on the screen round where picking finds the piece', async ({ page }) => {
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

/** How long a press on the bare table is held before it opens a marquee, a little past the table's own wait. */
const LONG_PRESS_MS = 500;

test.describe('the marquee over a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('lies on the floor from where the press was held to where the pointer has gone, and goes once let go', async ({
    page,
  }) => {
    const from = { x: 1000, y: 540 };
    const to = { x: 1100, y: 600 };
    const marquee = page.getByTestId('table-floor-plane').locator('table-marquee-overlay > div');

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(LONG_PRESS_MS);
    await page.mouse.move(to.x, to.y, { steps: 6 });

    await expect(marquee).toBeVisible({ timeout: 5000 });
    await expect
      .poll(async () => {
        const drawn = (await marquee.boundingBox())!;
        return [
          drawn.x < from.x + 4,
          drawn.y < from.y + 4,
          drawn.x + drawn.width > to.x - 4,
          drawn.y + drawn.height > to.y - 4,
        ];
      })
      .toEqual([true, true, true, true]);

    await page.mouse.up();
    await expect(marquee).toHaveCount(0);
  });
});
