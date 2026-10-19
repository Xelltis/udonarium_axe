import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** A 1x1 transparent PNG, used as an image well under the limit. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/**
 * An uncompressed 24-bit BMP. At 1000x800 it comes to about 2.4MB, over the 2MB limit. Its contents
 * are a plain gradient, so cropped and written out it gets small enough.
 */
function largeBmp(width = 1000, height = 800): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(54 + pixelBytes, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = 54 + y * rowSize + x * 3;
      buffer[at] = Math.floor((x / width) * 255);
      buffer[at + 1] = Math.floor((y / height) * 255);
      buffer[at + 2] = 128;
    }
  }
  return buffer;
}

async function openFileStorage(page: Page) {
  await waitAppReady(page);
  await openPanel(page, '画像');
  await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
}

function uploadInput(page: Page): Locator {
  return page.locator('file-storage input[type="file"][accept="image/*"]');
}

function editorFrame(page: Page): Locator {
  return page.getByTestId('image-editor-frame');
}

/**
 * Where the image rests. The panel opens with a fly-in animation, and measured midway the
 * coordinates the frame is drawn at would be off. Waits for the animations that have an end, then
 * measures until the position stops changing.
 */
async function restingFrame(page: Page) {
  await editorFrame(page).evaluate((element) => {
    const panel = element.closest('.draggable-panel') ?? element;
    const ending = panel
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    return Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)));
  });
  let last = '';
  await expect
    .poll(async () => {
      const box = JSON.stringify(await editorFrame(page).boundingBox());
      const held = box === last;
      last = box;
      return held;
    })
    .toBe(true);
  return JSON.parse(last) as { x: number; y: number; width: number; height: number };
}

/** Draws a frame with a real mouse, from near the top left of the image to near its bottom right. */
async function dragCrop(page: Page) {
  const box = await restingFrame(page);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
}

test.describe('editing an image', () => {
  test.beforeEach(async ({ page }) => {
    await openFileStorage(page);
  });

  test('adds an image within the limit as it is, without opening the editor', async ({ page }) => {
    await uploadInput(page).setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG });

    await expect(page.locator('file-storage img[alt="tiny.png"]')).toHaveCount(1, { timeout: 10000 });
    await expect(editorFrame(page)).toHaveCount(0);
  });

  test('opens an image over 2MB in the editor, where it can be cropped and added', async ({ page }) => {
    await uploadInput(page).setInputFiles({ name: 'big.bmp', mimeType: 'image/bmp', buffer: largeBmp() });

    await expect(editorFrame(page)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('image-editor-over-limit')).toBeVisible();
    await expect(page.locator('file-storage img[alt="big.bmp"]')).toHaveCount(0);

    await dragCrop(page);
    await expect(page.getByTestId('image-editor-crop')).toBeVisible();
    const width = Number(await page.getByTestId('image-editor-width').inputValue());
    expect(width).toBeGreaterThan(300);
    expect(width).toBeLessThan(700);

    await page.getByTestId('image-editor-add').click();
    await expect(editorFrame(page)).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('file-storage img[alt^="big."]')).toHaveCount(1);
  });

  test('opens even a small image in the editor once "edit before adding" is checked', async ({ page }) => {
    await page.getByTestId('file-storage-edit-first').locator('input').check();
    await uploadInput(page).setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG });

    await expect(editorFrame(page)).toBeVisible({ timeout: 10000 });
    await page.getByTestId('image-editor-add').click();

    await expect(editorFrame(page)).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('file-storage img[alt="tiny.png"]')).toHaveCount(1);
  });

  test('edits a checked image again right after replacing it by an edit', async ({ page }) => {
    await uploadInput(page).setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG });
    const tile = page.locator('file-storage img[alt^="tiny."]');
    await expect(tile).toHaveCount(1, { timeout: 10000 });
    const tiles = await page.locator('file-storage img').count();
    const original = await tile.getAttribute('src');
    await tile.click();
    const edit = page.getByTestId('file-storage-edit');

    for (let round = 0; round < 2; round++) {
      await expect(edit).toBeEnabled();
      await edit.click();
      await expect(editorFrame(page)).toBeVisible({ timeout: 10000 });
      await page.getByTestId('image-editor-turn-right').click();
      await page.getByTestId('image-editor-add').click();
      await expect(editorFrame(page)).toHaveCount(0, { timeout: 10000 });
    }

    // The original image is hidden from the list, and the edited one alone is listed. The format
    // written out is PNG or WebP depending on the browser.
    await expect(page.locator('file-storage img')).toHaveCount(tiles);
    await expect(tile).toHaveCount(1);
    expect(await tile.getAttribute('src')).not.toBe(original);
    await expect(edit).toBeEnabled();
  });
});
