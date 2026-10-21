import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { Page } from '@playwright/test';

import { openPanel } from '../helpers';
import { addImage, uniquePng, uniqueWav } from './asset-helpers';
import {
  assetIdOf,
  chatTabText,
  createRoom,
  expect,
  joinRoom,
  leaveAll,
  openSeat,
  RoomServer,
  StoredLogin,
  test,
  uniqueName,
} from './room-server';

// The room server's operator stopping uploads for a while: what is added meanwhile stays with the
// one who added it, who is told so, and reaches the others once the stop is over. And the operator
// banning someone in a room: their seat is closed, and they are told why.

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

/** A login as a Discord account, which the operator can ban by its id, as only a Discord login can be. */
function discordLogin(server: RoomServer, name: string, discordId: string): StoredLogin {
  const userId = `acct_${randomUUID()}`;
  const expiresAt = Date.now() + 900_000;
  const body = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({ aud: 'access', sub: `discord:${discordId}`, uid: userId, name, exp: Math.floor(expiresAt / 1000) })
  )}`;
  return {
    accessToken: `${body}.${createHmac('sha256', server.secret).update(body).digest('base64url')}`,
    expiresAt,
    refreshToken: `e2e-refresh-${randomUUID()}`,
    account: { userId, name, avatarUrl: null },
  };
}

async function ban(server: RoomServer, discordId: string): Promise<void> {
  const res = await fetch(`${server.apiUrl}/admin/api/bans`, {
    method: 'POST',
    headers: { 'X-Admin-Request': '1', 'Content-Type': 'application/json', Cookie: operatorCookie(server) },
    body: JSON.stringify({ kind: 'discord', value: discordId }),
  });
  expect(res.status).toBe(201);
}

async function unban(server: RoomServer, discordId: string): Promise<void> {
  const res = await fetch(`${server.apiUrl}/admin/api/bans?kind=discord&value=${discordId}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Request': '1', Cookie: operatorCookie(server) },
  });
  expect(res.status).toBe(204);
}

async function stopUploads(server: RoomServer, uploads: boolean): Promise<void> {
  const res = await fetch(`${server.apiUrl}/admin/api/pause`, {
    method: 'PUT',
    headers: { 'X-Admin-Request': '1', 'Content-Type': 'application/json', Cookie: operatorCookie(server) },
    body: JSON.stringify({ rooms: false, uploads, logins: false }),
  });
  expect(res.status).toBe(200);
}

/** A report as the operator's dashboard lists it. */
interface ListedReport {
  target: string;
  assetId: string | null;
  reason: string;
  reporter: { role: string };
}

async function listReports(server: RoomServer): Promise<ListedReport[]> {
  const res = await fetch(`${server.apiUrl}/admin/api/reports`, {
    headers: { 'X-Admin-Request': '1', Cookie: operatorCookie(server) },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { reports: ListedReport[] }).reports;
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
    const bytes = uniquePng();
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
      await expect(gm.page.getByRole('button', { name: '問い合わせ先' })).toBeVisible();
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

test.describe('the operator banning someone in a room', () => {
  test('closes their seat and tells them the operator blocked them, rather than that their login ran out', async ({
    browser,
    roomServer,
  }) => {
    const discordId = `2${randomBytes(8).readBigUInt64BE().toString().padStart(17, '0').slice(0, 17)}`;
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん', discordLogin(roomServer, 'PLさん', discordId));
    const room = uniqueName('BANの卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    await ban(roomServer, discordId);
    try {
      await expect
        .poll(() => chatTabText(pl.page, 'システム'), { timeout: 15_000 })
        .toContain('このアカウントか回線を止めているため、部屋に入れません');
      expect(await chatTabText(pl.page, 'システム')).not.toContain('ログインの期限が切れた');
      await expect
        .poll(() => chatTabText(pl.page, 'システム'), { timeout: 15_000 })
        .toContain('問い合わせ先：admin@example.com');
    } finally {
      await unban(roomServer, discordId);
    }
    await leaveAll(gm, pl);
  });
});

test.describe('a room whose store is full', () => {
  test.setTimeout(180_000);

  test('tells the one who adds a sound past the limit that it is not kept, while those in the room still get it', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('満杯の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    await openPanel(gm.page, 'ジュークボックス');
    await gm.page
      .locator('app-jukebox input[type="file"][accept="audio/*"]')
      .setInputFiles({ name: 'big.wav', mimeType: 'audio/wav', buffer: uniqueWav(1_200_000) });

    await expect(gm.page.getByText('部屋の置き場所がいっぱいで')).toBeVisible({ timeout: 30_000 });
    await openPanel(pl.page, 'ジュークボックス');
    await expect(pl.page.locator('app-jukebox').getByText('big.wav')).toBeVisible({ timeout: 60_000 });
    await leaveAll(gm, pl);
  });
});

test.describe('reporting to the operator', () => {
  test('a player reports a picture from the image panel, and the operator reads it with who sent it', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('通報の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    const bytes = uniquePng();
    const id = assetIdOf(bytes);
    await addImage(gm.page, 'reported.png', bytes);

    await openPanel(pl.page, '画像');
    const tile = pl.page.locator('file-storage').getByText('reported.png', { exact: true }).locator('xpath=..');
    await tile.getByTestId('file-storage-report').click({ timeout: 20_000 });
    await pl.page.getByTestId('report-reason').fill('作者に断らずに置いています');
    await pl.page.getByTestId('report-send').click();

    await expect(pl.page.getByTestId('report-taken')).toContainText('受付番号', { timeout: 10_000 });
    const reports = await listReports(roomServer);
    expect(reports.find((report) => report.assetId === id)).toMatchObject({
      target: 'asset',
      reason: '作者に断らずに置いています',
      reporter: { role: 'pl' },
    });
    await leaveAll(gm, pl);
  });
});
