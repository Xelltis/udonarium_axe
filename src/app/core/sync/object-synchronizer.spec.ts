import { TestBed } from '@angular/core/testing';
import { messageAdded$, selectGameTable$ } from '@axe/core/event/domain-events';
import { LogThrottle } from '@axe/core/logging/log-throttle';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { FIRST_SYNC_SETTLED, localDispatch, networkMessage$, receiveEvents } from '@axe/core/network/network-messaging';
import { AuthorityEvent } from '@axe/core/network/server/server-protocol';
import { CatalogDigest, digestOf } from '@axe/core/sync/catalog-digest';
import { GameObject } from '@axe/core/sync/game-object';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  CATALOG_TICK_MS,
  FIRST_SYNC_GRACE_MS,
  ObjectSynchronizer,
  RECONCILE_INTERVAL_MS,
  RECONCILE_QUIET_MS,
  SAME_DIFFERENCE_RETRY_MS,
  SETTLED_CATALOG_MIN_INTERVAL_MS,
  SYNC_PROGRESS_NOTICE_MS,
} from '@axe/core/sync/object-synchronizer';
import { syncProgressChanged$ } from '@axe/core/sync/sync-progress-events';
import { SynchronizeRequest, SynchronizeTask } from '@axe/core/sync/synchronize-task';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DataElement } from '@axe/domain/data/data-element';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import type { MockInstance } from 'vitest';

/** The peers the spied send was told to send an event to, in order; undefined for everybody. */
function sentTo(send: MockInstance<Network['send']>, eventName: string): (string | undefined)[] {
  return send.mock.calls
    .filter(([context]) => (context as { eventName: string }).eventName === eventName)
    .map(([, sendTo]) => sendTo);
}

