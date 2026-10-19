import { PeerContext } from '@axe/core/network/peer-context';
import { SAME_NAME_MEMBER_WAIT_MS, SameNameWaitCancelledError } from '@axe/core/network/skyway/same-name-member';
import { SkyWayBackend } from '@axe/core/network/skyway/skyway-backend';
import { SkyWayFacade } from '@axe/core/network/skyway/skyway-facade';
import { SkyWayContext } from '@skyway-sdk/core';

describe('SkyWayFacade', () => {
  it('is exported', () => {
    expect(SkyWayFacade).toBeDefined();
  });

  it('the properties it starts with', () => {
    const facade = new SkyWayFacade();
    expect(facade.url).toBe('');
    expect(facade.peer).toBeDefined();
    expect(facade.isOpen).toBe(false);
  });

  describe('leaveImmediately', () => {
    it('carries its methods', () => {
      const facade = new SkyWayFacade();
      expect(typeof facade.leaveImmediately).toBe('function');
    });

    it('survives with neither member set', () => {
      const facade = new SkyWayFacade();
      expect(() => facade.leaveImmediately()).not.toThrow();
    });
  });

  describe('rejoinAfterLeave', () => {
    it('carries its methods', () => {
      const facade = new SkyWayFacade();
      expect(typeof facade.rejoinAfterLeave).toBe('function');
    });

    it('returns early with no context', async () => {
      const facade = new SkyWayFacade();
      await expect(facade.rejoinAfterLeave()).resolves.toBeUndefined();
    });

    it('clears a member that has left before rejoining', async () => {
      const facade = new SkyWayFacade();
      // set up a member that has left
      (facade as unknown as Record<string, unknown>).roomPerson = { state: 'left' };
      (facade as unknown as Record<string, unknown>).lobbyPerson = { state: 'left' };
      // returns early with no context and nothing goes wrong
      await expect(facade.rejoinAfterLeave()).resolves.toBeUndefined();
    });
  });
});

describe('starts with its fields empty', () => {
  it('starts with no context', () => {
    const facade = new SkyWayFacade();
    expect(facade.context).toBeNull();
  });

  it('starts with no open handler', () => {
    const facade = new SkyWayFacade();
    expect(facade.onOpen).toBeNull();
  });

  it('starts with no close handler', () => {
    const facade = new SkyWayFacade();
    expect(facade.onClose).toBeNull();
  });
});

describe('clearing away the listeners', () => {
  it('drops the close listeners on leaving the lobby', async () => {
    const removeAllListenersSpy = vi.fn();
    const disposeSpy = vi.fn();

    const facade = new SkyWayFacade();
    (facade as unknown as Record<string, unknown>).lobby = {
      onClosed: { removeAllListeners: removeAllListenersSpy },
      dispose: disposeSpy,
    };

    await (facade as unknown as { leaveLobbyChannel: () => Promise<void> }).leaveLobbyChannel();

    expect(removeAllListenersSpy).toHaveBeenCalled();
    expect(disposeSpy).toHaveBeenCalled();
    expect((facade as unknown as Record<string, unknown>).lobby).toBeNull();
  });

  it('drops the subscription listeners on closing the room stream', async () => {
    const removeAllListenersSpy = vi.fn();
    const unpublishSpy = vi.fn();

    const facade = new SkyWayFacade();
    (facade as unknown as Record<string, unknown>).publication = {
      onSubscribed: { removeAllListeners: removeAllListenersSpy },
    };
    (facade as unknown as Record<string, unknown>).roomPerson = { unpublish: unpublishSpy };

    await (facade as unknown as { closeRoomDataStream: () => Promise<void> }).closeRoomDataStream();

    expect(removeAllListenersSpy).toHaveBeenCalled();
    expect(unpublishSpy).toHaveBeenCalled();
    expect((facade as unknown as Record<string, unknown>).publication).toBeNull();
  });
});

