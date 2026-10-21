import { Page } from '@playwright/test';

import { openPanel } from '../helpers';
import { addImage, uniquePng, uniqueWav, uploadOf, watchAssets } from './asset-helpers';
import { assetIdOf, createRoom, expect, joinRoom, leaveAll, openSeat, test, uniqueName } from './room-server';

// The GM removing a picture or a sound from the room: it leaves every seat and the room's store,
// a seat that comes in later never takes it, and the same file added again brings it back.

/** The picture of that name in the image panel. */
const pictureIn = (page: Page, name: string) => page.locator(`file-storage img[alt="${name}"]`);

/** The row of the jukebox's library that names the sound. */
const soundRowIn = (page: Page, name: string) =>
  page
    .locator('app-jukebox div.border-b')
    .filter({ has: page.locator('select') })
    .filter({ has: page.getByText(name, { exact: true }) });

test.describe('the GM removing pictures and sounds from a room', () => {
  test.setTimeout(180_000);

  test('a picture leaves every seat and the store, stays away from a seat that comes later, and comes back when added again', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('消す卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    const plCalls = watchAssets(pl.page, roomServer);
    const bytes = uniquePng();
    const id = assetIdOf(bytes);

    await addImage(gm.page, 'removed.png', bytes);
    await uploadOf(gmCalls);
    await openPanel(pl.page, '画像');
    await expect(pictureIn(pl.page, 'removed.png')).toBeVisible({ timeout: 20_000 });

    await pictureIn(gm.page, 'removed.png').locator('xpath=..').click();
    await gm.page.getByTestId('file-storage-remove').click();
    await gm.page.getByRole('button', { name: '削除する' }).click();

    await expect(gm.page.getByText('1件の画像を削除しました')).toBeVisible({ timeout: 10_000 });
    await expect(pictureIn(gm.page, 'removed.png')).toHaveCount(0);
    await expect(pictureIn(pl.page, 'removed.png')).toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(() => gmCalls.some((call) => call.method === 'DELETE' && call.id === id && call.status === 204), {
        timeout: 15_000,
      })
      .toBe(true);

    const late = await openSeat(browser, roomServer, '後から来た人');
    const lateCalls = watchAssets(late.page, roomServer);
    await joinRoom(late.page, room);
    await openPanel(late.page, '画像');
    // Long enough for the catalogues and the room's list to come, which would have brought it.
    await late.page.waitForTimeout(8_000);
    expect(lateCalls.filter((call) => call.id === id)).toEqual([]);
    await expect(pictureIn(late.page, 'removed.png')).toHaveCount(0);

    plCalls.length = 0;
    await gm.page
      .locator('file-storage input[type="file"][accept="image/*"]')
      .setInputFiles({ name: 'removed.png', mimeType: 'image/png', buffer: bytes });

    await expect(pictureIn(pl.page, 'removed.png')).toBeVisible({ timeout: 20_000 });
    await expect(pictureIn(late.page, 'removed.png')).toBeVisible({ timeout: 20_000 });
    await leaveAll(gm, pl, late);
  });

  test('a sound leaves the jukebox of every seat, and a player is offered no way to remove one', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('音を消す卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    await openPanel(gm.page, 'ジュークボックス');
    await gm.page
      .locator('app-jukebox input[type="file"][accept="audio/*"]')
      .setInputFiles({ name: 'removed.wav', mimeType: 'audio/wav', buffer: uniqueWav() });
    await openPanel(pl.page, 'ジュークボックス');
    await expect(soundRowIn(pl.page, 'removed.wav')).toBeVisible({ timeout: 20_000 });
    await expect(soundRowIn(pl.page, 'removed.wav').getByTestId('jukebox-remove')).toHaveCount(0);

    await soundRowIn(gm.page, 'removed.wav').getByTestId('jukebox-remove').click();
    await gm.page.getByRole('button', { name: '削除する' }).click();

    await expect(gm.page.getByText('1件の音声を削除しました')).toBeVisible({ timeout: 10_000 });
    await expect(soundRowIn(pl.page, 'removed.wav')).toHaveCount(0, { timeout: 15_000 });
    await leaveAll(gm, pl);
  });
});
