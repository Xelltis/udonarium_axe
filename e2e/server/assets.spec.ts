import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { Page } from '@playwright/test';

import { openPanel } from '../helpers';
import { createRoom, expect, joinRoom, leaveAll, openSeat, RoomServer, test, uniqueName } from './room-server';

// Pictures and sounds on the room server: the Worker keeps them under the SHA-256 of their bytes,
// takes them only from somebody logged in, and hands them to anybody.

/** What a page asked of the asset store, and how it was answered. */
interface AssetCall {
  method: string;
  id: string;
  status: number;
  authorized: boolean;
}

/** Records every request a page makes of the room server's asset store. */
function watchAssets(page: Page, server: RoomServer): AssetCall[] {
  const calls: AssetCall[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.startsWith(`${server.apiUrl}/v1/assets/`)) return;
    const request = response.request();
    calls.push({
      method: request.method(),
      id: url.split('/').pop() ?? '',
      status: response.status(),
      authorized: (await request.headerValue('authorization'))?.startsWith('Bearer ') ?? false,
    });
  });
  return calls;
}

/** The upload a page made, once it has made one. */
async function uploadOf(calls: AssetCall[]): Promise<AssetCall> {
  await expect.poll(() => calls.some((call) => call.method === 'PUT'), { timeout: 20_000 }).toBe(true);
  return calls.find((call) => call.method === 'PUT') as AssetCall;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 4x4 PNG of one colour picked at random, so that no two tests upload the same bytes. */
function uniquePng(): Buffer {
  const [r, g, b] = randomBytes(3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.from([0, ...Array.from({ length: 4 }, () => [r, g, b]).flat()]);
  const pixels = Buffer.concat(Array.from({ length: 4 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

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

async function addImage(page: Page, name: string, bytes: Buffer): Promise<void> {
  await openPanel(page, '画像');
  await expect(page.locator('file-storage')).toBeVisible({ timeout: 10_000 });
  await page
    .locator('file-storage input[type="file"][accept="image/*"]')
    .setInputFiles({ name, mimeType: 'image/png', buffer: bytes });
}

async function addAudio(page: Page, name: string, bytes: Buffer): Promise<void> {
  await openPanel(page, 'ジュークボックス');
  await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10_000 });
  await page
    .locator('app-jukebox input[type="file"][accept="audio/*"]')
    .setInputFiles({ name, mimeType: 'audio/mpeg', buffer: bytes });
}

test.describe('部屋のサーバーのアセット', () => {
  test('ログインした人が足した画像は、トークン付きでサーバーに上がり、ほかの人はサーバーから受け取る', async ({
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
    expect(plCalls.every((call) => !call.authorized)).toBe(true);
    await leaveAll(gm, pl);
  });

  test('あとから入った人も、それまでに足された画像をサーバーから受け取る', async ({ browser, roomServer }) => {
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

  test('見学には画像を足す入り口が無い', async ({ browser, roomServer }) => {
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

  test('サーバーに上げられなかった画像も、部屋のサーバーの中継でほかの人に届く', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('中継の画像の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    // The upload fails, as it would on a dropped line or a login that cannot be refreshed.
    let refused = '';
    await gm.page.route(`${roomServer.apiUrl}/v1/assets/*`, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      refused = route.request().url().split('/').pop() ?? '';
      return route.fulfill({ status: 503, body: '' });
    });
    await openPanel(pl.page, '画像');
    await expect(pl.page.locator('file-storage')).toBeVisible({ timeout: 10_000 });
    const plImages = pl.page.locator('file-storage img');
    const before = await plImages.count();
    const plCalls = watchAssets(pl.page, roomServer);

    await addImage(gm.page, 'relayed.png', uniquePng());

    await expect.poll(() => refused, { timeout: 20_000 }).not.toBe('');
    await expect.poll(() => plImages.count(), { timeout: 30_000 }).toBeGreaterThan(before);
    expect(plCalls.filter((call) => call.id === refused).map((call) => `${call.method} ${call.status}`)).toEqual([
      'GET 404',
    ]);
    await leaveAll(gm, pl);
  });

  test('ログインした人が足した音声も、サーバーに上がり、ほかの人はサーバーから受け取る', async ({
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
