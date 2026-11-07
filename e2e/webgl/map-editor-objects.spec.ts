import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * The 3D objects painted in the map editor, which go onto the table drawn on a canvas as blocks drawn
 * as their models when the functions are laid, and are found already there when laid again.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { models: number };
};

async function modelsDrawn(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    await hooks.whenIdle();
    return hooks.sceneStats().models;
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

test.describe('the 3D objects painted in the map editor', () => {
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

  test('stands a model on the table for each cell painted, and finds them there when the functions are laid again', async ({
    page,
  }) => {
    const before = await modelsDrawn(page);
    await openPanel(page, 'マップエディター');
    const editor = page.locator('app-map-editor-panel');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await bringTableIn(page);

    await editor.locator('button[title^="機能ツール"]').click();
    await editor
      .locator('select')
      .filter({ has: page.locator('option', { hasText: '3Dオブジェクト' }) })
      .selectOption({ label: '3Dオブジェクト' });
    await editor.getByTestId('object-shelves').getByRole('button', { name: '家具' }).click();
    await editor.getByTestId('object-models').getByRole('button', { name: '木箱' }).click();
    await expect(editor.getByTestId('object-model-name')).toHaveText('木箱');
    await expect(editor.getByTestId('object-arrangement').getByRole('button', { name: '1マスに1つ' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await strokeAcrossMap(page, 0.3, 0.4);

    await editor.getByRole('button', { name: '機能だけ反映' }).click();
    await expect.poll(() => modelsDrawn(page), { timeout: 20000 }).toBeGreaterThan(before);
    const laid = await modelsDrawn(page);

    await editor.getByRole('button', { name: '機能だけ反映' }).click();
    await expect(page.getByText('塗った機能をテーブルへ反映しました').last()).toBeVisible();
    expect(await modelsDrawn(page)).toBe(laid);
  });
});
