import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * The relief of the ground shaped in the map editor, which goes onto the table drawn on a canvas when
 * the functions are laid on it, and comes back into the editor when the table is brought in again.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  groundAt(x: number, y: number): number;
  paintAt(x: number, y: number): number[] | null;
};

/** The highest the ground stands anywhere on the table, read every half cell, in table pixels. */
async function highestGround(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    let highest = 0;
    for (let y = 0; y <= 1000; y += 25) {
      for (let x = 0; x <= 1000; x += 25) highest = Math.max(highest, hooks.groundAt(x, y));
    }
    return highest;
  });
}

/** The most of each kind of ground painted anywhere on the table, grass, dirt, rock and sand in turn, each out of fifteen. */
async function mostPainted(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const most = [0, 0, 0, 0];
    for (let y = 0; y <= 1000; y += 25) {
      for (let x = 0; x <= 1000; x += 25) {
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

test.describe('the relief shaped in the map editor', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
        timeout: 20000,
      })
      .not.toBeNull();
  });

  test('raises the ground of the table once the functions are laid, and is brought back in with the table', async ({
    page,
  }) => {
    expect(await highestGround(page)).toBe(0);

    await openPanel(page, 'マップエディター');
    const editor = page.locator('app-map-editor-panel');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await bringTableIn(page);

    await editor.locator('button[title^="起伏"]').click();
    await expect(editor.getByTestId('map-editor-relief')).toBeVisible();
    await editor.getByTestId('map-editor-relief-raise').click();
    await strokeAcrossMap(page, 0.3, 0.4);

    await editor.getByRole('button', { name: '機能だけ反映' }).click();
    await expect.poll(() => highestGround(page), { timeout: 10000 }).toBeGreaterThan(0);

    await bringTableIn(page);
    await expect(editor.locator('map-editor-layer-drawer i.material-icons', { hasText: 'landscape' })).toHaveCount(1);
  });

  test('paints the ground of the table the kind chosen once the functions are laid, and is brought back in with the table', async ({
    page,
  }) => {
    expect(await mostPainted(page)).toEqual([0, 0, 0, 0]);

    await openPanel(page, 'マップエディター');
    const editor = page.locator('app-map-editor-panel');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await bringTableIn(page);

    await editor.locator('button[title^="起伏"]').click();
    await editor.getByTestId('map-editor-relief-paint').click();
    await editor.getByTestId('map-editor-relief-layer-sand').click();
    await strokeAcrossMap(page, 0.3, 0.4);

    await editor.getByRole('button', { name: '機能だけ反映' }).click();
    await expect.poll(async () => (await mostPainted(page))[3], { timeout: 10000 }).toBeGreaterThan(0);
    expect((await mostPainted(page)).slice(0, 3)).toEqual([0, 0, 0]);
    expect(await highestGround(page)).toBe(0);

    await bringTableIn(page);
    await expect(editor.locator('map-editor-layer-drawer i.material-icons', { hasText: 'landscape' })).toHaveCount(1);
  });
});
