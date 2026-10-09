import { PeerContext } from '@axe/core/network/peer-context';
import { SAME_NAME_MEMBER_WAIT_MS, SameNameWaitCancelledError } from '@axe/core/network/skyway/same-name-member';
import { SkyWayFacade } from '@axe/core/network/skyway/skyway-facade';

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
