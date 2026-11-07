import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * The room's 3D models as media: read in from a file, shown by a picture of each and the one chosen
 * turning, tagged, put on a piece by dragging it there, and removed from the room.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { models: number };
};

/**
 * A model of the room's own: a bundled model's bytes with a letter of the name of what made it
 * changed, so it is none of the app's, and its picture is drawn and it may be removed.
 */
const STATUE = {
  name: 'statue.glb',
  mimeType: 'model/gltf-binary',
  buffer: ownCopy(readFileSync(join(process.cwd(), 'src/assets/models/nature/tree_oak.glb'))),
};

/** The bytes of a binary glTF file with the first letter of its generator's name made a capital. */
function ownCopy(bytes: Buffer): Buffer {
  const copy = Buffer.from(bytes);
  const at = copy.indexOf('"generator":"') + '"generator":"'.length;
  copy[at] = copy
    .toString('latin1', at, at + 1)
    .toUpperCase()
    .charCodeAt(0);
  return copy;
}

async function modelsDrawn(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    await hooks.whenIdle();
    return hooks.sceneStats().models;
  });
}

/** Lets a model dragged from the list go over the middle of a piece on the table. */
async function dropOnPiece(page: Page, modelId: string, pieceName: string): Promise<void> {
  const box = (await page.locator('game-character').filter({ hasText: pieceName }).first().boundingBox())!;
  await page.evaluate(
    ({ modelId, x, y }) => {
      const carried = new DataTransfer();
      carried.setData('application/x-axe-model', modelId);
      const at = { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: carried };
      const target = document.elementFromPoint(x, y)!;
      target.dispatchEvent(new DragEvent('dragover', at));
      target.dispatchEvent(new DragEvent('drop', at));
    },
    { modelId, x: box.x + box.width / 2, y: box.y + box.height / 2 }
  );
}

test.describe('the 3D models of the room as media', () => {
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

  test('reads a model in, shows it by a picture and turning, tags it, puts it on a piece and removes it', async ({
    page,
  }) => {
    await openPanel(page, '3Dモデル');
    const library = page.getByTestId('model-library');
    await expect(library).toBeVisible({ timeout: 15000 });

    await library.getByTestId('model-library-file').setInputFiles(STATUE);
    const statue = library.getByTestId('model-library-model').filter({ hasText: 'statue' });
    await expect(statue).toHaveCount(1, { timeout: 15000 });
    await expect(statue.locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 20000 });

    await expect(library.getByTestId('model-library-chosen')).toBeVisible();
    await expect(library.getByTestId('model-stage-state')).toHaveCount(0, { timeout: 20000 });

    await statue.getByTestId('model-library-show').click();
    await library.getByTestId('model-library-new-tag').fill('石像');
    await library.getByTestId('model-library-tag-checked').click();
    await library.getByTestId('model-library-tag').filter({ hasText: '石像' }).click();
    await expect(library.getByTestId('model-library-model')).toHaveCount(1);

    const before = await modelsDrawn(page);
    const pieces = await page.locator('game-character').count();
    const modelId = (await statue.getAttribute('data-model-id'))!;
    await dropOnPiece(page, modelId, 'キャラクターB');
    await expect.poll(() => modelsDrawn(page), { timeout: 20000 }).toBeGreaterThan(before);
    await expect(page.locator('game-character')).toHaveCount(pieces);

    await library.getByTestId('model-library-remove').click();
    await page.locator('confirm-dialog').getByRole('button', { name: '削除する' }).click();
    await expect(library.getByTestId('model-library-model').filter({ hasText: 'statue' })).toHaveCount(0);
    await expect.poll(() => modelsDrawn(page), { timeout: 20000 }).toBe(before);
  });
});
