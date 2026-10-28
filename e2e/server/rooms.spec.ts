import { Page } from '@playwright/test';

import { chatInput } from '../helpers';
import {
  chatTabText,
  createRoom,
  expect,
  expectInRoom,
  joinRoom,
  leaveAll,
  loginFor,
  openLobby,
  openSeat,
  reloadLobby,
  roleShown,
  serverRole,
  test,
  uniqueName,
} from './room-server';

/** The role picker the GM's peer menu shows for the peer of this name. */
const rolePickerFor = (page: Page, name: string) =>
  page.locator('peer-menu div.border-t', { hasText: name }).locator('select');

test.describe('rooms and roles on the room server', () => {
  test('a logged-in user becomes GM of the room they make, and the server decides the PL and guest roles too', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const guest = await openSeat(browser, roomServer, '見学さん', null);
    const room = uniqueName('役割の卓');

    await openLobby(guest.page);
    await expect(guest.page.getByTestId('server-account-login')).toBeVisible();
    await expect(guest.page.getByTestId('lobby-create-room')).toContainText('ログインして');

    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    await joinRoom(guest.page, room);

    expect(await serverRole(gm.page)).toBe('GM');
    expect(await serverRole(pl.page)).toBe('PL');
    expect(await serverRole(guest.page)).toBe('見学');
    await leaveAll(gm, pl, guest);
  });

  test('the GM can change a participant’s role, but cannot make someone who is not logged in a PL', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const guest = await openSeat(browser, roomServer, '見学さん', null);
    const room = uniqueName('ロールの卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    await joinRoom(guest.page, room);

    await rolePickerFor(gm.page, 'PLさん').selectOption({ label: '見学' });
    await expect(roleShown(pl.page)).toHaveText('見学', { timeout: 10_000 });
    await rolePickerFor(gm.page, 'PLさん').selectOption({ label: 'PL' });
    await expect(roleShown(pl.page)).toHaveText('PL', { timeout: 10_000 });

    await rolePickerFor(gm.page, 'プレイヤー').selectOption({ label: 'PL' });
    await expect.poll(() => chatTabText(gm.page, 'システム'), { timeout: 10_000 }).toContain('ログインしていないため');
    expect(await serverRole(guest.page)).toBe('見学');
    await leaveAll(gm, pl, guest);
  });

  test('a player logged in steps out to watch, still watches on coming in again, and comes back', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('見学の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    expect(await serverRole(pl.page)).toBe('PL');

    await pl.page.getByTestId('peer-menu-watch').click();
    await expect(roleShown(pl.page)).toHaveText('見学', { timeout: 10_000 });
    await expect(rolePickerFor(gm.page, 'PLさん')).toHaveValue(/guest/, { timeout: 10_000 });

    await pl.page.reload();
    await expect(chatInput(pl.page)).toBeVisible({ timeout: 30_000 });
    await joinRoom(pl.page, room);
    await expect(roleShown(pl.page)).toHaveText('見学', { timeout: 20_000 });

    await pl.page.getByTestId('peer-menu-kept-role').click();
    await expect(roleShown(pl.page)).toHaveText('PL', { timeout: 10_000 });
    await expect(rolePickerFor(gm.page, 'PLさん')).toHaveValue(/pl/, { timeout: 10_000 });
    await leaveAll(gm, pl);
  });

  test('someone who joins by the GM’s invite link for a GM becomes a GM', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const room = uniqueName('招待の卓');
    await createRoom(gm.page, room);

    const link = gm.page.locator('peer-menu input[readonly]').first();
    await expect(gm.page.getByTestId('peer-menu-invite-expires')).toBeVisible({ timeout: 10_000 });
    const playerLink = await link.inputValue();
    await gm.page.getByTestId('peer-menu-invite-role-gm').click();
    // Until the server signs the GM's invitation, the link carries none at all, which lets anybody in
    // as a player; so the link is waited for with an invitation in it, and not the player's.
    const signedForGm = async () => {
      const value = await link.inputValue();
      return value !== playerLink && /[?&]i=/.test(value);
    };
    await expect.poll(signedForGm, { timeout: 10_000 }).toBe(true);
    const invitation = (await link.inputValue()).replace(/^https?:\/\/[^/]+\//, `${roomServer.appUrl}/`);

    const coGm = await openSeat(browser, roomServer, '副GMさん', loginFor(roomServer, '副GMさん'), invitation);
    await expectInRoom(coGm.page, room);

    await expect(roleShown(coGm.page)).toHaveText('GM', { timeout: 10_000 });
    await leaveAll(gm, coGm);
  });

  test('a login run out on the server is turned away with a reason', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const room = uniqueName('遅刻の卓');
    await createRoom(gm.page, room);
    // The client takes the token as fresh, but the server has seen it run out, and the made-up
    // refresh token gets no new one.
    const late = { ...loginFor(roomServer, '遅刻さん', -60), expiresAt: Date.now() + 900_000 };
    const seat = await openSeat(browser, roomServer, '遅刻さん', late);

    await reloadLobby(seat.page);
    await seat.page.locator('lobby tr', { hasText: room }).getByRole('button', { name: '接続' }).click();

    await expect
      .poll(() => chatTabText(seat.page, 'システム'), { timeout: 20_000 })
      .toContain('ログインの期限が切れた');
    await leaveAll(gm, seat);
  });
});

test.describe('deleting a room', () => {
  test('when the GM deletes the room from inside it, everyone goes back to waiting and the reason shows', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('中から削除');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    await expect(pl.page.getByTestId('peer-menu-delete-room')).toHaveCount(0);

    await gm.page.getByTestId('peer-menu-delete-room').click();
    await gm.page.getByRole('button', { name: '削除する' }).click();

    for (const seat of [gm, pl]) {
      await expect
        .poll(() => chatTabText(seat.page, 'システム'), { timeout: 15_000 })
        .toContain('部屋のGMか、部屋のサーバーの運営者が部屋を削除しました');
    }
    await reloadLobby(pl.page);
    await expect(pl.page.locator('lobby tr', { hasText: room })).toHaveCount(0);
    await leaveAll(gm, pl);
  });

  test('the lobby list shows a delete button only on rooms one is GM of, and pressing it takes the room off the list', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('一覧から削除');
    await createRoom(gm.page, room);
    // Back to waiting, outside the room, where the list is shown.
    await gm.page.reload();
    await expect(chatInput(gm.page)).toBeVisible({ timeout: 30_000 });

    await reloadLobby(gm.page);
    await reloadLobby(pl.page);
    const row = gm.page.locator('lobby tr', { hasText: room });
    await expect(row.getByTestId('lobby-delete-room')).toHaveCount(1);
    await expect(pl.page.locator('lobby tr', { hasText: room }).getByTestId('lobby-delete-room')).toHaveCount(0);

    await row.getByTestId('lobby-delete-room').click();
    await gm.page.getByRole('button', { name: '削除する' }).click();

    await expect(gm.page.getByTestId('lobby-deletion-notice')).toHaveText('部屋を削除しました');
    await expect(gm.page.locator('lobby tr', { hasText: room })).toHaveCount(0);
    await leaveAll(gm, pl);
  });
});
