import { ServerCredentials } from '@axe/core/network/connection';
import {
  AccessTokenRenewal,
  ASSET_TOKEN_MARGIN_MS,
  ASSET_TOKEN_WAIT_MS,
  AssetTokenRenewal,
  TOKEN_CHECK_MS,
} from '@axe/core/network/server/token-renewal';

describe('AccessTokenRenewal', () => {
  let credentials: ServerCredentials | null;
  let inRoom: boolean;
  let handed: string[];

  function renewal(): AccessTokenRenewal {
    return new AccessTokenRenewal({
      userId: () => 'acct_me',
      inRoom: () => inRoom,
      credentials: () => Promise.resolve(credentials),
      hand: (accessToken) => handed.push(accessToken),
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    credentials = { userId: 'acct_me', accessToken: 'token-1' };
    inRoom = true;
    handed = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hands the server a token the login refreshed, once', async () => {
    const tokens = renewal();
    tokens.carried = 'token-1';
    tokens.start();

    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
    expect(handed).toEqual([]);

    credentials = { userId: 'acct_me', accessToken: 'token-2' };
    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS * 2);

    expect(handed).toEqual(['token-2']);
    expect(tokens.carried).toBe('token-2');
    tokens.stop();
  });

  it('hands nothing over out of the room, or for a login that is now somebody else', async () => {
    const tokens = renewal();
    tokens.start();

    inRoom = false;
    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
    inRoom = true;
    credentials = { userId: 'acct_other', accessToken: 'token-2' };
    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);

    expect(handed).toEqual([]);
    tokens.stop();
  });

  it('checks no more once stopped', async () => {
    const tokens = renewal();
    tokens.start();
    tokens.stop();

    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS * 3);

    expect(handed).toEqual([]);
  });
});

describe('AssetTokenRenewal', () => {
  let inRoom: boolean;
  let clockOffset: number;
  let asked: number;

  function renewal(): AssetTokenRenewal {
    return new AssetTokenRenewal({ inRoom: () => inRoom, clockOffset: () => clockOffset, ask: () => asked++ });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    inRoom = true;
    clockOffset = 0;
    asked = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds the token handed over, and none for an empty one', () => {
    const tokens = renewal();

    tokens.take('asset-1', Date.now() + 60 * 60_000);
    expect(tokens.token).toBe('asset-1');
    tokens.take('', Date.now() + 60 * 60_000);
    expect(tokens.token).toBeNull();
  });

  it('asks for a fresh token once the one held is near its end by the server clock', () => {
    const tokens = renewal();
    clockOffset = 60_000;
    tokens.take('asset-1', Date.now() + ASSET_TOKEN_MARGIN_MS + 60_000 + TOKEN_CHECK_MS * 1.5);
    tokens.start();

    vi.advanceTimersByTime(TOKEN_CHECK_MS);
    expect(asked).toBe(0);
    vi.advanceTimersByTime(TOKEN_CHECK_MS);
    expect(asked).toBe(1);
    vi.advanceTimersByTime(TOKEN_CHECK_MS * 2);
    expect(asked).toBe(1);
    tokens.stop();
  });

  it('asks for none out of the room or without a token', () => {
    const tokens = renewal();
    tokens.start();
    vi.advanceTimersByTime(TOKEN_CHECK_MS);
    tokens.take('asset-1', Date.now());
    inRoom = false;
    vi.advanceTimersByTime(TOKEN_CHECK_MS);

    expect(asked).toBe(0);
    tokens.stop();
  });

  it('gives those waiting what they make of the fresh token once it comes, asking for it once', async () => {
    const tokens = renewal();
    const first = tokens.whenFresh(() => tokens.token);
    const second = tokens.whenFresh(() => `${tokens.token}!`);
    expect(asked).toBe(1);

    tokens.take('asset-2', Date.now() + 60 * 60_000);

    await expect(first).resolves.toBe('asset-2');
    await expect(second).resolves.toBe('asset-2!');
  });

  it('gives null when no token comes in time', async () => {
    const tokens = renewal();
    const waiting = tokens.whenFresh(() => tokens.token);

    await vi.advanceTimersByTimeAsync(ASSET_TOKEN_WAIT_MS);

    await expect(waiting).resolves.toBeNull();
  });

  it('lets those waiting go with what there is once released', async () => {
    const tokens = renewal();
    const waiting = tokens.whenFresh(() => 'left the room');

    tokens.release();

    await expect(waiting).resolves.toBe('left the room');
  });
});
