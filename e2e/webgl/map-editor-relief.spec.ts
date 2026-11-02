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
    const board = (await editor.locator('canvas').first().boundingBox())!;
    const from = { x: board.x + board.width * 0.3, y: board.y + board.height * 0.4 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + step * 12, from.y, { steps: 2 });
    await page.mouse.up();

    await editor.getByRole('button', { name: '機能だけ反映' }).click();
    await expect.poll(() => highestGround(page), { timeout: 10000 }).toBeGreaterThan(0);

    await bringTableIn(page);
    await expect(editor.locator('map-editor-layer-drawer i.material-icons', { hasText: 'landscape' })).toHaveCount(1);
  });
});