describe('joining the room under its own name', () => {
  function roomWith(names: string[]) {
    const listeners = new Set<(event: { member: { name: string } }) => void>();
    const room = {
      members: names.map((name) => ({ name })),
      onMemberLeft: {
        add(callback: (event: { member: { name: string } }) => void) {
          listeners.add(callback);
          return { removeListener: () => listeners.delete(callback) };
        },
      },
      join: vi.fn(async () => ({ onFatalError: { add: vi.fn() } })),
      leave(name: string) {
        room.members = room.members.filter((member) => member.name !== name);
        for (const listener of [...listeners]) listener({ member: { name } });
      },
    };
    return room;
  }

  function facadeIn(room: ReturnType<typeof roomWith>, abort: AbortController): SkyWayFacade {
    const facade = new SkyWayFacade();
    const peer = PeerContext.parse('me');
    peer.roomId = 'r1';
    Object.assign(facade as unknown as Record<string, unknown>, {
      peer,
      room,
      context: { disposed: false },
      openAbort: abort,
      joinDeadline: Date.now() + SAME_NAME_MEMBER_WAIT_MS,
    });
    return facade;
  }

  const joinRoomPerson = (facade: SkyWayFacade) =>
    (facade as unknown as { joinRoomPerson: () => Promise<void> }).joinRoomPerson();

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for what a reload left under its name to go before joining', async () => {
    const room = roomWith(['me']);
    const joined = joinRoomPerson(facadeIn(room, new AbortController()));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(room.join).not.toHaveBeenCalled();

    room.leave('me');
    await joined;
    expect(room.join).toHaveBeenCalledOnce();
  });

  it('calls the wait off when the open is', async () => {
    const room = roomWith(['me']);
    const abort = new AbortController();
    const joined = joinRoomPerson(facadeIn(room, abort));

    abort.abort();

    await expect(joined).rejects.toBeInstanceOf(SameNameWaitCancelledError);
    expect(room.join).not.toHaveBeenCalled();
  });
});

describe('a token that comes back empty', () => {
  afterEach(() => vi.restoreAllMocks());

  function opening(): { facade: SkyWayFacade; answer: (token: string) => void; done: Promise<void> } {
    let answer: (token: string) => void = () => undefined;
    vi.spyOn(SkyWayBackend.prototype, 'createSkyWayAuthToken').mockReturnValue(
      new Promise((resolve) => (answer = resolve))
    );
    const facade = new SkyWayFacade();
    facade.onFatalError = vi.fn();
    facade.onOpen = vi.fn();
    const done = facade.open(PeerContext.parse('standby'));
    return { facade, answer: (token) => answer(token), done };
  }

  it('is said to be a server error while the connection still opens, which then does not open', async () => {
    const { facade, answer, done } = opening();
    await vi.waitFor(() => expect(SkyWayBackend.prototype.createSkyWayAuthToken).toHaveBeenCalled());

    answer('');
    await done;

    expect(facade.onOpen).not.toHaveBeenCalled();
    expect(facade.isOpen).toBe(false);

    expect(facade.onFatalError).toHaveBeenCalledWith(
      expect.anything(),
      'server-error',
      expect.any(String),
      expect.any(Error)
    );
  });

  it('lets go of a context made after the connection was closed meanwhile', async () => {
    vi.spyOn(SkyWayBackend.prototype, 'createSkyWayAuthToken').mockResolvedValue('token');
    let made: (context: SkyWayContext) => void = () => undefined;
    vi.spyOn(SkyWayContext, 'Create').mockReturnValue(new Promise((resolve) => (made = resolve)));
    const facade = new SkyWayFacade();
    const done = facade.open(PeerContext.parse('standby'));
    await vi.waitFor(() => expect(SkyWayContext.Create).toHaveBeenCalled());

    await facade.close();
    const context = { dispose: vi.fn(), onTokenUpdateReminder: { add: vi.fn() } };
    made(context as unknown as SkyWayContext);
    await done;

    expect(context.dispose).toHaveBeenCalled();
    expect(facade.context).toBeNull();
  });

  it('says nothing of a token it was renewing when the connection was closed meanwhile', async () => {
    const renewals: (() => Promise<void>)[] = [];
    const context = {
      disposed: false,
      dispose: vi.fn(() => (context.disposed = true)),
      updateAuthToken: vi.fn(),
      onTokenUpdateReminder: { add: (renew: () => Promise<void>) => renewals.push(renew) },
      onTokenExpired: { add: vi.fn() },
      onFatalError: { add: vi.fn() },
    };
    vi.spyOn(SkyWayContext, 'Create').mockResolvedValue(context as unknown as SkyWayContext);
    let renewed: (token: string) => void = () => undefined;
    vi.spyOn(SkyWayBackend.prototype, 'createSkyWayAuthToken')
      .mockResolvedValueOnce('token')
      .mockReturnValueOnce(new Promise((resolve) => (renewed = resolve)));
    const facade = new SkyWayFacade();
    facade.onFatalError = vi.fn();
    await facade.open(PeerContext.parse('standby'));

    const renewing = renewals[0]();
    await facade.close();
    renewed('');
    await renewing;

    expect(facade.onFatalError).not.toHaveBeenCalled();
    expect(context.updateAuthToken).not.toHaveBeenCalled();
  });

  it('says nothing once the connection was closed meanwhile, neither an error nor that it opened', async () => {
    const { facade, answer, done } = opening();
    await vi.waitFor(() => expect(SkyWayBackend.prototype.createSkyWayAuthToken).toHaveBeenCalled());

    await facade.close();
    answer('');
    await done;

    expect(facade.onFatalError).not.toHaveBeenCalled();
    expect(facade.onOpen).not.toHaveBeenCalled();
  });
});
