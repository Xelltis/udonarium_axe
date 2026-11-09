import { expect, Locator, Page } from '@playwright/test';

import { closePanels } from './dungeon-helpers';
import { openPanel } from './helpers';
import { solidPng } from './png-helpers';

export type FaceHooks = {
  surfacePageOf(surface: string, x: number, y: number): { x: number; y: number } | null;
  surfaceSizeOf(surface: string): { width: number; height: number } | null;
  faceAt(pageX: number, pageY: number): string | null;
  pickAt(pageX: number, pageY: number): string | null;
  whenIdle(): Promise<void>;
};

/**
 * Waits for the table to be drawn as it now stands: over a canvas, for the canvas to draw it and for
 * what the screen lays over it, a board's face among them, to be put where the canvas draws it,
 * which is done in a frame after the table changes.
 */
export async function whenDrawn(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __axeTable: FaceHooks }).__axeTable.whenIdle());
}

/** Shows a wall of the table with a plain picture on it, which a wall needs before it is drawn. */
export async function showWall(page: Page, wallName: string, key: string) {
  await openPanel(page, 'テーブル設定');
  const settings = page.locator('game-table-setting');
  await expect(settings).toBeVisible({ timeout: 10000 });
  await settings.getByRole('button', { name: `${wallName}画像を追加` }).click();
  const picker = page.locator('file-selector');
  await expect(picker).toBeVisible();
  await picker
    .locator('input[type="file"]')
    .setInputFiles({ name: `${key}.png`, mimeType: 'image/png', buffer: solidPng(200, 100, [120, 110, 90]) });
  // The picker takes a picture just added as the one chosen, and closes by itself once the picture has
  // gone into the room: two to four seconds beside a table drawn in software through WebGPU, longer
  // while other specs run beside it.
  await expect(picker).toHaveCount(0, { timeout: 15000 });
  await settings
    .locator('div')
    .filter({ has: page.getByRole('img', { name: `${wallName}画像`, exact: true }) })
    .last()
    .getByRole('checkbox')
    .check();
  await closePanels(page);
}

/** Where a point of a face, across and down it, is drawn on the page. */
export async function pageOfFace(page: Page, surface: string, x: number, y: number): Promise<{ x: number; y: number }> {
  const onPage = await page.evaluate(
    ({ surface, x, y }) => (window as unknown as { __axeTable: FaceHooks }).__axeTable.surfacePageOf(surface, x, y),
    { surface, x, y }
  );
  expect(onPage).not.toBeNull();
  return onPage!;
}

/**
 * The face a piece stands on, by the face of the table or of the board it is drawn on; or, for a
 * piece on the screen over a table drawn on a canvas, by the face it marks itself as standing on.
 */
export function faceOf(piece: Locator): Promise<string | null> {
  return piece.evaluate(
    (element) =>
      element.querySelector('[data-on-surface]')?.getAttribute('data-on-surface') ??
      element.closest('[data-surface]')?.getAttribute('data-surface') ??
      null
  );
}

/**
 * Draws the camera back from the table, so a board or a wall standing behind it is on the screen
 * whole, above the pieces on the table rather than over them, and waits for the camera to come to rest.
 *
 * A piece's detail comes up where the pointer rests on a piece, as where a panel closed over one,
 * and would take the wheel turned over it; the pointer is taken to the edge of the table until no
 * detail is up, and the wheel is turned as soon as it is over the middle again.
 */
export async function standBack(page: Page) {
  const layer = (await page.locator('#app-table-layer').boundingBox())!;
  await page.mouse.move(layer.x + 5, layer.y + layer.height / 2);
  await expect(page.locator('overview-panel')).toHaveCount(0, { timeout: 5000 });
  await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2);
  const camera = () =>
    page.evaluate(() =>
      JSON.stringify((window as unknown as { __axeTable: { camera(): unknown } }).__axeTable.camera())
    );
  const before = await camera();
  for (let notch = 0; notch < 4; notch++) await page.mouse.wheel(0, 300);
  await expect.poll(camera).not.toBe(before);
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await camera();
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [250] }
    )
    .toBe(true);
}
