import { ChildProcess, spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Browser, BrowserContext, expect, Page, test as base } from '@playwright/test';

/**
 * The room server project runs the backend's Cloudflare Worker under `wrangler dev`, next to a
 * build served with a config that points at it, and plays a room in several browsers at once.
 *
 * It needs udonarium_axe_backend checked out next to this repository (or AXE_BACKEND_DIR pointing
 * at its apps/cloudflare) with its dependencies installed, and a build in dist. Each worker starts
 * a Worker of its own, with its storage in a temporary folder and its rate limits raised: the
 * tests create and join rooms far faster than people do, from the one address.
 */
const BACKEND_DIR =
  process.env['AXE_BACKEND_DIR'] ?? resolve(__dirname, '../../../udonarium_axe_backend/apps/cloudflare');

const LOGIN_STORAGE_KEY = 'udonarium-axe.server-login';

/** A room server started for one worker. */
export interface RoomServer {
  /** The page to open: the build, served with a config that points at the room server. */
  readonly appUrl: string;
  /** The room server's API. */
  readonly apiUrl: string;
  /** The key the room server signs its tokens with, so the tests can log people in without Discord. */
  readonly secret: string;
}

/** A login as the client keeps it in storage. */
export interface StoredLogin {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  account: { userId: string; name: string; avatarUrl: string | null };
}

/** One person at the table: their own browser context, page and, when logged in, account. */
export interface Seat {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly name: string;
  readonly login: StoredLogin | null;
}

interface WranglerConfig {
  $schema?: string;
  main: string;
  vars?: Record<string, string>;
  ratelimits?: { simple: { limit: number } }[];
}

/** Reads JSON with comments and trailing commas, as a wrangler.jsonc holds, leaving strings alone. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(dropTrailingCommas(dropComments(text)));
}

/** Calls `keep` for each character outside a string, and copies the rest as it is. */
function outsideStrings(text: string, keep: (index: number) => { skipTo: number; write: string }): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      out += text.slice(i, end + 1);
      i = end;
      continue;
    }
    const { skipTo, write } = keep(i);
    out += write;
    i = skipTo;
  }
  return out;
}

function dropComments(text: string): string {
  return outsideStrings(text, (i) => {
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      return { skipTo: end < 0 ? text.length : end - 1, write: '' };
    }
    if (text.startsWith('/*', i)) return { skipTo: text.indexOf('*/', i + 2) + 1, write: '' };
    return { skipTo: i, write: text[i] };
  });
}

function dropTrailingCommas(text: string): string {
  return outsideStrings(text, (i) =>
    text[i] === ',' && /^\s*[}\]]/.test(text.slice(i + 1)) ? { skipTo: i, write: '' } : { skipTo: i, write: text[i] }
  );
}

