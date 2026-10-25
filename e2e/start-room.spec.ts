import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, openSaveLoad, revealMenuEntry, waitAppReady } from './helpers';

const ROW_EDGE = { x: 6, y: 6 };

/** A 1x1 transparent PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/** The smallest MP3 header, which is told by its type and never decoded. */
const TINY_MP3 = Buffer.from(
  'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'base64'
);

/** Opens the image panel and hands back the pictures it lists. */
async function openPictures(page: Page): Promise<Locator> {
  await openPanel(page, '画像');
  await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
  return page.locator('file-storage img');
}

/** Opens the jukebox and hands back the sounds it lists. */
async function openSounds(page: Page): Promise<Locator> {
  await openPanel(page, 'ジュークボックス');
  await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
  return page.locator('app-jukebox .text-ui-text.truncate');
}

/** Opens the inventory and hands back its graveyard tab, which says how many pieces lie there. */
async function graveyardTab(page: Page): Promise<Locator> {
  await openPanel(page, 'インベントリ');
  const tabs = page.locator('game-object-inventory form[name="game-object-inventory"] > label');
  await expect(tabs).toHaveCount(4, { timeout: 5000 });
  return tabs.nth(3);
}

test.describe('the room this browser starts on', () => {
  test('starts on the room kept here, and on the sample again once it is forgotten', async ({ page }) => {
    test.setTimeout(120_000);
    await waitAppReady(page);
    const graveyard = await graveyardTab(page);
    await expect(graveyard).toContainText(/墓場\s*0/);
    const rows = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await rows.first().click({ button: 'right', position: ROW_EDGE });
    const contextMenu = page.locator('context-menu');
    await expect(contextMenu.locator('li').first()).toBeVisible({ timeout: 3000 });
    await (await revealMenuEntry(page, contextMenu, '墓場に移動')).click();
    await expect(graveyard).toContainText(/墓場\s*1/);

    const menu = await openSaveLoad(page);
    await expect(menu.getByTestId('save-load-start-room-forget')).toBeDisabled();
    await menu.getByTestId('save-load-start-room-keep').click();
    await expect(page.getByText('次からこのブラウザでは、この部屋で始まります。')).toBeVisible({ timeout: 30_000 });

    await waitAppReady(page);
    await expect(await graveyardTab(page)).toContainText(/墓場\s*1/, { timeout: 15_000 });
    // The sample pieces' pictures are files the app carries rather than ones the save does.
    await expect(page.locator('game-character img[src*="piece_"]').first()).toBeAttached();

    const again = await openSaveLoad(page);
    await again.getByTestId('save-load-start-room-forget').click();
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    await expect(page.getByText('次からはサンプルの部屋で始まります。')).toBeVisible();

    await waitAppReady(page);
    await expect(await graveyardTab(page)).toContainText(/墓場\s*0/);
  });

  test('keeps the pictures and sounds added to the room, used anywhere or not', async ({ page }) => {
    test.setTimeout(120_000);
    await waitAppReady(page);
    const pictures = await openPictures(page);
    const picturesBefore = await pictures.count();
    await page.locator('file-storage input[type="file"][accept="image/*"]').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(pictures).toHaveCount(picturesBefore + 1, { timeout: 10_000 });
    const sounds = await openSounds(page);
    const soundsBefore = await sounds.count();
    await page.locator('app-jukebox input[type="file"][accept="audio/*"]').setInputFiles({
      name: 'tiny.mp3',
      mimeType: 'audio/mpeg',
      buffer: TINY_MP3,
    });
    await expect(sounds).toHaveCount(soundsBefore + 1, { timeout: 15_000 });

    const menu = await openSaveLoad(page);
    await menu.getByTestId('save-load-start-room-keep').click();
    await expect(page.getByText('次からこのブラウザでは、この部屋で始まります。')).toBeVisible({ timeout: 30_000 });

    await waitAppReady(page);
    await expect(await openPictures(page)).toHaveCount(picturesBefore + 1, { timeout: 15_000 });
    await expect(await openSounds(page)).toHaveCount(soundsBefore + 1, { timeout: 15_000 });
  });

  test('starts on the sample, and says so, where the room kept cannot be read', async ({ page }) => {
    await waitAppReady(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('axe-start-room', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('images');
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('images', 'readwrite');
            tx.objectStore('images').put(
              { type: 'application/zip', bytes: new Uint8Array([0, 1, 2, 3]).buffer },
              'room'
            );
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          request.onerror = () => reject(request.error);
        })
    );

    await waitAppReady(page);

    await expect(page.getByText('開始時の部屋を読み込めなかったので、サンプルの部屋で始めました。')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('game-character img[src*="piece_"]').first()).toBeAttached();
  });
});
