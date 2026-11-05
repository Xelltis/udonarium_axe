import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openTableContextMenu, TABLE_MENU_AT, waitAppReady } from '../helpers';

/**
 * A look laid over the ground on a table drawn on a canvas, which lies on the screen where the canvas
 * draws the ground it covers rather than among the page's own pieces, and is pressed and moved there.
 */

type Point = { x: number; y: number };

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  project(x: number, y: number, z: number): Point | null;
  pickAt(x: number, y: number): string | null;
};

/** How far apart the box round the laid area and the box round where the canvas draws its ground may lie, in pixels. */
const BOX_SLACK_PX = 2;

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/** Lays a poisoned marsh from the table's menu, and answers its identifier. */
async function layMarsh(page: Page): Promise<string> {
  const menu = await openTableContextMenu(page, TABLE_MENU_AT);
  await menu.getByText('環境エフェクトを置く').hover();
  await menu.getByText('毒沼', { exact: true }).click();
  const look = page.locator('table-ambience');
  await expect(look).toHaveCount(1);
  return (await look.getAttribute('data-object-id'))!;
}

/** Where the look stands on the board, as its element marks it. */
async function placeOf(page: Page, identifier: string): Promise<string | null> {
  return page.locator(`table-ambience[data-object-id="${identifier}"] [data-location]`).getAttribute('data-location');
}

/** The box round where the canvas draws the ground the look covers, on the page. */
async function groundBoxOf(page: Page, identifier: string) {
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

test.describe('a look laid over the ground on a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
  });

  test('lies on the screen where the canvas draws the ground it covers, and not among the page’s own pieces', async ({
    page,
  }) => {
    const id = await layMarsh(page);
    await idle(page);

    await expect(page.locator('#app-game-table table-ambience')).toHaveCount(0);
    const area = page.locator('[data-testid="table-hud"] table-ambience [data-part="area"]');
    await expect(area).toBeVisible();
    const laid = (await area.boundingBox())!;
    const drawn = await groundBoxOf(page, id);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(laid[key] - drawn[key]), JSON.stringify({ laid, drawn })).toBeLessThan(BOX_SLACK_PX);
    }
  });

  test('opens its menu where it lies, and is found there by picking', async ({ page }) => {
    const id = await layMarsh(page);
    await idle(page);
    const box = (await page.locator('table-ambience [data-part="area"]').boundingBox())!;
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    expect(
      await page.evaluate(({ x, y }) => (window as unknown as { __axeTable: Hooks }).__axeTable.pickAt(x, y), middle)
    ).toBe(id);
    await page.mouse.click(middle.x, middle.y, { button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.getByText('環境エフェクトの設定', { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('is dragged about the table, drawn where it is held as it goes', async ({ page }) => {
    const id = await layMarsh(page);
    await idle(page);
    const before = await placeOf(page, id);
    const start = (await page.locator('table-ambience [data-part="area"]').boundingBox())!;
    const grab = { x: start.x + start.width / 2, y: start.y + start.height / 2 };

    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 60, grab.y + 20, { steps: 6 });
    await page.mouse.move(grab.x - 140, grab.y + 40, { steps: 6 });
    await expect
      .poll(async () => start.x - (await page.locator('table-ambience [data-part="area"]').boundingBox())!.x)
      .toBeGreaterThan(80);
    await page.mouse.up();
    await idle(page);

    await expect.poll(() => placeOf(page, id)).not.toBe(before);
    const laid = (await page.locator('table-ambience [data-part="area"]').boundingBox())!;
    const drawn = await groundBoxOf(page, id);
    expect(Math.abs(laid.x - drawn.x), JSON.stringify({ laid, drawn })).toBeLessThan(BOX_SLACK_PX);
    expect(Math.abs(laid.y - drawn.y), JSON.stringify({ laid, drawn })).toBeLessThan(BOX_SLACK_PX);
  });
});
