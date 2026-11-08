import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { openPanel, waitAppReady } from './helpers';

/**
 * The room's 3D models as media: read in from a file, shown by a picture of each and the one chosen
 * turning, tagged, put on a piece by dragging it there, and removed from the room.
 */

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
  const key = copy.indexOf('"generator":"');
  if (key < 0) throw new Error('the bundled model names no generator to change');
  const at = key + '"generator":"'.length;
  const capital = copy
    .toString('latin1', at, at + 1)
    .toUpperCase()
    .charCodeAt(0);
  if (capital === copy[at]) throw new Error('the generator’s name starts with a capital already');
  copy[at] = capital;
  return copy;
}

/** Lets a model dragged from the list go over the middle of a piece on the table. */
async function dropOnPiece(page: Page, modelId: string, piece: Locator): Promise<void> {
  const box = (await piece.boundingBox())!;
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

/**
 * Opens a piece's sheet at its settings, runs the step given with the choice of the model it is drawn
 * as, and closes the sheet again.
 */
async function withModelChoice(page: Page, piece: Locator, step: (choice: Locator) => Promise<void>): Promise<void> {
  await piece.dispatchEvent('contextmenu');
  await page.locator('context-menu').getByText('詳細を表示').click();
  const sheet = page.locator('game-character-sheet');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  await sheet.locator('button:has(i:text-is("settings"))').first().click();
  await step(sheet.getByTestId('piece-model'));
  await page
    .locator('ui-panel', { has: sheet })
    .locator('.bg-ui-titlebar button', { hasText: 'close' })
    .first()
    .dispatchEvent('click');
  await expect(sheet).toHaveCount(0);
}

test.describe('the 3D models of the room as media', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
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

    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
    const pieces = await page.locator('game-character').count();
    const modelId = (await statue.getAttribute('data-model-id'))!;
    await dropOnPiece(page, modelId, piece);
    await expect(page.locator('game-character')).toHaveCount(pieces);
    await withModelChoice(page, piece, async (choice) => {
      await expect(choice.locator('option:checked')).toContainText('statue', { timeout: 20000 });
    });

    await library.getByTestId('model-library-remove').click();
    await page.locator('confirm-dialog').getByRole('button', { name: '削除する' }).click();
    await expect(library.getByTestId('model-library-model').filter({ hasText: 'statue' })).toHaveCount(0);
    await withModelChoice(page, piece, async (choice) => {
      await expect(choice.locator('option', { hasText: 'statue' })).toHaveCount(0);
    });
  });
});
