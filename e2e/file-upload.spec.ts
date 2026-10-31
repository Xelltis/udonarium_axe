import { expect, Page, test } from '@playwright/test';

import { chatInput, openPanel, waitAppReady } from './helpers';

/** A 1x1 transparent PNG, turned into a Buffer from base64 for setInputFiles. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/**
 * The smallest MP3 header (an ID3v2 of 0 bytes and a dummy mp3 frame). It is never decoded; as with
 * ImageStorage, FileArchiver tells the contents by their MIME type.
 */
const TINY_MP3 = Buffer.from(
  'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'base64'
);

/**
 * An empty ZIP file (PK\x05\x06 and 18 bytes of zeros, an empty central directory). Udonarium's
 * FileArchiver fails soft on a broken file, so it is enough for the file to be recognised as the
 * format at all.
 */
const EMPTY_ZIP = Buffer.from([
  0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00,
]);

async function openFileStorage(page: Page) {
  await waitAppReady(page);
  await openPanel(page, '画像');
  await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
}

async function openJukebox(page: Page) {
  await waitAppReady(page);
  await openPanel(page, 'ジュークボックス');
  await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
}

test.describe('uploading images (file-storage)', () => {
  test.beforeEach(async ({ page }) => {
    await openFileStorage(page);
  });

  test('adds an uploaded PNG file to the image grid', async ({ page }) => {
    const beforeImageCount = await page.locator('file-storage img').count();
    await page.locator('file-storage input[type="file"][accept="image/*"]').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect
      .poll(() => page.locator('file-storage img').count(), { timeout: 10000 })
      .toBeGreaterThan(beforeImageCount);
  });

  test('keeps or adds to the tag radio buttons (image-chg) after an upload', async ({ page }) => {
    const before = await page.locator('file-storage input[name="image-chg"]').count();
    await page.locator('file-storage input[type="file"][accept="image/*"]').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect
      .poll(() => page.locator('file-storage input[name="image-chg"]').count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(before);
  });
});

test.describe('uploading music (jukebox)', () => {
  test.beforeEach(async ({ page }) => {
    await openJukebox(page);
  });

  test('adds an item to the library when an MP3 file is uploaded', async ({ page }) => {
    // By default the library shows that this category has no music files, or nothing.
    const items = page.locator('app-jukebox .text-ui-text.truncate');
    const before = await items.count();
    await page.locator('app-jukebox input[type="file"][accept="audio/*"]').setInputFiles({
      name: 'tiny.mp3',
      mimeType: 'audio/mpeg',
      buffer: TINY_MP3,
    });
    // A new row (a div with the audio's name) appears in the library view.
    await expect.poll(() => items.count(), { timeout: 15000 }).toBeGreaterThan(before);
  });
});

test.describe('loading a ZIP or XML (save and load in the FAB)', () => {
  test('does not crash the app when an empty ZIP is given', async ({ page }) => {
    await waitAppReady(page);
    const fileInput = page.locator('[data-testid="fab-zip-input"]');
    await fileInput.setInputFiles({
      name: 'empty.zip',
      mimeType: 'application/zip',
      buffer: EMPTY_ZIP,
    });
    // Even if the load fails, the chat input should still show, which tells that the app is alive.
    await expect(chatInput(page)).toBeVisible({ timeout: 10000 });
  });
});
