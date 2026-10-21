import { randomBytes } from 'node:crypto';

import { Page } from '@playwright/test';

import { openPanel } from '../helpers';
import { addImage, askStore, ASSET_PATH, uniquePng, uploadOf, watchAssets } from './asset-helpers';
import { assetTokenFor, createRoom, expect, joinRoom, leaveAll, openSeat, test, uniqueName } from './room-server';

// Pictures and sounds on the room server: the Worker keeps each room's under the SHA-256 of their
// bytes, and hands them only to the room's seats, with the token the room gives them. Only a GM or
// a PL puts them up.

/** An ID3 header and a dummy MP3 frame, as in file-upload.spec.ts, with random bytes after it. */
function uniqueMp3(): Buffer {
  return Buffer.concat([
    Buffer.from(
      'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'base64'
    ),
    randomBytes(64),
  ]);
}

async function addAudio(page: Page, name: string, bytes: Buffer): Promise<void> {
  await openPanel(page, 'ジュークボックス');
  await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10_000 });
  await page
    .locator('app-jukebox input[type="file"][accept="audio/*"]')
    .setInputFiles({ name, mimeType: 'audio/mpeg', buffer: bytes });
}

test.describe('assets on the room server', () => {
  test('an image a logged-in user adds goes up to the server with a token, and the others take it from the server', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('画像の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    const plCalls = watchAssets(pl.page, roomServer);

    await addImage(gm.page, 'gm.png', uniquePng());

    const upload = await uploadOf(gmCalls);
    expect(upload).toMatchObject({ status: 201, authorized: true });
    await expect
      .poll(() => plCalls.some((call) => call.method === 'GET' && call.id === upload.id && call.status === 200), {
        timeout: 20_000,
      })
      .toBe(true);
    expect(plCalls.every((call) => call.authorized && call.roomKey === upload.roomKey)).toBe(true);
    await leaveAll(gm, pl);
  });

  test('a room’s images do not reach anyone without that room’s token', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const room = uniqueName('閉じた画像の卓');
    await createRoom(gm.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    await addImage(gm.page, 'closed.png', uniquePng());
    const { roomKey, id } = await uploadOf(gmCalls);
    const elsewhere = '0'.repeat(32);

    const seat = await askStore(roomServer, roomKey, id, `Bearer ${assetTokenFor(roomServer, roomKey, 'guest')}`);
    const none = await askStore(roomServer, roomKey, id);
    const otherRoom = await askStore(roomServer, roomKey, id, `Bearer ${assetTokenFor(roomServer, elsewhere, 'gm')}`);
    const otherPlace = await askStore(
      roomServer,
      elsewhere,
      id,
      `Bearer ${assetTokenFor(roomServer, elsewhere, 'gm')}`
    );

    expect([seat.status, none.status, otherRoom.status, otherPlace.status]).toEqual([200, 401, 401, 404]);
    await leaveAll(gm);
  });

  test('deleting a room takes its images off the server too', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const room = uniqueName('消える画像の卓');
    await createRoom(gm.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    await addImage(gm.page, 'gone.png', uniquePng());
    const { roomKey, id } = await uploadOf(gmCalls);
    const token = `Bearer ${assetTokenFor(roomServer, roomKey, 'gm')}`;
    expect((await askStore(roomServer, roomKey, id, token)).status).toBe(200);

    // The picture panel opened to add the picture lies over the peer menu.
    await gm.page.getByTestId('peer-menu-delete-room').dispatchEvent('click');
    await gm.page.getByRole('button', { name: '削除する' }).click();

    await expect.poll(async () => (await askStore(roomServer, roomKey, id, token)).status).toBe(404);
    await leaveAll(gm);
  });

  test('someone who joins later also takes the images added so far from the server', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const room = uniqueName('あとから入る卓');
    await createRoom(gm.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    await addImage(gm.page, 'before.png', uniquePng());
    const upload = await uploadOf(gmCalls);
    expect(upload.status).toBe(201);

    const pl = await openSeat(browser, roomServer, 'PLさん');
    const plCalls = watchAssets(pl.page, roomServer);
    await joinRoom(pl.page, room);

    await expect
      .poll(() => plCalls.some((call) => call.method === 'GET' && call.id === upload.id && call.status === 200), {
        timeout: 20_000,
      })
      .toBe(true);
    await leaveAll(gm, pl);
  });

  test('a guest has no way in to add images', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const guest = await openSeat(browser, roomServer, '見学さん', null);
    const room = uniqueName('見学の画像の卓');
    await createRoom(gm.page, room);
    await joinRoom(guest.page, room);

    await openPanel(guest.page, '画像');
    await expect(guest.page.locator('file-storage')).toBeVisible({ timeout: 10_000 });

    await expect(guest.page.locator('file-storage input[type="file"]')).toHaveCount(0);
    await leaveAll(gm, guest);
  });

  test('an image that could not go up to the server still reaches the others, relayed by the room server', async ({
    browser,
    roomServer,
  }) => {
    test.setTimeout(300_000);
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('中継の画像の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    // The upload fails, as it would on a dropped line or a login that cannot be refreshed.
    let refused = '';
    await gm.page.route(
      (url) => ASSET_PATH.test(url.pathname),
      async (route) => {
        if (route.request().method() !== 'PUT') return route.continue();
        refused = route.request().url().split('/').pop() ?? '';
        return route.fulfill({ status: 503, body: '' });
      }
    );
    await openPanel(pl.page, '画像');
    await expect(pl.page.locator('file-storage')).toBeVisible({ timeout: 10_000 });
    const plImages = pl.page.locator('file-storage img');
    const before = await plImages.count();
    const plCalls = watchAssets(pl.page, roomServer);

    await addImage(gm.page, 'relayed.png', uniquePng());

    await expect.poll(() => refused, { timeout: 20_000 }).not.toBe('');
    // It is named to the others only once the tries to put it up have been given up, ten, twenty and
    // forty seconds apart.
    await expect.poll(() => plImages.count(), { timeout: 150_000 }).toBeGreaterThan(before);
    const calls = () => plCalls.filter((call) => call.id === refused).map((call) => `${call.method} ${call.status}`);
    expect(calls()[0]).toBe('GET 404');
    // Whoever took it in puts it up to the server in its place.
    await expect.poll(calls, { timeout: 30_000 }).toContain('PUT 201');
    await leaveAll(gm, pl);
  });

  test('a sound a logged-in user adds also goes up to the server, and the others take it from the server', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('音声の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    const plCalls = watchAssets(pl.page, roomServer);

    await addAudio(gm.page, 'gm.mp3', uniqueMp3());

    const upload = await uploadOf(gmCalls);
    expect(upload).toMatchObject({ status: 201, authorized: true });
    await expect
      .poll(() => plCalls.some((call) => call.method === 'GET' && call.id === upload.id && call.status === 200), {
        timeout: 20_000,
      })
      .toBe(true);
    await leaveAll(gm, pl);
  });
});
