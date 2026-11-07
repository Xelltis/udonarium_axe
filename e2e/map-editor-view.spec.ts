import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm } from './dungeon-helpers';
import { openPanel, waitAppReady } from './helpers';

/** The map editor, opened by the game master with its map drawn. */
async function openEditor(page: Page): Promise<Locator> {
  await waitAppReady(page);
  await becomeGm(page);
  await openPanel(page, 'マップエディター');
  const editor = page.locator('app-map-editor-panel');
  await expect(editor.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  return editor;
}

/** Whether one box lies wholly inside another. */
function inside(inner: { x: number; y: number; width: number; height: number }, outer: typeof inner): boolean {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

test.describe('the map editor', () => {
  test('opens with the whole map in view, and fits it again from the button after zooming in', async ({ page }) => {
    const editor = await openEditor(page);
    const map = editor.locator('canvas').first();
    const view = map.locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]');

    await expect.poll(async () => inside((await map.boundingBox())!, (await view.boundingBox())!)).toBe(true);

    for (let step = 0; step < 4; step++) await editor.locator('button[title="拡大"]').click();
    expect(inside((await map.boundingBox())!, (await view.boundingBox())!)).toBe(false);

    await editor.getByTestId('map-editor-zoom-fit').click();
    await expect.poll(async () => inside((await map.boundingBox())!, (await view.boundingBox())!)).toBe(true);
  });

  test('closes the menu of layers to add once another tool is picked', async ({ page }) => {
    const editor = await openEditor(page);
    await expect(editor.getByTestId('map-layers-empty')).toBeVisible();

    await editor.locator('button[title="レイヤーを追加"]').click();
    const menu = editor.getByRole('button', { name: 'マップマスク' });
    await expect(menu).toBeVisible();

    await editor.locator('button[title^="ペン"]').click();
    await expect(menu).toHaveCount(0);
  });

  test('names the layer drawing makes after its kind, in the language shown', async ({ page }) => {
    const editor = await openEditor(page);
    await editor.locator('button[title^="ペン"]').click();
    const map = (await editor.locator('canvas').first().boundingBox())!;

    await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);

    await expect(editor.getByText('セル 1', { exact: true })).toBeVisible();
    await expect(editor.getByTestId('map-layers-empty')).toHaveCount(0);
  });
});
