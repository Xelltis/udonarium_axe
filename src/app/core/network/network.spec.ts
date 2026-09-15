import { Network } from '@axe/core/network/network';

describe('Network', () => {
  beforeEach(() => {
    // reset the singleton so no state leaks in from another test
    (Network as unknown as Record<string, unknown>)['_instance'] = undefined;
  });
  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      expect(Network.instance).toBe(Network.instance);
    });
  });

  describe('the state it starts in', () => {
    it('starts closed', () => {
      expect(Network.instance.isOpen).toBe(false);
    });

    it('carries a peer id', () => {
      expect(typeof Network.instance.peerId).toBe('string');
    });

    it('carries no peer ids', () => {
      expect(Network.instance.peerIds).toEqual([]);
    });

    it('carries a peer context', () => {
      const peer = Network.instance.peer;
      expect(peer).toBeTruthy();
      expect(typeof peer.peerId).toBe('string');
    });

    it('carries no peers', () => {
      expect(Network.instance.peers).toEqual([]);
    });

    it('reports no bandwidth in use', () => {
      expect(Network.instance.bandwidthUsage).toBe(0);
    });
  });

  describe('the older names', () => {
    it('the old peer name matches the new one', () => {
      expect(Network.instance.peerContext).toBe(Network.instance.peer);
    });

    it('the old peers name matches the new one', () => {
      expect(Network.instance.peerContexts).toEqual(Network.instance.peers);
    });
  });

  describe('callback', () => {
    it('carries its callbacks', () => {
      expect(Network.instance.callback).toBeTruthy();
    });
  });

  describe('the send queue', () => {
    type Internals = { connection: unknown; sendQueue(): void };
    const internals = () => Network.instance as unknown as Internals;
    let connectionSend: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      connectionSend = vi.fn();
      internals().connection = { send: connectionSend };
    });

    afterEach(() => {
      internals().connection = null;
    });

    it('lets a later message under the same key take the place of one still waiting', () => {
      Network.instance.send('first', undefined, 'piece');
      Network.instance.send('second', undefined, 'piece');
      internals().sendQueue();

      expect(connectionSend.mock.calls).toEqual([[['second']]]);
    });

    it('keeps the turn of the message it replaces while nothing for its peer was queued behind it', () => {
      Network.instance.send('first of the piece', 'peer-a', 'piece');
      Network.instance.send('something for another peer', 'peer-b');
      Network.instance.send('second of the piece', 'peer-a', 'piece');
      internals().sendQueue();

      expect(connectionSend.mock.calls).toEqual([
        [['second of the piece'], 'peer-a'],
        [['something for another peer'], 'peer-b'],
      ]);
    });

    it('never lets a replacement overtake a message queued after the one it replaces', () => {
      Network.instance.send('update of the effect', undefined, 'effect');
      Network.instance.send('delete of the effect');
      Network.instance.send('forget the effect was deleted');
      Network.instance.send('update of the effect brought back', undefined, 'effect');
      internals().sendQueue();

      expect(connectionSend.mock.calls).toEqual([
        [['delete of the effect', 'forget the effect was deleted', 'update of the effect brought back']],
      ]);
    });

    it('moves a replacement for one peer behind a message to everyone queued after it', () => {
      Network.instance.send('first of the piece', 'peer-a', 'piece');
      for (let n = 0; n < 128; n++) Network.instance.send(`to everyone ${n}`);
      Network.instance.send('second of the piece', 'peer-a', 'piece');
      internals().sendQueue();
      internals().sendQueue();

      expect(connectionSend.mock.calls.at(-1)).toEqual([['second of the piece'], 'peer-a']);
    });

    it('sends a keyed message again once the one before it has gone out', () => {
      Network.instance.send('first', undefined, 'piece');
      internals().sendQueue();
      Network.instance.send('second', undefined, 'piece');
      internals().sendQueue();

      expect(connectionSend.mock.calls).toEqual([[['first']], [['second']]]);
    });

    it('keeps messages without a key apart', () => {
      Network.instance.send('same');
      Network.instance.send('same');
      internals().sendQueue();

      expect(connectionSend.mock.calls).toEqual([[['same', 'same']]]);
    });
  });

  describe('the unload handlers', () => {
    it('carries an unload handler', () => {
      const instance = Network.instance as unknown as Record<string, unknown>;
      expect(typeof instance['callbackBeforeUnload']).toBe('function');
    });

    it('carries a page-hide handler', () => {
      const instance = Network.instance as unknown as Record<string, unknown>;
      expect(typeof instance['callbackPageHide']).toBe('function');
    });

    it('survives unloading with no connection', () => {
      const instance = Network.instance as unknown as Record<string, (...args: unknown[]) => void>;
      const event = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
      expect(() => instance['callbackBeforeUnload'](event)).not.toThrow();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('survives hiding with no connection', () => {
      const instance = Network.instance as unknown as Record<string, (...args: unknown[]) => void>;
      expect(() => instance['callbackPageHide']({ persisted: false } as PageTransitionEvent)).not.toThrow();
    });

    it('survives being cached with no connection', () => {
      const instance = Network.instance as unknown as Record<string, (...args: unknown[]) => void>;
      expect(() => instance['callbackPageHide']({ persisted: true } as PageTransitionEvent)).not.toThrow();
    });

    it('does not leave the room on unload', () => {
      const instance = Network.instance as unknown as Record<string, unknown>;
      const leaveImmediately = vi.fn();
      instance['connection'] = { leaveImmediately } as unknown;
      const event = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
      (instance['callbackBeforeUnload'] as (e: BeforeUnloadEvent) => void)(event);
      expect(leaveImmediately).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
      instance['connection'] = null;
    });

    it('leaves the room when the page goes into the cache', () => {
      const instance = Network.instance as unknown as Record<string, unknown>;
      const leaveImmediately = vi.fn();
      const close = vi.fn();
      instance['connection'] = { leaveImmediately, close } as unknown;
      (instance['callbackPageHide'] as (e: PageTransitionEvent) => void)({ persisted: true } as PageTransitionEvent);
      expect(leaveImmediately).toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      instance['connection'] = null;
    });

    it('closes the connection when the page is simply hidden', () => {
      const instance = Network.instance as unknown as Record<string, unknown>;
      const leaveImmediately = vi.fn();
      const close = vi.fn();
      instance['connection'] = { leaveImmediately, close } as unknown;
      (instance['callbackPageHide'] as (e: PageTransitionEvent) => void)({ persisted: false } as PageTransitionEvent);
      expect(leaveImmediately).toHaveBeenCalled();
      instance['connection'] = null;
    });
  });
});