describe('ObjectSynchronizer', () => {
  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      expect(ObjectSynchronizer.instance).toBe(ObjectSynchronizer.instance);
    });
  });

  describe('initialize / destroy', () => {
    it('registers its listeners on initialising', () => {
      ObjectSynchronizer.instance.initialize();
      expect(true).toBe(true);
    });

    it('removes its listeners on teardown', () => {
      ObjectSynchronizer.instance.initialize();
      ObjectSynchronizer.instance.destroy();
      expect(true).toBe(true);
    });
  });

  describe('requestFullSync', () => {
    afterEach(() => {
      ObjectSynchronizer.instance.destroy();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('sends and asks for a catalogue from every connected peer', () => {
      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([
        { peerId: 'peer-a', isOpen: true },
        { peerId: 'peer-b', isOpen: true },
      ] as never);
      const sendSpy = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

      const count = ObjectSynchronizer.instance.requestFullSync();

      expect(count).toBe(2);
      const requested = sendSpy.mock.calls
        .filter(([data]) => (data as { eventName: string }).eventName === 'REQUEST_CATALOG')
        .map(([, sendTo]) => sendTo);
      expect(requested).toEqual(['peer-a', 'peer-b']);
    });

    it('leaves an unconnected peer out', () => {
      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-a', isOpen: false }] as never);
      const sendSpy = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

      expect(ObjectSynchronizer.instance.requestFullSync()).toBe(0);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('answers another peer asking for a catalogue', () => {
      vi.useFakeTimers();
      ObjectSynchronizer.instance.initialize();
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

      localDispatch('REQUEST_CATALOG', {}, 'peer-a');
      vi.advanceTimersByTime(CATALOG_TICK_MS);

      expect(sentTo(send, 'SYNCHRONIZE_GAME_OBJECT')).toEqual(['peer-a']);
    });

    it('does not answer its own request', () => {
      vi.useFakeTimers();
      ObjectSynchronizer.instance.initialize();
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

      localDispatch('REQUEST_CATALOG', {});
      vi.advanceTimersByTime(CATALOG_TICK_MS);

      expect(sentTo(send, 'SYNCHRONIZE_GAME_OBJECT')).toEqual([]);
    });
  });

  describe('between peers', () => {
    afterEach(() => {
      ObjectSynchronizer.instance.destroy();
      ObjectStore.instance.clearDeleteHistory();
      vi.restoreAllMocks();
    });

    it('tells a peer changing what was deleted here that it is deleted', () => {
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      ObjectSynchronizer.instance.initialize();
      const gone = new GameObject('deleted-here');
      ObjectStore.instance.add(gone, false);
      ObjectStore.instance.delete(gone, false);

      localDispatch('UPDATE_GAME_OBJECT', { ...gone.toContext(), majorVersion: 5 }, 'peer-a');

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'DELETE_GAME_OBJECT',
          data: { aliasName: '', identifier: 'deleted-here' },
        }),
        'peer-a'
      );
    });

    it('tells an update of its own heard back as its own, though its peer has been renamed since it went out', async () => {
      ObjectSynchronizer.instance.initialize();
      const piece = new GameObject('own-piece');
      ObjectStore.instance.add(piece, false);
      const sent = piece.toContext();
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('renamed');
      const heard: boolean[] = [];
      const off = objectChanged$.subscribe((event) => {
        if (event.identifier === 'own-piece') heard.push(event.isSendFromSelf);
      });

      receiveEvents([{ eventName: 'UPDATE_GAME_OBJECT', data: sent, sendFrom: '???' }], true);
      await Promise.resolve();
      off();
      ObjectStore.instance.delete(piece, false);

      expect(heard).toEqual([true]);
    });
  });

  describe('through a room server', () => {
    const AUTHORITY = '@authority';

    beforeEach(() => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(AUTHORITY);
      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-a', isOpen: true }] as never);
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      ObjectSynchronizer.instance.initialize();
    });

    afterEach(() => {
      localDispatch('DISCONNECT_PEER', { peerId: AUTHORITY }, AUTHORITY);
      ObjectSynchronizer.instance.destroy();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('trades catalogs with the server alone as peers connect', () => {
      vi.useFakeTimers();

      localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
      localDispatch('CONNECT_PEER', { peerId: AUTHORITY });
      vi.advanceTimersByTime(CATALOG_TICK_MS);

      expect(sentTo(vi.mocked(Network.instance.send), 'SYNCHRONIZE_GAME_OBJECT')).toEqual([AUTHORITY]);
    });

    it('asks the server alone for a full sync', () => {
      expect(ObjectSynchronizer.instance.requestFullSync()).toBe(1);

      expect(sentTo(vi.mocked(Network.instance.send), 'REQUEST_CATALOG')).toEqual([AUTHORITY]);
    });

    it('asks the server for what its catalog offers', () => {
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'kept-by-the-server', version: 1 }], AUTHORITY);

      expect(sentTo(vi.mocked(Network.instance.send), 'REQUEST_GAME_OBJECT')).toEqual([AUTHORITY]);
    });

    it('asks the server for a change it passes on of what this seat saw deleted, never deleting it', () => {
      const gone = new GameObject('lost-here');
      ObjectStore.instance.add(gone, false);
      ObjectStore.instance.delete(gone, false);

      localDispatch('UPDATE_GAME_OBJECT', { ...gone.toContext(), majorVersion: 5 }, 'peer-a');

      expect(sentTo(vi.mocked(Network.instance.send), 'DELETE_GAME_OBJECT')).toEqual([]);
      expect(sentTo(vi.mocked(Network.instance.send), 'REQUEST_GAME_OBJECT')).toEqual([AUTHORITY]);
      expect(ObjectStore.instance.isDeleted('lost-here')).toBe(false);
      ObjectStore.instance.clearDeleteHistory();
    });

    it('makes again what it asked the server about from the server’s answer alone, not a change passed on meanwhile', () => {
      const gone = new DataElement('asked-about');
      ObjectStore.instance.add(gone, false);
      ObjectStore.instance.delete(gone, false);
      const changed = (majorVersion: number) => ({ ...gone.toContext(), majorVersion });

      localDispatch('UPDATE_GAME_OBJECT', changed(5), 'peer-a');
      localDispatch('UPDATE_GAME_OBJECT', changed(6), 'peer-a');
      expect(ObjectStore.instance.get('asked-about')).toBeNull();

      localDispatch('UPDATE_GAME_OBJECT', changed(6), AUTHORITY);
      expect(ObjectStore.instance.get('asked-about')).not.toBeNull();
      ObjectStore.instance.get('asked-about')?.destroy();
      ObjectStore.instance.clearDeleteHistory();
    });

    describe('stops waiting on what it asked about', () => {
      const askAbout = (identifier: string) => {
        const gone = new DataElement(identifier);
        ObjectStore.instance.add(gone, false);
        ObjectStore.instance.delete(gone, false);
        const changed = (majorVersion: number) => ({ ...gone.toContext(), majorVersion });
        localDispatch('UPDATE_GAME_OBJECT', changed(5), 'peer-a');
        return changed;
      };

      afterEach(() => {
        ObjectStore.instance.clearDeleteHistory();
      });

      it('once the server withdraws it, making it from a change its writer sends later', () => {
        const changed = askAbout('withdrawn-when-asked');

        localDispatch(AuthorityEvent.WITHDRAW, { identifier: 'withdrawn-when-asked' }, AUTHORITY);
        localDispatch('UPDATE_GAME_OBJECT', changed(6), 'peer-a');

        expect(ObjectStore.instance.get('withdrawn-when-asked')).not.toBeNull();
        ObjectStore.instance.get('withdrawn-when-asked')?.destroy();
      });

      it('once a loader says the name is coming back', () => {
        const changed = askAbout('loaded-again');

        localDispatch('FORGET_DELETED_OBJECTS', { identifiers: ['loaded-again'] }, 'peer-a');
        localDispatch('UPDATE_GAME_OBJECT', changed(6), 'peer-a');

        expect(ObjectStore.instance.get('loaded-again')).not.toBeNull();
        ObjectStore.instance.get('loaded-again')?.destroy();
      });

      it('once another room is opened', () => {
        const changed = askAbout('asked-in-the-last-room');

        localDispatch('OPEN_NETWORK', { peerId: 'me' });
        localDispatch('UPDATE_GAME_OBJECT', changed(6), 'peer-a');

        expect(ObjectStore.instance.get('asked-in-the-last-room')).not.toBeNull();
        ObjectStore.instance.get('asked-in-the-last-room')?.destroy();
      });

      it('once there is no room server to answer', () => {
        const changed = askAbout('asked-of-a-server-gone');
        vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(null);

        localDispatch('UPDATE_GAME_OBJECT', changed(6), 'peer-a');

        expect(ObjectStore.instance.get('asked-of-a-server-gone')).not.toBeNull();
        ObjectStore.instance.get('asked-of-a-server-gone')?.destroy();
      });
    });

    it('asks the server nothing about its own change of what it deleted', () => {
      const gone = new GameObject('deleted-by-me');
      ObjectStore.instance.add(gone, false);
      ObjectStore.instance.delete(gone, false);

      localDispatch('UPDATE_GAME_OBJECT', { ...gone.toContext(), majorVersion: 5 });

      expect(sentTo(vi.mocked(Network.instance.send), 'REQUEST_GAME_OBJECT')).toEqual([]);
      expect(ObjectStore.instance.isDeleted('deleted-by-me')).toBe(true);
      ObjectStore.instance.clearDeleteHistory();
    });

    it('asks the server for what its catalog offers, though this seat saw it deleted, never deleting it', () => {
      const gone = new GameObject('brought-back');
      ObjectStore.instance.add(gone, false);
      ObjectStore.instance.delete(gone, false);

      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'brought-back', version: 1 }], AUTHORITY);

      expect(sentTo(vi.mocked(Network.instance.send), 'DELETE_GAME_OBJECT')).toEqual([]);
      expect(sentTo(vi.mocked(Network.instance.send), 'REQUEST_GAME_OBJECT')).toEqual([AUTHORITY]);
      expect(ObjectStore.instance.isDeleted('brought-back')).toBe(false);
      ObjectStore.instance.clearDeleteHistory();
    });

    describe('the server’s own word on objects', () => {
      const elementContext = (identifier: string, value: string, majorVersion = 1) => ({
        aliasName: 'data',
        identifier,
        majorVersion,
        minorVersion: 0.5,
        syncData: { value, attributes: { name: identifier } },
      });

      afterEach(() => {
        for (const identifier of ['held', 'gone', 'parent', 'child']) {
          const object = ObjectStore.instance.get(identifier);
          if (object) ObjectStore.instance.remove(object);
        }
        ObjectStore.instance.clearDeleteHistory();
      });

      it('takes on what the server says an object is, whatever its version', () => {
        const held = DataElement.create('held', 'mine', {}, 'held');
        held.initialize();
        held.apply({ ...held.toContext(), majorVersion: 9 });

        localDispatch(AuthorityEvent.AUTHORITATIVE, elementContext('held', 'the server’s'), AUTHORITY);

        expect(held.value).toBe('the server’s');
        expect(held.majorVersion).toBe(1);
      });

      it('brings back an object it had marked deleted when the server hands it over', () => {
        ObjectStore.instance.delete('gone', false);

        localDispatch(AuthorityEvent.AUTHORITATIVE, elementContext('gone', 'back'), AUTHORITY);

        expect(ObjectStore.instance.isDeleted('gone')).toBe(false);
        expect(ObjectStore.instance.get<DataElement>('gone')?.value).toBe('back');
      });

      it('stops waiting for something asked for that went out of view, and names what it takes away', () => {
        const requests = (ObjectSynchronizer.instance as unknown as { requestMap: Map<string, SynchronizeRequest> })
          .requestMap;
        // still waiting its turn, behind the most tasks that run at once
        requests.set('never-coming', { identifier: 'never-coming', version: 1, holderIds: [AUTHORITY], ttl: 2 });
        const held = DataElement.create('held', 'mine', {}, 'held');
        held.initialize();
        const withdrawn = { identifier: 'held' } as { identifier: string; aliasName?: string };

        localDispatch(AuthorityEvent.WITHDRAW, { identifier: 'never-coming' }, AUTHORITY);
        localDispatch(AuthorityEvent.WITHDRAW, withdrawn, AUTHORITY);

        expect(requests.has('never-coming')).toBe(false);
        expect(withdrawn.aliasName).toBe('data');
      });

      it('takes nobody else’s word over its versions', () => {
        const held = DataElement.create('held', 'mine', {}, 'held');
        held.initialize();

        localDispatch(AuthorityEvent.AUTHORITATIVE, elementContext('held', 'forged'), 'peer-a');
        localDispatch(AuthorityEvent.WITHDRAW, { identifier: 'held' }, 'peer-a');

        expect(ObjectStore.instance.get<DataElement>('held')?.value).toBe('mine');
      });

      it('takes away what the server withdraws, with all beneath it, marking nothing deleted and telling nobody', () => {
        const parent = DataElement.create('parent', '', {}, 'parent');
        const child = DataElement.create('child', 'hidden', {}, 'child');
        parent.appendChild(child);
        parent.initialize();
        child.initialize();
        vi.mocked(Network.instance.send).mockClear();

        localDispatch(AuthorityEvent.WITHDRAW, { identifier: 'parent' }, AUTHORITY);

        expect(ObjectStore.instance.get('parent')).toBeNull();
        expect(ObjectStore.instance.get('child')).toBeNull();
        expect(ObjectStore.instance.isDeleted('parent')).toBe(false);
        expect(ObjectStore.instance.isDeleted('child')).toBe(false);
        expect(Network.instance.send).not.toHaveBeenCalled();
      });
    });
  });

  describe('hearing of a deletion', () => {
    beforeEach(() => {
      ObjectSynchronizer.instance.initialize();
    });

    afterEach(() => {
      const object = ObjectStore.instance.get('put-back');
      if (object) ObjectStore.instance.delete(object, false);
      ObjectStore.instance.clearDeleteHistory();
    });

    it('leaves alone what was put back under the name since it sent the word itself', () => {
      const first = new GameObject('put-back');
      first.initialize();
      first.destroy();
      const again = new GameObject('put-back');
      again.initialize();

      localDispatch('DELETE_GAME_OBJECT', { aliasName: '', identifier: 'put-back' });

      expect(ObjectStore.instance.get('put-back')).toBe(again);
    });

    it('deletes on the word of another seat', () => {
      const object = new GameObject('put-back');
      object.initialize();

      localDispatch('DELETE_GAME_OBJECT', { aliasName: '', identifier: 'put-back' }, 'peer-a');

      expect(ObjectStore.instance.get('put-back')).toBeNull();
    });
  });

  describe('receiving an update for an object it does not know', () => {
    // The table selecter subscribes as it enters the store, so removing it from the store
    // would cut off the notices mid-test. Everything else is cleaned up instead.
    beforeEach(() => {
      TestBed.configureTestingModule({});
      for (const o of ObjectStore.instance.getObjects()) {
        if (o.identifier === TableSelecter.instance.identifier) continue;
        ObjectStore.instance.delete(o, false);
      }
      ObjectStore.instance.clearDeleteHistory();
      if (!ObjectStore.instance.get(TableSelecter.instance.identifier)) {
        ObjectStore.instance.add(TableSelecter.instance, false);
      }
      ObjectSynchronizer.instance.initialize();
    });

    afterEach(() => {
      for (const o of ObjectStore.instance.getObjects()) {
        if (o.identifier === TableSelecter.instance.identifier) continue;
        ObjectStore.instance.delete(o, false);
      }
      ObjectStore.instance.clearDeleteHistory();
      ObjectSynchronizer.instance.destroy();
    });

    it('syncing a selected table fires the selection and updates which table is shown', () => {
      const tableSelecter = TableSelecter.instance;
      tableSelecter.viewTableIdentifier = '';

      const emitted: string[] = [];
      const off = selectGameTable$.subscribe((e) => emitted.push(e.identifier));

      const sample = new GameTable('synced-table-id');
      sample.name = '決戦の宇宙';
      sample.selected = true;
      sample.gridType = 2;
      sample.width = 48;
      sample.height = 36;
      const ctx = sample.toContext();

      localDispatch('UPDATE_GAME_OBJECT', ctx, 'remote-peer');

      off();

      expect(emitted).toContain('synced-table-id');
      expect(tableSelecter.viewTableIdentifier).toBe('synced-table-id');
    });

    it('a synced message can be looked up in the store by the time the added event arrives', () => {
      const tab = new ChatTab('synced-chat-tab');
      tab.name = 'メイン';
      ObjectStore.instance.add(tab, false);

      const resolved: (ChatMessage | null)[] = [];
      const off = messageAdded$.subscribe((event) => {
        resolved.push(ObjectStore.instance.get<ChatMessage>(event.messageIdentifier));
      });

      const sample = new ChatMessage('synced-chat-message');
      sample.from = 'remote-user-id';
      sample.name = 'Remote';
      sample.value = 'hello';
      sample.setAttribute('timestamp', 1_000);
      // meet the condition under which a tab announces an added message
      const ctx = sample.toContext();
      (ctx.syncData as Record<string, unknown>).parentIdentifier = tab.identifier;

      localDispatch('UPDATE_GAME_OBJECT', ctx, 'remote-peer');

      off();

      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved[0]?.identifier).toBe('synced-chat-message');
    });
  });

  describe('a sync left with nobody to ask', () => {
    type Internals = {
      requestMap: Map<string, SynchronizeRequest>;
      peerMap: Map<string, SynchronizeTask[]>;
      tasks: SynchronizeTask[];
      synchronize: () => void;
      getTargetPeerId: (exclude: ReadonlySet<string>) => string | null;
    };
    const internals = () => ObjectSynchronizer.instance as unknown as Internals;
    let peers: { peerId: string; isOpen: boolean }[];

    const requested = () =>
      vi
        .mocked(Network.instance.send)
        .mock.calls.filter(([context]) => (context as { eventName: string }).eventName === 'REQUEST_GAME_OBJECT')
        .map(([context, sendTo]) => [(context as { data: string }).data, sendTo]);

    beforeEach(() => {
      vi.useFakeTimers();
      peers = [];
      vi.spyOn(Network, 'peerContexts', 'get').mockImplementation(() => peers as never);
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      internals().requestMap.clear();
      internals().peerMap.clear();
      internals().tasks = [];
      ObjectSynchronizer.instance.initialize();

      const pick = internals().getTargetPeerId.bind(internals());
      let picks = 0;
      vi.spyOn(internals(), 'getTargetPeerId').mockImplementation((exclude) => {
        picks++;
        if (picks > 1_000) throw new Error('the synchroniser kept looking for a peer to ask');
        return pick(exclude);
      });
    });

    afterEach(() => {
      for (const peer of [...peers]) localDispatch('DISCONNECT_PEER', { peerId: peer.peerId }, peer.peerId);
      ObjectSynchronizer.instance.destroy();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('lets go of what it waited for once the only peer holding it leaves', () => {
      peers = [{ peerId: 'peer-a', isOpen: true }];
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'held-by-a', version: 1 }], 'peer-a');
      expect(requested()).toEqual([['held-by-a', 'peer-a']]);

      peers = [];
      localDispatch('DISCONNECT_PEER', { peerId: 'peer-a' }, 'peer-a');

      expect(internals().requestMap.size).toBe(0);
      expect(internals().tasks).toHaveLength(0);
    });

    it('does not wait on a catalogue that arrives from a peer already gone', () => {
      peers = [{ peerId: 'peer-gone', isOpen: false }];

      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'held-by-the-gone', version: 1 }], 'peer-gone');

      expect(internals().requestMap.size).toBe(0);
      expect(requested()).toEqual([]);
    });

    it('asks another connected holder once the peer it was asking leaves', () => {
      peers = [
        { peerId: 'peer-a', isOpen: true },
        { peerId: 'peer-b', isOpen: true },
      ];
      internals().peerMap.set('peer-a', []);
      internals().peerMap.set('peer-b', []);
      internals().requestMap.set('held-by-both', {
        identifier: 'held-by-both',
        version: 1,
        holderIds: ['peer-a', 'peer-b'],
        ttl: 2,
      });
      internals().synchronize();
      const asked = internals().tasks[0].peerId;
      const idle = asked === 'peer-a' ? 'peer-b' : 'peer-a';
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'held-by-the-asked', version: 1 }], asked);
      expect(internals().peerMap.has(idle)).toBe(false);
      const requestedBefore = requested().length;

      peers = peers.filter((peer) => peer.peerId !== asked);
      localDispatch('DISCONNECT_PEER', { peerId: asked }, asked);

      expect(requested().slice(requestedBefore)).toEqual([['held-by-both', idle]]);
      expect(internals().tasks.map((task) => task.peerId)).toEqual([idle]);
    });

    it('puts back only holders still connected when a request times out', () => {
      peers = [{ peerId: 'peer-a', isOpen: true }];
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'asking-a', version: 1 }], 'peer-a');
      const [task] = internals().tasks;

      task.ontimeout?.(
        task,
        [
          { identifier: 'held-by-a-and-gone', version: 1, holderIds: ['peer-a', 'peer-gone'], ttl: 1 },
          { identifier: 'held-by-the-gone', version: 1, holderIds: ['peer-gone'], ttl: 1 },
        ],
        []
      );

      expect(internals().requestMap.get('held-by-a-and-gone')?.holderIds).toEqual(['peer-a']);
      expect(internals().requestMap.has('held-by-the-gone')).toBe(false);
      expect(internals().peerMap.has('peer-gone')).toBe(false);
    });

    it('asks the connected holder again, and forgets the departed one, once a request times out', () => {
      peers = [
        { peerId: 'peer-a', isOpen: true },
        { peerId: 'peer-b', isOpen: true },
      ];
      internals().peerMap.set('peer-a', []);
      internals().peerMap.set('peer-b', []);
      internals().requestMap.set('held-by-both', {
        identifier: 'held-by-both',
        version: 1,
        holderIds: ['peer-a', 'peer-b'],
        ttl: 2,
      });
      internals().synchronize();
      const asked = internals().tasks[0].peerId;
      const departed = asked === 'peer-a' ? 'peer-b' : 'peer-a';
      peers = peers.filter((peer) => peer.peerId !== departed);
      localDispatch('DISCONNECT_PEER', { peerId: departed }, departed);
      const requestedBefore = requested().length;

      vi.advanceTimersByTime(30_000);

      expect(requested().slice(requestedBefore)).toEqual([['held-by-both', asked]]);
      expect(internals().tasks.map((task) => task.peerId)).toEqual([asked]);
      expect([...internals().peerMap.keys()]).toEqual([asked]);
    });

    it('keeps a newer version it heard of while an older request timed out', () => {
      peers = [{ peerId: 'peer-a', isOpen: true }];
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'moving-on', version: 1 }], 'peer-a');
      const [task] = internals().tasks;
      internals().requestMap.set('moving-on', { identifier: 'moving-on', version: 2, holderIds: ['peer-a'], ttl: 2 });

      task.ontimeout?.(task, [{ identifier: 'moving-on', version: 1, holderIds: ['peer-a'], ttl: 1 }], []);

      expect(internals().requestMap.get('moving-on')?.version).toBe(2);
    });

    it('logs a request given up after its retries, once for a run of them from one peer', () => {
      const warned = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      (ObjectSynchronizer.instance as unknown as { givenUpLog: LogThrottle }).givenUpLog.reset();
      peers = [{ peerId: 'peer-a', isOpen: true }];
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'never-answered', version: 1 }], 'peer-a');
      const givenUp = () => warned.mock.calls.filter(([message]) => message.includes('諦めました'));

      vi.advanceTimersByTime(30_000);
      vi.advanceTimersByTime(30_000);
      expect(givenUp()).toHaveLength(0);
      expect(requested()).toHaveLength(3);

      vi.advanceTimersByTime(30_000);

      expect(givenUp()).toHaveLength(1);
      expect(givenUp()[0][0]).toContain('peer-a');
      expect(givenUp()[0][1]).toEqual(['never-answered']);
      expect(requested()).toHaveLength(3);
    });
  });

  describe('reconciling catalogues between peers', () => {
    type Internals = {
      requestMap: Map<string, SynchronizeRequest>;
      peerMap: Map<string, SynchronizeTask[]>;
      tasks: SynchronizeTask[];
      differences: Map<string, unknown>;
      lastChangeAt: number;
    };
    const internals = () => ObjectSynchronizer.instance as unknown as Internals;
    let peers: { peerId: string; isOpen: boolean }[];
    let send: MockInstance<Network['send']>;

    /** What the spied send was told to send under an event name, as [data, peer] pairs in order. */
    const sent = (eventName: string) =>
      send.mock.calls
        .filter(([context]) => (context as { eventName: string }).eventName === eventName)
        .map(([context, sendTo]) => [(context as { data: unknown }).data, sendTo]);
    const eventNames = () => [
      ...new Set(send.mock.calls.map(([context]) => (context as { eventName: string }).eventName)),
    ];
    const catalogsTo = (peerId: string) => sent('SYNCHRONIZE_GAME_OBJECT').filter(([, sendTo]) => sendTo === peerId);
    const ownDigest = (): CatalogDigest => digestOf(ObjectStore.instance.getCatalog());
    const otherDigest = (): CatalogDigest => ({ count: ownDigest().count + 1, hash: 12345 });
    const flushCatalogs = () => vi.advanceTimersByTime(CATALOG_TICK_MS * 4);
    const store = (identifier: string) => {
      const object = new GameObject(identifier);
      ObjectStore.instance.add(object, false);
      return object;
    };

    beforeEach(() => {
      vi.useFakeTimers();
      peers = [
        { peerId: 'peer-a', isOpen: true },
        { peerId: 'peer-b', isOpen: true },
      ];
      vi.spyOn(Network, 'peerContexts', 'get').mockImplementation(() => peers as never);
      send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      vi.spyOn(Logger, 'info').mockImplementation(() => {});
      vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      internals().requestMap.clear();
      internals().peerMap.clear();
      internals().tasks = [];
      internals().lastChangeAt = Number.NEGATIVE_INFINITY;
      ObjectSynchronizer.instance.initialize();
      store('card-1');
      store('card-2');
    });

    afterEach(() => {
      for (const peer of [...peers]) localDispatch('DISCONNECT_PEER', { peerId: peer.peerId }, peer.peerId);
      ObjectSynchronizer.instance.destroy();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('sends every connected peer its digest at each interval, and nothing else while they agree', () => {
      vi.advanceTimersByTime(RECONCILE_INTERVAL_MS);
      expect(sent('CATALOG_DIGEST')).toEqual([
        [ownDigest(), 'peer-a'],
        [ownDigest(), 'peer-b'],
      ]);

      for (let round = 0; round < 3; round++) {
        localDispatch('CATALOG_DIGEST', ownDigest(), 'peer-a');
        localDispatch('CATALOG_DIGEST', ownDigest(), 'peer-b');
        vi.advanceTimersByTime(RECONCILE_INTERVAL_MS);
      }

      expect(eventNames()).toEqual(['CATALOG_DIGEST']);
      expect(sent('CATALOG_DIGEST')).toHaveLength(8);
    });

    it('waits on no answer to a digest, from a peer that does not know the message or any other', () => {
      vi.advanceTimersByTime(RECONCILE_INTERVAL_MS);
      vi.advanceTimersByTime(RECONCILE_INTERVAL_MS);

      expect(sent('CATALOG_DIGEST')).toHaveLength(4);
      expect(eventNames()).toEqual(['CATALOG_DIGEST']);
      expect(internals().requestMap.size).toBe(0);
      expect(internals().tasks).toHaveLength(0);
      expect(internals().differences.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);
    });

    it('lets a message it does not know pass without a word back', () => {
      expect(() =>
        receiveEvents([
          { eventName: 'A_MESSAGE_FROM_A_LATER_VERSION', sendFrom: 'peer-a', data: { count: 1, hash: 2 } },
        ])
      ).not.toThrow();
      flushCatalogs();

      expect(send).not.toHaveBeenCalled();
      expect(ObjectStore.instance.getCatalog()).toHaveLength(2);
    });

    it('sends a peer the catalogue once two of its digests in a row have differed', () => {
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      flushCatalogs();
      expect(catalogsTo('peer-a')).toHaveLength(0);

      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      flushCatalogs();

      expect(catalogsTo('peer-a')).toHaveLength(1);
      expect((catalogsTo('peer-a')[0][0] as { identifier: string }[]).map((item) => item.identifier)).toEqual([
        'card-1',
        'card-2',
      ]);
      expect(catalogsTo('peer-b')).toHaveLength(0);
      expect(sent('REQUEST_CATALOG')).toHaveLength(0);
    });

    it('starts counting afresh once a digest agrees', () => {
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      localDispatch('CATALOG_DIGEST', ownDigest(), 'peer-a');
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      flushCatalogs();

      expect(catalogsTo('peer-a')).toHaveLength(0);
    });

    it('does not send the catalogue again over the same difference until a long while has passed', () => {
      const theirs = otherDigest();
      for (let round = 0; round < 6; round++) {
        localDispatch('CATALOG_DIGEST', theirs, 'peer-a');
        flushCatalogs();
      }
      expect(catalogsTo('peer-a')).toHaveLength(1);

      localDispatch('CATALOG_DIGEST', { ...theirs, hash: theirs.hash + 1 }, 'peer-a');
      flushCatalogs();
      expect(catalogsTo('peer-a')).toHaveLength(2);

      vi.advanceTimersByTime(SAME_DIFFERENCE_RETRY_MS);
      localDispatch('CATALOG_DIGEST', { ...theirs, hash: theirs.hash + 1 }, 'peer-a');
      flushCatalogs();
      expect(catalogsTo('peer-a')).toHaveLength(3);
    });

    it('compares no digests while objects are still changing', () => {
      localDispatch('UPDATE_GAME_OBJECT', ObjectStore.instance.get('card-1')!.toContext(), 'peer-b');
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      vi.advanceTimersByTime(RECONCILE_QUIET_MS - 1);
      expect(sent('CATALOG_DIGEST')).toHaveLength(0);
      expect(catalogsTo('peer-a')).toHaveLength(0);

      vi.advanceTimersByTime(1);
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-a');
      flushCatalogs();

      expect(catalogsTo('peer-a')).toHaveLength(1);
    });

    it('takes no digest from a peer it has no open connection to', () => {
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-relayed');
      localDispatch('CATALOG_DIGEST', otherDigest(), 'peer-relayed');
      flushCatalogs();

      expect(send).not.toHaveBeenCalled();
    });

    it('does not bring back what was deleted here when catalogues are traded over a difference', () => {
      const gone = store('deleted-here');
      ObjectStore.instance.delete(gone, false);
      const theirs = digestOf([...ObjectStore.instance.getCatalog(), { identifier: 'deleted-here', version: 5 }]);

      localDispatch('CATALOG_DIGEST', theirs, 'peer-a');
      localDispatch('CATALOG_DIGEST', theirs, 'peer-a');
      flushCatalogs();
      expect((catalogsTo('peer-a')[0][0] as { identifier: string }[]).map((item) => item.identifier)).toEqual([
        'card-1',
        'card-2',
      ]);

      localDispatch(
        'SYNCHRONIZE_GAME_OBJECT',
        [
          { identifier: 'card-1', version: 0 },
          { identifier: 'deleted-here', version: 5 },
        ],
        'peer-a'
      );

      expect(sent('DELETE_GAME_OBJECT')).toEqual([[{ aliasName: '', identifier: 'deleted-here' }, 'peer-a']]);
      expect(sent('REQUEST_GAME_OBJECT')).toEqual([]);
      expect(ObjectStore.instance.get('deleted-here')).toBeNull();
      expect(ObjectStore.instance.isDeleted('deleted-here')).toBe(true);
      ObjectStore.instance.clearDeleteHistory();
    });

    it('sends everybody the catalogue once what it asked for has come in, and holds a second round back', () => {
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'wanted', version: 1 }], 'peer-a');
      expect(sent('REQUEST_GAME_OBJECT')).toEqual([['wanted', 'peer-a']]);
      flushCatalogs();
      expect(sent('SYNCHRONIZE_GAME_OBJECT')).toHaveLength(0);

      localDispatch('UPDATE_GAME_OBJECT', new GameObject('wanted').toContext(), 'peer-a');
      flushCatalogs();
      expect(catalogsTo('peer-a')).toHaveLength(1);
      expect(catalogsTo('peer-b')).toHaveLength(1);

      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'wanted-next', version: 1 }], 'peer-a');
      localDispatch('UPDATE_GAME_OBJECT', new GameObject('wanted-next').toContext(), 'peer-a');
      flushCatalogs();
      expect(catalogsTo('peer-b')).toHaveLength(1);

      vi.advanceTimersByTime(SETTLED_CATALOG_MIN_INTERVAL_MS);
      expect(catalogsTo('peer-a')).toHaveLength(2);
      expect(catalogsTo('peer-b')).toHaveLength(2);
    });

    it('sends everybody the catalogue a while after its first peer connects, having had nothing to ask for', () => {
      localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
      flushCatalogs();
      expect(catalogsTo('peer-a')).toHaveLength(1);
      expect(catalogsTo('peer-b')).toHaveLength(0);

      vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS);
      flushCatalogs();
      expect(catalogsTo('peer-a')).toHaveLength(2);
      expect(catalogsTo('peer-b')).toHaveLength(1);

      localDispatch('CONNECT_PEER', { peerId: 'peer-b' });
      vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS);
      flushCatalogs();
      expect(catalogsTo('peer-a')).toHaveLength(2);
      expect(catalogsTo('peer-b')).toHaveLength(2);
    });

    describe('saying that its first sync has settled', () => {
      let settled: boolean[];
      let stopListening: () => void;

      beforeEach(() => {
        settled = [];
        stopListening = networkMessage$.subscribe((message) => {
          if (message.eventName === FIRST_SYNC_SETTLED) settled.push(message.isSendFromSelf);
        });
      });

      afterEach(() => stopListening());

      it('says so to this seat alone once what it asked for has come in, and once only for a network', () => {
        localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
        localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'wanted', version: 1 }], 'peer-a');
        flushCatalogs();
        expect(settled).toEqual([]);

        localDispatch('UPDATE_GAME_OBJECT', new GameObject('wanted').toContext(), 'peer-a');
        flushCatalogs();
        expect(settled).toEqual([true]);
        expect(sent(FIRST_SYNC_SETTLED)).toEqual([]);

        localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'wanted-next', version: 1 }], 'peer-a');
        localDispatch('UPDATE_GAME_OBJECT', new GameObject('wanted-next').toContext(), 'peer-a');
        localDispatch('CONNECT_PEER', { peerId: 'peer-b' });
        vi.advanceTimersByTime(SETTLED_CATALOG_MIN_INTERVAL_MS + FIRST_SYNC_GRACE_MS);
        expect(settled).toEqual([true]);
      });

      it('says so again for the next network that opens', () => {
        localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
        vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS);
        expect(settled).toHaveLength(1);

        localDispatch('OPEN_NETWORK', { peerId: 'self' });
        vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS * 2);
        expect(settled).toHaveLength(1);

        localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
        vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS);
        expect(settled).toHaveLength(2);
      });

      it('says so five seconds after its first peer connects when it has nothing to ask for', () => {
        localDispatch('CONNECT_PEER', { peerId: 'peer-a' });

        vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS - 1);
        expect(settled).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(settled).toEqual([true]);
        expect(FIRST_SYNC_GRACE_MS).toBe(5_000);
      });

      it('does not say so while what it asked for is still to come', () => {
        localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
        localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'slow-to-come', version: 1 }], 'peer-a');

        vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS);

        expect(settled).toEqual([]);
      });
    });

    describe('how far its sync has come', () => {
      let told: number;
      let stopListening: () => void;
      const synchronizer = () => ObjectSynchronizer.instance;
      const wanted = (...identifiers: string[]) => identifiers.map((identifier) => ({ identifier, version: 1 }));
      const arrives = (identifier: string) =>
        localDispatch('UPDATE_GAME_OBJECT', new GameObject(identifier).toContext(), 'peer-a');

      beforeEach(() => {
        told = 0;
        stopListening = syncProgressChanged$.subscribe(() => told++);
      });

      afterEach(() => stopListening());

      it('counts what is still to come, asked for already or waiting to be', () => {
        expect(synchronizer().pendingCount).toBe(0);

        localDispatch('SYNCHRONIZE_GAME_OBJECT', wanted('one', 'two', 'three'), 'peer-a');
        expect(synchronizer().pendingCount).toBe(3);

        arrives('one');
        expect(synchronizer().pendingCount).toBe(2);
        arrives('two');
        arrives('three');
        expect(synchronizer().pendingCount).toBe(0);
      });

      it('counts what waits behind the tasks under way as well', () => {
        const many = Array.from({ length: 32 * 32 + 5 }, (_, index) => `object-${index}`);
        localDispatch('SYNCHRONIZE_GAME_OBJECT', wanted(...many), 'peer-a');

        expect(internals().requestMap.size).toBe(5);
        expect(synchronizer().pendingCount).toBe(many.length);
      });

      it('is settled only once its first sync is, and not again until then on another network', () => {
        expect(synchronizer().isSettled).toBe(false);
        localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
        vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS);
        expect(synchronizer().isSettled).toBe(true);

        localDispatch('OPEN_NETWORK', { peerId: 'self' });
        expect(synchronizer().isSettled).toBe(false);
      });

      it('notes when it began to wait and when something asked for last arrived, and nothing else', () => {
        vi.advanceTimersByTime(1_000);
        localDispatch('SYNCHRONIZE_GAME_OBJECT', wanted('one', 'two'), 'peer-a');
        const began = synchronizer().lastProgressAt;
        expect(began).toBe(performance.now());

        vi.advanceTimersByTime(2_000);
        localDispatch('UPDATE_GAME_OBJECT', new GameObject('not-asked-for').toContext(), 'peer-a');
        expect(synchronizer().lastProgressAt).toBe(began);

        arrives('one');
        expect(synchronizer().lastProgressAt).toBe(began + 2_000);
      });

      it('does not take a request given up for something arriving', () => {
        (ObjectSynchronizer.instance as unknown as { givenUpLog: LogThrottle }).givenUpLog.reset();
        localDispatch('SYNCHRONIZE_GAME_OBJECT', wanted('never-answered'), 'peer-a');
        const began = synchronizer().lastProgressAt;

        vi.advanceTimersByTime(90_000);

        expect(synchronizer().pendingCount).toBe(0);
        expect(synchronizer().lastProgressAt).toBe(began);
      });

      it('tells of a run of changes to the count once, a while after the first of them', () => {
        localDispatch('SYNCHRONIZE_GAME_OBJECT', wanted('one', 'two', 'three'), 'peer-a');
        arrives('one');
        arrives('two');
        expect(told).toBe(0);

        vi.advanceTimersByTime(SYNC_PROGRESS_NOTICE_MS);
        expect(told).toBe(1);
        expect(SYNC_PROGRESS_NOTICE_MS).toBe(250);

        vi.advanceTimersByTime(SYNC_PROGRESS_NOTICE_MS * 4);
        expect(told).toBe(1);
      });

      it('tells no more than four times a second however much arrives', () => {
        const many = Array.from({ length: 200 }, (_, index) => `object-${index}`);
        localDispatch('SYNCHRONIZE_GAME_OBJECT', wanted(...many), 'peer-a');
        for (const identifier of many) {
          arrives(identifier);
          vi.advanceTimersByTime(5);
        }

        expect(told).toBe(4);
      });

      it('tells of the first sync settling, and of starting over on another network', () => {
        localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
        vi.advanceTimersByTime(FIRST_SYNC_GRACE_MS + SYNC_PROGRESS_NOTICE_MS);
        expect(told).toBe(1);

        localDispatch('OPEN_NETWORK', { peerId: 'self' });
        vi.advanceTimersByTime(SYNC_PROGRESS_NOTICE_MS);
        expect(told).toBe(2);
      });

      it('tells nothing once it has been torn down', () => {
        localDispatch('SYNCHRONIZE_GAME_OBJECT', wanted('one'), 'peer-a');
        ObjectSynchronizer.instance.destroy();

        vi.advanceTimersByTime(SYNC_PROGRESS_NOTICE_MS * 2);

        expect(told).toBe(0);
      });
    });

    it('asks a peer for its catalogue again once a request to it has used up its retries, and not at every one', () => {
      (ObjectSynchronizer.instance as unknown as { givenUpLog: LogThrottle }).givenUpLog.reset();
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'never-answered', version: 1 }], 'peer-a');

      vi.advanceTimersByTime(60_000);
      expect(sent('REQUEST_CATALOG')).toEqual([]);
      vi.advanceTimersByTime(30_000);
      expect(sent('REQUEST_CATALOG')).toEqual([[{}, 'peer-a']]);

      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'never-answered-either', version: 1 }], 'peer-a');
      vi.advanceTimersByTime(90_000);
      expect(sent('REQUEST_CATALOG')).toHaveLength(2);

      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'nor-this', version: 1 }], 'peer-a');
      vi.advanceTimersByTime(90_000);
      expect(sent('REQUEST_CATALOG')).toHaveLength(2);
    });

    it('leaves all of it alone where a room server keeps the room', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      localDispatch('CONNECT_PEER', { peerId: '@authority' });
      flushCatalogs();
      const catalogsAtConnect = sent('SYNCHRONIZE_GAME_OBJECT').length;

      vi.advanceTimersByTime(RECONCILE_INTERVAL_MS + FIRST_SYNC_GRACE_MS);
      localDispatch('CATALOG_DIGEST', otherDigest(), '@authority');
      localDispatch('CATALOG_DIGEST', otherDigest(), '@authority');
      flushCatalogs();

      expect(sent('CATALOG_DIGEST')).toEqual([]);
      expect(sent('SYNCHRONIZE_GAME_OBJECT')).toHaveLength(catalogsAtConnect);
    });
  });
});
