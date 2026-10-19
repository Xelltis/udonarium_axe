import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { Page } from '@playwright/test';

import { openPanel } from '../helpers';
import {
  assetIdOf,
  createRoom,
  expect,
  joinRoom,
  leaveAll,
  openSeat,
  RoomServer,
  test,
  uniqueName,
} from './room-server';

// The room server's operator stopping uploads for a while: what is added meanwhile stays with the
// one who added it, who is told so, and reaches the others once the stop is over.

const OPERATOR = '100000000000000001';
const base64url = (value: string) => Buffer.from(value).toString('base64url');

/** A dashboard session the room server takes, as if Discord and a passkey had let the operator in. */
function operatorCookie(server: RoomServer): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({
      aud: 'admin',
      sub: OPERATOR,
      name: 'Operator',
      sid: randomUUID(),
      stage: 'passkey',
      epoch: 0,
      start: now,
      verified: now,
      exp: now + 600,
    })
  )}`;
  return `axe-admin=${body}.${createHmac('sha256', server.secret).update(body).digest('base64url')}`;
}

async function stopUploads(server: RoomServer, uploads: boolean): Promise<void> {
  const res = await fetch(`${server.apiUrl}/admin/api/pause`, {
    method: 'PUT',
    headers: { 'X-Admin-Request': '1', 'Content-Type': 'application/json', Cookie: operatorCookie(server) },
    body: JSON.stringify({ rooms: false, uploads, logins: false }),
  });
  expect(res.status).toBe(200);
}

function png(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const [r, g, b] = randomBytes(3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.from([0, ...Array.from({ length: 4 }, () => [r, g, b]).flat()]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 4 }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Whether any frame the page has received over the room's socket names the bytes. */
function watchFrames(page: Page, id: string): () => boolean {
  let seen = false;
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (Buffer.from(payload).includes(id)) seen = true;
    });
  });
  return () => seen;
}

test.describe('the operator stopping uploads', () => {
  test.setTimeout(240_000);

  test('an image added meanwhile reaches nobody else, the adder is told, and it reaches the room once the stop is over', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const bytes = png();
    const id = assetIdOf(bytes);
    const plSaw = watchFrames(pl.page, id);
    const plFetched: number[] = [];
    pl.page.on('response', (response) => {
      if (response.url().endsWith(`/assets/${id}`) && response.request().method() === 'GET') {
        plFetched.push(response.status());
      }
    });
    const room = uniqueName('止めた卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    await stopUploads(roomServer, true);
    try {
      await openPanel(gm.page, '画像');
      await gm.page
        .locator('file-storage input[type="file"][accept="image/*"]')
        .setInputFiles({ name: 'stopped.png', mimeType: 'image/png', buffer: bytes });

      await expect(gm.page.getByText('画像や音声を上げることを一時的に止めています')).toBeVisible({ timeout: 20_000 });
      // Longer than the tries an upload that failed for now used to spend before being named to peers.
      await gm.page.waitForTimeout(80_000);
      expect(plSaw()).toBe(false);
      expect(plFetched).toEqual([]);
    } finally {
      await stopUploads(roomServer, false);
    }

    await expect(gm.page.getByText('画像や音声を上げられるようになりました')).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => plFetched, { timeout: 30_000 }).toContain(200);
    await leaveAll(gm, pl);
  });
});
