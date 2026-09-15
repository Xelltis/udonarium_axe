import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NetworkPeerEvent, ObjectChangeService, ObjectDeleteEvent } from '@axe/application/sync/object-change.service';
import { fileLoaded$ } from '@axe/core/event/domain-events';
import { EventChannel } from '@axe/core/event/event-channel';
import { localDispatch } from '@axe/core/network/network-messaging';
import { childrenChanged$, objectAdded$, objectChanged$, objectRemoved$ } from '@axe/core/sync/object-event-extension';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

function nextEvent<T>(channel: { subscribe(fn: (e: T) => void): () => void }): Promise<T> {
  return new Promise<T>((resolve) => {
    const off = channel.subscribe((e) => {
      off();
      resolve(e);
    });
  });
}

describe('ObjectChangeService', () => {
  let service: ObjectChangeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ObjectChangeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should expose objectChanged$ observable', () => {
    expect(service.objectChanged$).toBeTruthy();
  });

  it('should expose childrenChanged$ observable', () => {
    expect(service.childrenChanged$).toBeTruthy();
  });

  it('should expose objectDeleted$ observable', () => {
    expect(service.objectDeleted$).toBeTruthy();
  });

  it('should expose fileSyncList$ observable', () => {
    expect(service.fileSyncList$).toBeTruthy();
  });

  it('should expose fileResourceUpdated$ observable', () => {
    expect(service.fileResourceUpdated$).toBeTruthy();
  });

  it('should expose peerConnect$ observable', () => {
    expect(service.peerConnect$).toBeTruthy();
  });

  it('should expose peerDisconnect$ observable', () => {
    expect(service.peerDisconnect$).toBeTruthy();
  });

  it('should expose networkOpen$ observable', () => {
    expect(service.networkOpen$).toBeTruthy();
  });

  it('should expose objectAdded$ observable', () => {
    expect(service.objectAdded$).toBeTruthy();
  });

  it('should expose objectRemoved$ observable', () => {
    expect(service.objectRemoved$).toBeTruthy();
  });

  it('should emit on objectChanged$ when objectChanged$ fires', async () => {
    const testData = { identifier: 'test-id', aliasName: 'TestAlias', isSendFromSelf: false };
    const promise = nextEvent(service.objectChanged$);
    objectChanged$.emit(testData);
    const event = await promise;
    expect(event.identifier).toBe('test-id');
    expect(event.aliasName).toBe('TestAlias');
  });

  it('should emit on childrenChanged$ when childrenChanged$ fires', async () => {
    const testData = { identifier: 'child-id' };
    const promise = nextEvent(service.childrenChanged$);
    childrenChanged$.emit(testData);
    const event = await promise;
    expect(event.identifier).toBe('child-id');
  });

  it('should emit on objectDeleted$ when _objectDeleted$ fires', async () => {
    const promise = nextEvent(service.objectDeleted$);
    (service as unknown as { _objectDeleted$: EventChannel<ObjectDeleteEvent> })._objectDeleted$.emit({
      identifier: 'del-id',
      aliasName: 'GameCharacter',
      isSendFromSelf: true,
    });
    const event = await promise;
    expect(event.identifier).toBe('del-id');
    expect(event.aliasName).toBe('GameCharacter');
  });

  it('should emit on peerConnect$ when _peerConnect$ fires', async () => {
    const promise = nextEvent(service.peerConnect$);
    (service as unknown as { _peerConnect$: EventChannel<NetworkPeerEvent> })._peerConnect$.emit({
      peerId: 'peer-123',
    });
    const event = await promise;
    expect(event.peerId).toBe('peer-123');
  });

  it('should emit on peerDisconnect$ when _peerDisconnect$ fires', async () => {
    const promise = nextEvent(service.peerDisconnect$);
    (service as unknown as { _peerDisconnect$: EventChannel<NetworkPeerEvent> })._peerDisconnect$.emit({
      peerId: 'peer-456',
    });
    const event = await promise;
    expect(event.peerId).toBe('peer-456');
  });

  it('should emit on networkOpen$ when _networkOpen$ fires', async () => {
    const promise = nextEvent(service.networkOpen$);
    (service as unknown as { _networkOpen$: EventChannel<NetworkPeerEvent> })._networkOpen$.emit({ peerId: 'my-peer' });
    const event = await promise;
    expect(event.peerId).toBe('my-peer');
  });

  it('turns a delete into its own event', async () => {
    const promise = nextEvent(service.objectDeleted$);

    localDispatch('DELETE_GAME_OBJECT', { identifier: 'network-del-id', aliasName: 'character' }, 'remote-peer-id');

    await expect(promise).resolves.toEqual({
      identifier: 'network-del-id',
      aliasName: 'character',
      isSendFromSelf: false,
    });
  });

  it('turns a cursor move into its own event', async () => {
    const promise = nextEvent(service.cursorMove$);

    localDispatch('CURSOR_MOVE', [10, 20, 30], 'remote-peer-id');

    await expect(promise).resolves.toEqual({
      x: 10,
      y: 20,
      z: 30,
      sendFrom: 'remote-peer-id',
    });
  });

  it('turns a network error into its own event', async () => {
    const promise = nextEvent(service.networkError$);

    localDispatch('NETWORK_ERROR', { errorType: 'disconnect', errorMessage: 'connection lost' });

    await expect(promise).resolves.toEqual({
      errorType: 'disconnect',
      errorMessage: 'connection lost',
    });
  });

  describe('versionOf()', () => {
    it('exposes the method', () => {
      expect(typeof service.versionOf).toBe('function');
    });

    it('returns a signal starting at zero', () => {
      const sig = service.versionOf('test-id-1');
      expect(sig()).toBe(0);
    });

    it('returns the same signal for the same identifier', () => {
      const sig1 = service.versionOf('test-id-2');
      const sig2 = service.versionOf('test-id-2');
      expect(sig1).toBe(sig2);
    });

    it('returns a different signal for a different identifier', () => {
      const sig1 = service.versionOf('test-id-3a');
      const sig2 = service.versionOf('test-id-3b');
      expect(sig1).not.toBe(sig2);
    });

    it('bumps the version of the object that changed', () => {
      const sig = service.versionOf('obj-changed-1');
      expect(sig()).toBe(0);

      objectChanged$.emit({ identifier: 'obj-changed-1', aliasName: 'TestAlias', isSendFromSelf: true });

      expect(sig()).toBe(1);
    });

    it('leaves other versions alone when an object changes', () => {
      const sigTarget = service.versionOf('obj-changed-2a');
      const sigOther = service.versionOf('obj-changed-2b');

      objectChanged$.emit({ identifier: 'obj-changed-2a', aliasName: 'TestAlias', isSendFromSelf: true });

      expect(sigTarget()).toBe(1);
      expect(sigOther()).toBe(0);
    });

    it('bumps the version when its children change', () => {
      const sig = service.versionOf('parent-1');
      expect(sig()).toBe(0);

      childrenChanged$.emit({ identifier: 'parent-1' });

      expect(sig()).toBe(1);
    });

    it('bumps the version of an object as it is removed, before its parent hears of it', () => {
      const sig = service.versionOf('removed-1');
      expect(sig()).toBe(0);

      objectRemoved$.emit({ identifier: 'removed-1', aliasName: 'TestAlias' });

      expect(sig()).toBe(1);
    });

    it('adds up a change and a children change', () => {
      const sig = service.versionOf('combo-1');

      objectChanged$.emit({ identifier: 'combo-1', aliasName: 'TestAlias', isSendFromSelf: true });
      childrenChanged$.emit({ identifier: 'combo-1' });

      expect(sig()).toBe(2);
    });

    it('ignores a change to an identifier nobody has asked about', () => {
      // survives a change with no version ever requested
      expect(() => {
        objectChanged$.emit({ identifier: 'unregistered-1', aliasName: 'TestAlias', isSendFromSelf: true });
      }).not.toThrow();
    });

    it('drops the signal when the object is removed', () => {
      const sig1 = service.versionOf('cleanup-1');
      expect(sig1()).toBe(0);

      objectRemoved$.emit({ identifier: 'cleanup-1', aliasName: 'TestAlias' });

      // hands back a fresh signal, starting at zero, when asked again
      const sig2 = service.versionOf('cleanup-1');
      expect(sig2()).toBe(0);
      expect(sig2).not.toBe(sig1);
    });

    it('returns a read-only signal', () => {
      const sig = service.versionOf('readonly-1');
      // returns a signal with no set or update
      expect(typeof (sig as unknown as Record<string, unknown>)['set']).not.toBe('function');
      expect(typeof (sig as unknown as Record<string, unknown>)['update']).not.toBe('function');
    });
  });

  describe('trackMyCursor()', () => {
    afterEach(() => {
      PeerCursor.myCursor = null!;
    });

    function roleSeenBy(): () => PeerRole {
      return TestBed.runInInjectionContext(() =>
        computed(() => {
          service.trackMyCursor();
          return PeerCursor.myRole;
        })
      );
    }

    it('hears the cursor that arrives after it was first asked', () => {
      const role = roleSeenBy();
      expect(role()).toBe(PeerRole.Player);

      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.GameMaster;

      expect(role()).toBe(PeerRole.GameMaster);
    });

    it('hears a role change on the cursor it can already see', () => {
      PeerCursor.createMyCursor();
      const role = roleSeenBy();
      expect(role()).toBe(PeerRole.Player);

      PeerCursor.myCursor.role = PeerRole.Guest;
      service.notifyChanged(PeerCursor.myCursor.identifier);

      expect(role()).toBe(PeerRole.Guest);
    });
  });

  describe('collectionOf()', () => {
    it('exposes the method', () => {
      expect(typeof service.collectionOf).toBe('function');
    });

    it('returns a signal starting at zero', () => {
      const sig = service.collectionOf('test-alias-1');
      expect(sig()).toBe(0);
    });

    it('returns the same signal for the same alias', () => {
      const sig1 = service.collectionOf('test-alias-2');
      const sig2 = service.collectionOf('test-alias-2');
      expect(sig1).toBe(sig2);
    });

    it('bumps the collection when one of its objects is added', () => {
      const sig = service.collectionOf('character');
      expect(sig()).toBe(0);

      objectAdded$.emit({ identifier: 'char-1', aliasName: 'character' });

      expect(sig()).toBe(1);
    });

    it('leaves other collections alone', () => {
      const sigTarget = service.collectionOf('character');
      const sigOther = service.collectionOf('card');

      objectAdded$.emit({ identifier: 'char-2', aliasName: 'character' });

      expect(sigTarget()).toBe(1);
      expect(sigOther()).toBe(0);
    });

    it('bumps the collection when one of its objects is removed', () => {
      const sig = service.collectionOf('character');

      objectRemoved$.emit({ identifier: 'char-3', aliasName: 'character' });

      expect(sig()).toBe(1);
    });

    it('adds up an addition and a removal', () => {
      const sig = service.collectionOf('card-stack');

      objectAdded$.emit({ identifier: 'cs-1', aliasName: 'card-stack' });
      objectAdded$.emit({ identifier: 'cs-2', aliasName: 'card-stack' });
      objectRemoved$.emit({ identifier: 'cs-1', aliasName: 'card-stack' });

      expect(sig()).toBe(3);
    });

    it('ignores an addition to an alias nobody has asked about', () => {
      expect(() => {
        objectAdded$.emit({ identifier: 'x', aliasName: 'unregistered-alias' });
      }).not.toThrow();
    });

    it('returns a read-only signal', () => {
      const sig = service.collectionOf('readonly-alias');
      expect(typeof (sig as unknown as Record<string, unknown>)['set']).not.toBe('function');
      expect(typeof (sig as unknown as Record<string, unknown>)['update']).not.toBe('function');
    });
  });

  describe('notifyChanged()', () => {
    it('bumps the signal when told about a change by hand', () => {
      const sig = service.versionOf('notify-1');
      expect(sig()).toBe(0);

      service.notifyChanged('notify-1');

      expect(sig()).toBe(1);
    });

    it('adds up repeated notices', () => {
      const sig = service.versionOf('notify-2');

      service.notifyChanged('notify-2');
      service.notifyChanged('notify-2');
      service.notifyChanged('notify-2');

      expect(sig()).toBe(3);
    });

    it('survives a notice about an identifier nobody has asked about', () => {
      expect(() => {
        service.notifyChanged('notify-unregistered');
      }).not.toThrow();
    });

    it('leaves other signals alone', () => {
      const sigTarget = service.versionOf('notify-3a');
      const sigOther = service.versionOf('notify-3b');

      service.notifyChanged('notify-3a');

      expect(sigTarget()).toBe(1);
      expect(sigOther()).toBe(0);
    });
  });

  describe('fileVersion throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('bumps the file version at once on the first event', () => {
      expect(service.fileVersion()).toBe(0);

      fileLoaded$.emit();

      expect(service.fileVersion()).toBe(1);
    });

    it('bumps only once for a burst inside the window', () => {
      fileLoaded$.emit(); // leading
      expect(service.fileVersion()).toBe(1);

      fileLoaded$.emit(); // throttled
      expect(service.fileVersion()).toBe(1);

      fileLoaded$.emit(); // throttled
      expect(service.fileVersion()).toBe(1);
    });

    it('bumps again at the end of the window', () => {
      fileLoaded$.emit(); // leading
      fileLoaded$.emit(); // pending

      vi.advanceTimersByTime(100);

      expect(service.fileVersion()).toBe(2); // trailing
    });

    it('can bump at once again after the cooldown', () => {
      fileLoaded$.emit(); // leading → 1
      fileLoaded$.emit(); // pending

      vi.advanceTimersByTime(100); // trailing → 2 (starts new cooldown)
      vi.advanceTimersByTime(100); // cooldown expires (no pending → no trailing)

      fileLoaded$.emit(); // leading → 3
      expect(service.fileVersion()).toBe(3);
    });

    it('does not bump twice for a single event', () => {
      fileLoaded$.emit(); // leading → 1
      expect(service.fileVersion()).toBe(1);

      vi.advanceTimersByTime(100);

      expect(service.fileVersion()).toBe(1); // no trailing
    });
  });

  describe('onObjectChangedFor()', () => {
    it('calls the listener only for the identifiers it names', () => {
      const listener = vi.fn();
      service.onObjectChangedFor(() => ['id-A', 'id-B'], listener);

      objectChanged$.emit({ identifier: 'id-A', aliasName: 'alias', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'id-X', aliasName: 'alias', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'id-B', aliasName: 'alias', isSendFromSelf: false });

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0][0].identifier).toBe('id-A');
      expect(listener.mock.calls[1][0].identifier).toBe('id-B');
    });

    it('asks for the identifiers on every event, so they can change', () => {
      const listener = vi.fn();
      let currentIds = ['id-A'];
      service.onObjectChangedFor(() => currentIds, listener);

      objectChanged$.emit({ identifier: 'id-A', aliasName: 'a', isSendFromSelf: false });
      currentIds = ['id-B'];
      objectChanged$.emit({ identifier: 'id-A', aliasName: 'a', isSendFromSelf: false }); // 旧 id にもう一致しない
      objectChanged$.emit({ identifier: 'id-B', aliasName: 'a', isSendFromSelf: false });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('unsubscribes through the returned function', () => {
      const listener = vi.fn();
      const off = service.onObjectChangedFor(() => ['x'], listener);
      objectChanged$.emit({ identifier: 'x', aliasName: 'a', isSendFromSelf: false });
      off();
      objectChanged$.emit({ identifier: 'x', aliasName: 'a', isSendFromSelf: false });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('onObjectChangedForAlias()', () => {
    it('calls the listener only for the aliases it names', () => {
      const listener = vi.fn();
      service.onObjectChangedForAlias(['ChatMessage'], listener);

      objectChanged$.emit({ identifier: 'a', aliasName: 'ChatMessage', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'b', aliasName: 'Card', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'c', aliasName: 'ChatMessage', isSendFromSelf: false });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('matches any of several aliases', () => {
      const listener = vi.fn();
      service.onObjectChangedForAlias(['ChatTab', 'ChatTabList'], listener);
      objectChanged$.emit({ identifier: 'a', aliasName: 'ChatTab', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'b', aliasName: 'ChatTabList', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'c', aliasName: 'OtherType', isSendFromSelf: false });
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('onObjectChangedForIdentifier()', () => {
    it('calls the listener only for its own identifier, straight from the index', () => {
      const listener = vi.fn();
      service.onObjectChangedForIdentifier('id-A', listener);

      objectChanged$.emit({ identifier: 'id-A', aliasName: 'a', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'id-B', aliasName: 'a', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'id-A', aliasName: 'a', isSendFromSelf: false });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('takes several listeners for one identifier', () => {
      const a = vi.fn();
      const b = vi.fn();
      service.onObjectChangedForIdentifier('id-X', a);
      service.onObjectChangedForIdentifier('id-X', b);
      objectChanged$.emit({ identifier: 'id-X', aliasName: 'a', isSendFromSelf: false });
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('removes the indexed entry when unsubscribed', () => {
      const listener = vi.fn();
      const off = service.onObjectChangedForIdentifier('id-Y', listener);
      objectChanged$.emit({ identifier: 'id-Y', aliasName: 'a', isSendFromSelf: false });
      off();
      objectChanged$.emit({ identifier: 'id-Y', aliasName: 'a', isSendFromSelf: false });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('skips a listener unsubscribed mid-dispatch, as the event channel does', () => {
      const order: string[] = [];
      let offB: (() => void) | null = null;
      const a = vi.fn(() => {
        order.push('a');
        offB?.();
      });
      const b = vi.fn(() => {
        order.push('b');
      });
      service.onObjectChangedForIdentifier('id-Z', a);
      offB = service.onObjectChangedForIdentifier('id-Z', b);
      objectChanged$.emit({ identifier: 'id-Z', aliasName: 'a', isSendFromSelf: false });
      // b was unsubscribed from inside a, so b is skipped this time round
      expect(order).toEqual(['a']);
    });
  });

  describe('onObjectChangedForSingleAlias()', () => {
    it('calls the listener only for its own alias, straight from the index', () => {
      const listener = vi.fn();
      service.onObjectChangedForSingleAlias('ChatMessage', listener);

      objectChanged$.emit({ identifier: 'a', aliasName: 'ChatMessage', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'b', aliasName: 'Card', isSendFromSelf: false });
      objectChanged$.emit({ identifier: 'c', aliasName: 'ChatMessage', isSendFromSelf: false });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('removes the indexed entry when unsubscribed', () => {
      const listener = vi.fn();
      const off = service.onObjectChangedForSingleAlias('Card', listener);
      objectChanged$.emit({ identifier: 'a', aliasName: 'Card', isSendFromSelf: false });
      off();
      objectChanged$.emit({ identifier: 'b', aliasName: 'Card', isSendFromSelf: false });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