async function waitUntilAnswering(url: string, headers: Record<string, string>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { headers })).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer within ${timeoutMs} ms`);
}

function stopGroup(child: ChildProcess): void {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function startRoomServer(index: number): Promise<{ server: RoomServer; stop: () => void }> {
  if (!existsSync(join(BACKEND_DIR, 'wrangler.jsonc'))) {
    throw new Error(
      `The room server tests run the Worker in ${BACKEND_DIR}. Check out udonarium_axe_backend next to this ` +
        'repository and install its dependencies, or point AXE_BACKEND_DIR at its apps/cloudflare.'
    );
  }
  const apiPort = 18790 + index;
  const appPort = 14310 + index;
  // wrangler's debugger listens on a port of its own too, which two Workers cannot share.
  const inspectorPort = 19230 + index;
  const appUrl = `http://localhost:${appPort}`;
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const secret = randomBytes(32).toString('base64url');
  const dir = mkdtempSync(join(tmpdir(), 'axe-room-server-'));

  // A copy of the Worker's config in the temporary folder, which also keeps wrangler from reading
  // the .dev.vars next to the real one.
  const config = parseJsonc(readFileSync(join(BACKEND_DIR, 'wrangler.jsonc'), 'utf8')) as WranglerConfig;
  delete config.$schema;
  config.main = join(BACKEND_DIR, config.main);
  config.vars = { ...config.vars, ACCESS_CONTROL_ALLOW_ORIGIN: appUrl };
  for (const limiter of config.ratelimits ?? []) limiter.simple.limit = 1_000_000;
  writeFileSync(join(dir, 'wrangler.json'), JSON.stringify(config, null, 2));

  const logPath = join(dir, 'wrangler.log');
  const log = openSync(logPath, 'w');
  const worker = spawn(
    'npx',
    [
      'wrangler',
      'dev',
      '--config',
      join(dir, 'wrangler.json'),
      '--port',
      String(apiPort),
      '--ip',
      '127.0.0.1',
      '--inspector-port',
      String(inspectorPort),
      '--persist-to',
      join(dir, 'state'),
      '--var',
      `SESSION_SECRET:${secret}`,
      '--var',
      'DISCORD_CLIENT_ID:e2e',
      '--var',
      'DISCORD_CLIENT_SECRET:e2e',
    ],
    {
      cwd: BACKEND_DIR,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    }
  );
  const app = spawn(process.execPath, [resolve(__dirname, '../serve-dist.mjs')], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      E2E_PORT: String(appPort),
      E2E_CONFIG: JSON.stringify({ transport: 'server', backend: { url: apiUrl }, assets: { url: '' } }),
    },
  });
  const stop = () => {
    stopGroup(worker);
    stopGroup(app);
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    await waitUntilAnswering(`${apiUrl}/v1/auth/config`, { Origin: appUrl }, 120_000);
    await waitUntilAnswering(appUrl, {}, 30_000);
  } catch (reason) {
    const tail = existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-3000) : '';
    stop();
    throw new Error(`${String(reason)}\n--- wrangler ---\n${tail}`, { cause: reason });
  }
  return { server: { appUrl, apiUrl, secret }, stop };
}

export const test = base.extend<object, { roomServer: RoomServer }>({
  roomServer: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const { server, stop } = await startRoomServer(workerInfo.parallelIndex);
      try {
        await use(server);
      } finally {
        stop();
      }
    },
    { scope: 'worker', timeout: 180_000 },
  ],
});

export { expect };

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** An access token the room server takes, for an account it has never seen: Discord is not asked. */
export function accessTokenFor(server: RoomServer, userId: string, name: string, seconds = 900): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      aud: 'access',
      sub: `discord:e2e-${userId}`,
      uid: userId,
      name,
      exp: Math.floor(Date.now() / 1000) + seconds,
    })
  );
  const body = `${header}.${payload}`;
  return `${body}.${createHmac('sha256', server.secret).update(body).digest('base64url')}`;
}

/** An asset token the room server would hand a seat of the room in this role, for checking from outside. */
export function assetTokenFor(server: RoomServer, roomKey: string, role: 'gm' | 'pl' | 'guest'): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ aud: 'asset', room: roomKey, role, uid: 'acct_e2e', exp: Math.floor(Date.now() / 1000) + 900 })
  );
  const body = `${header}.${payload}`;
  return `${body}.${createHmac('sha256', server.secret).update(body).digest('base64url')}`;
}

/**
 * A login as the client keeps it. The access token runs for `seconds`; the refresh token is made
 * up, as only a login through Discord gets a real one, so a refresh fails unless a test answers it.
 */
export function loginFor(
  server: RoomServer,
  name: string,
  seconds = 900,
  userId = `acct_${randomUUID()}`
): StoredLogin {
  return {
    accessToken: accessTokenFor(server, userId, name, seconds),
    expiresAt: Date.now() + seconds * 1000,
    refreshToken: `e2e-refresh-${randomUUID()}`,
    account: { userId, name, avatarUrl: null },
  };
}

