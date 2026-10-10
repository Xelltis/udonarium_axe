import {
  joinUnderOwnName,
  SAME_NAME_MEMBER_ERROR,
  SameNameMemberError,
  sameNameMemberWait$,
  SameNameWaitCancelledError,
  waitForNameToLeave,
} from '@axe/core/network/skyway/same-name-member';

/** A channel whose members can be made to leave, as the SDK reports it. */
function fakeChannel(names: string[]) {
  const listeners = new Set<(event: { member: { name: string } }) => void>();
  const channel = {
    members: names.map((name) => ({ name })),
    onMemberLeft: {
      add(callback: (event: { member: { name: string } }) => void) {
        listeners.add(callback);
        return { removeListener: () => listeners.delete(callback) };
      },
    },
    leave(name: string) {
      channel.members = channel.members.filter((member) => member.name !== name);
      for (const listener of [...listeners]) listener({ member: { name } });
    },
    listening: () => listeners.size,
  };
  return channel;
}

function refusal(): Error {
  const error = new Error('Channelにすでに同じNameのMemberが存在します');
  error.name = 'alreadySameNameMemberExist';
  return error;
}

describe('waiting for a member under this peer’s own name to go', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes on at once where nobody holds the name', async () => {
    await expect(waitForNameToLeave(fakeChannel(['other']), 'me', Date.now() + 1000)).resolves.toBeUndefined();
  });

  it('goes on as soon as the member under the name leaves, and stops listening', async () => {
    const channel = fakeChannel(['me', 'other']);
    const waited = waitForNameToLeave(channel, 'me', Date.now() + 60_000);

    channel.leave('other');
    vi.advanceTimersByTime(10_000);
    channel.leave('me');

    await expect(waited).resolves.toBeUndefined();
    expect(channel.listening()).toBe(0);
  });

  it('gives up at the deadline with an error of its own type', async () => {
    const channel = fakeChannel(['me']);
    const waited = waitForNameToLeave(channel, 'me', Date.now() + 5000);
    vi.advanceTimersByTime(5000);

    await expect(waited).rejects.toBeInstanceOf(SameNameMemberError);
    await expect(waited).rejects.toHaveProperty('name', SAME_NAME_MEMBER_ERROR);
    expect(channel.listening()).toBe(0);
  });

  it('is called off by the signal', async () => {
    const abort = new AbortController();
    const waited = waitForNameToLeave(fakeChannel(['me']), 'me', Date.now() + 60_000, abort.signal);
    abort.abort();

    await expect(waited).rejects.toBeInstanceOf(SameNameWaitCancelledError);
  });
});

describe('joining under this peer’s own name', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('joins at once where the name is free, without saying it waited', async () => {
    const said: boolean[] = [];
    const off = sameNameMemberWait$.subscribe((event) => said.push(event.waiting));
    const join = vi.fn(async () => 'joined');

    await expect(joinUnderOwnName(fakeChannel([]), 'me', join, Date.now() + 1000)).resolves.toBe('joined');
    expect(join).toHaveBeenCalledTimes(1);
    expect(said).toEqual([]);
    off();
  });

  it('waits for what a reload left behind to go, then joins, saying when it starts and stops waiting', async () => {
    const said: boolean[] = [];
    const off = sameNameMemberWait$.subscribe((event) => said.push(event.waiting));
    const channel = fakeChannel(['me']);
    const join = vi.fn(async () => 'joined');

    const joined = joinUnderOwnName(channel, 'me', join, Date.now() + 65_000);
    await Promise.resolve();
    expect(join).not.toHaveBeenCalled();
    expect(said).toEqual([true]);

    vi.advanceTimersByTime(40_000);
    channel.leave('me');

    await expect(joined).resolves.toBe('joined');
    expect(said).toEqual([true, false]);
    off();
  });

  it('waits again when the join is refused for a member that came back under the name', async () => {
    const channel = fakeChannel([]);
    const join = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(async () => {
        channel.members = [{ name: 'me' }];
        throw refusal();
      })
      .mockResolvedValue('joined');

    const joined = joinUnderOwnName(channel, 'me', join, Date.now() + 65_000);
    await vi.advanceTimersByTimeAsync(1000);
    channel.leave('me');

    await expect(joined).resolves.toBe('joined');
    expect(join).toHaveBeenCalledTimes(2);
  });

  it('gives up with its own error when the member stays past the deadline, and passes other errors on', async () => {
    const stays = joinUnderOwnName(fakeChannel(['me']), 'me', async () => 'joined', Date.now() + 65_000);
    const settled = expect(stays).rejects.toBeInstanceOf(SameNameMemberError);
    await vi.advanceTimersByTimeAsync(65_000);
    await settled;

    const broken = new Error('network down');
    await expect(
      joinUnderOwnName(fakeChannel([]), 'me', () => Promise.reject(broken), Date.now() + 65_000)
    ).rejects.toBe(broken);
  });
});
