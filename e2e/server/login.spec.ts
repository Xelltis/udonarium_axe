import { BrowserContext } from '@playwright/test';

import {
  accessTokenFor,
  chatTabText,
  createRoom,
  expect,
  joinRoom,
  leaveAll,
  loginFor,
  openSeat,
  RoomServer,
  say,
  serverRole,
  StoredLogin,
  test,
  uniqueName,
} from './room-server';

// A login that runs out while its seat is in the room. The client treats an access token as stale a
// minute before it ends and checks every 30 seconds; the server closes a seat a minute after its
// token ended, when somebody next sends it anything.

/** How long the first access token runs: fresh when the seat says hello, stale by the first check. */
const TOKEN_SECONDS = 90;
/** Past the end of the first token and the server's minute of grace. */
const PAST_GRACE_MS = (TOKEN_SECONDS + 60 + 15) * 1000;

/**
 * Answers the client's token refreshes with a new pair, as the server would after a login through
 * Discord, which the tests cannot go through. Returns how many it answered.
 */
async function answerRefreshes(context: BrowserContext, server: RoomServer, login: StoredLogin): Promise<() => number> {
  let answered = 0;
  await context.route(`${server.apiUrl}/v1/auth/token`, (route) => {
    answered++;
    return route.fulfill({
      json: {
        accessToken: accessTokenFor(server, login.account.userId, login.account.name),
        expiresIn: 900,
        refreshToken: `e2e-refresh-${answered}`,
        account: login.account,
      },
    });
  });
  return () => answered;
}

test.describe('部屋にいるあいだにログインの期限が切れたとき', () => {
  test.setTimeout(300_000);

  test('更新したアクセストークンを部屋のサーバーに渡し、席はそのまま残る', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const login = loginFor(roomServer, 'PLさん', TOKEN_SECONDS);
    const pl = await openSeat(browser, roomServer, 'PLさん', login);
    const refreshed = await answerRefreshes(pl.context, roomServer, login);
    const room = uniqueName('更新の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    await pl.page.waitForTimeout(PAST_GRACE_MS);
    await say(gm.page, '更新の確認');

    expect(refreshed()).toBeGreaterThan(0);
    await expect.poll(() => chatTabText(pl.page, 'メイン'), { timeout: 15_000 }).toContain('更新の確認');
    expect(await serverRole(pl.page)).toBe('PL');
    expect(await chatTabText(pl.page, 'システム')).not.toContain('ログインの期限が切れた');
    await leaveAll(gm, pl);
  });

  test('更新できなければ、サーバーが席を閉じて理由が出る', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん', loginFor(roomServer, 'PLさん', TOKEN_SECONDS));
    // The server cannot be reached for a refresh, so the login stands but the token is not renewed.
    await pl.context.route(`${roomServer.apiUrl}/v1/auth/token`, (route) => route.fulfill({ status: 503, body: '' }));
    const room = uniqueName('切れる卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    await pl.page.waitForTimeout(PAST_GRACE_MS);
    await say(gm.page, '期限の確認');

    await expect.poll(() => chatTabText(pl.page, 'システム'), { timeout: 20_000 }).toContain('ログインの期限が切れた');
    await leaveAll(gm, pl);
  });
});