/**
 * Opens the app in a context of its own, logged in with `login` unless it is null, at `url` (an
 * invitation link, say). The login is put in storage before the first load only, so that a reload
 * keeps whatever the page made of it.
 */
export async function openSeat(
  browser: Browser,
  server: RoomServer,
  name: string,
  login: StoredLogin | null = loginFor(server, name),
  url = server.appUrl
): Promise<Seat> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  if (login) {
    await context.addInitScript(
      ([key, value]) => {
        if (sessionStorage.getItem('e2e-login-seeded')) return;
        localStorage.setItem(key, value);
        sessionStorage.setItem('e2e-login-seeded', '1');
      },
      [LOGIN_STORAGE_KEY, JSON.stringify(login)] as const
    );
  }
  const page = await context.newPage();
  await page.goto(url, { timeout: 45_000 });
  await expect(page.locator('textarea.chat-input')).toBeVisible({ timeout: 30_000 });
  return { context, page, name, login };
}

/** A room name no other test in the worker uses. */
export function uniqueName(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 6)}`;
}

/** Opens the lobby from the peer menu, unless it is open already. */
export async function openLobby(page: Page): Promise<void> {
  const lobby = page.locator('lobby');
  if (!(await lobby.isVisible()))
    await page
      .getByRole('button', { name: /ロビー/ })
      .first()
      .click();
  await expect(lobby).toBeVisible({ timeout: 10_000 });
}

/**
 * Lists the rooms afresh in the lobby. The lobby lists them by itself as it opens, and holds the
 * button back until that is done, which takes the Worker a while under load; the lobby gives up
 * after 15 seconds, so the button is waited for a little longer.
 */
export async function reloadLobby(page: Page): Promise<void> {
  await openLobby(page);
  const reload = page.locator('lobby').getByRole('button', { name: /一覧を更新/ });
  await expect(reload).toBeEnabled({ timeout: 20_000 });
  await reload.click();
  await expect(reload).toBeEnabled({ timeout: 20_000 });
}

/** Creates a room from the lobby, and waits until its creator is in it. */
export async function createRoom(page: Page, name: string): Promise<void> {
  await openLobby(page);
  await page.getByTestId('lobby-create-room').click();
  await page.locator('input[name="room-name"]').fill(name);
  await page.getByTestId('room-setting-create').click();
  await expectInRoom(page, name);
}

/** Joins a room from the lobby's list, and waits until in it. */
export async function joinRoom(page: Page, name: string): Promise<void> {
  await reloadLobby(page);
  await page.locator('lobby tr', { hasText: name }).getByRole('button', { name: '接続' }).click();
  await expectInRoom(page, name);
}

/**
 * Waits until the peer menu shows the page in the room and online. A room's first seat wakes its
 * Durable Object, which takes the Worker a while under load.
 */
export async function expectInRoom(page: Page, name: string): Promise<void> {
  await expect(page.locator('peer-menu')).toContainText(name, { timeout: 40_000 });
  await expect(page.getByTestId('peer-menu-server-role')).toBeVisible({ timeout: 20_000 });
}

/** The role the server gave the page's seat, as the peer menu shows it. */
export async function serverRole(page: Page): Promise<string> {
  return ((await page.getByTestId('peer-menu-server-role').textContent()) ?? '').trim();
}

/** Says a line in the chat. */
export async function say(page: Page, text: string): Promise<void> {
  const input = page.locator('textarea.chat-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
}

/** The text of the chat window's tab with this label, once it is shown. */
export async function chatTabText(page: Page, label: string): Promise<string> {
  await page.locator('chat-window .chat-tab-pill', { hasText: label }).first().dispatchEvent('click');
  return (await page.locator('chat-window').first().innerText()).replace(/\n/g, ' / ');
}

/** Closes every seat's context. */
export async function leaveAll(...seats: Seat[]): Promise<void> {
  await Promise.all(seats.map((seat) => seat.context.close()));
}

/** The name a file's bytes are kept under on the asset server. */
export function assetIdOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
