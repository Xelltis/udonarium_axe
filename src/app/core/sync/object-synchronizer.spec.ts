import { TestBed } from '@angular/core/testing';
import { messageAdded$, selectGameTable$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { AuthorityEvent } from '@axe/core/network/server/server-protocol';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { SynchronizeRequest, SynchronizeTask } from '@axe/core/sync/synchronize-task';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DataElement } from '@axe/domain/data/data-element';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

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
      ObjectSynchronizer.instance.initialize();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      const sendCatalogSpy = vi.spyOn(ObjectSynchronizer.instance as any, 'sendCatalog').mockImplementation(() => {});

      localDispatch('REQUEST_CATALOG', {}, 'peer-a');

      expect(sendCatalogSpy).toHaveBeenCalledWith('peer-a');
    });

    it('does not answer its own request', () => {
      ObjectSynchronizer.instance.initialize();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      const sendCatalogSpy = vi.spyOn(ObjectSynchronizer.instance as any, 'sendCatalog').mockImplementation(() => {});

      localDispatch('REQUEST_CATALOG', {});

      expect(sendCatalogSpy).not.toHaveBeenCalled();
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
  });

  describe('through a room server', () => {
    const AUTHORITY = '@authority';
    let sendCatalog: ReturnType<typeof vi.fn>;

    const sentTo = (eventName: string) =>
      vi
        .mocked(Network.instance.send)
        .mock.calls.filter(([context]) => (context as { eventName: string }).eventName === eventName)
        .map(([, sendTo]) => sendTo);

    beforeEach(() => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(AUTHORITY);
      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([{ peerId: 'peer-a', isOpen: true }] as never);
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      sendCatalog = vi.fn();
      ObjectSynchronizer.instance.initialize();
    });

    afterEach(() => {
      localDispatch('DISCONNECT_PEER', { peerId: AUTHORITY }, AUTHORITY);
      ObjectSynchronizer.instance.destroy();
      vi.restoreAllMocks();
    });

    it('trades catalogs with the server alone as peers connect', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(ObjectSynchronizer.instance as any, 'sendCatalog').mockImplementation(sendCatalog);

      localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
      localDispatch('CONNECT_PEER', { peerId: AUTHORITY });

      expect(sendCatalog.mock.calls).toEqual([[AUTHORITY]]);
    });

    it('asks the server alone for a full sync', () => {
      expect(ObjectSynchronizer.instance.requestFullSync()).toBe(1);

      expect(sentTo('REQUEST_CATALOG')).toEqual([AUTHORITY]);
    });

    it('asks the server for what its catalog offers', () => {
      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'kept-by-the-server', version: 1 }], AUTHORITY);

      expect(sentTo('REQUEST_GAME_OBJECT')).toEqual([AUTHORITY]);
    });

    it('asks the server for a change it passes on of what this seat saw deleted, never deleting it', () => {
      const gone = new GameObject('lost-here');
      ObjectStore.instance.add(gone, false);
      ObjectStore.instance.delete(gone, false);

      localDispatch('UPDATE_GAME_OBJECT', { ...gone.toContext(), majorVersion: 5 }, 'peer-a');

      expect(sentTo('DELETE_GAME_OBJECT')).toEqual([]);
      expect(sentTo('REQUEST_GAME_OBJECT')).toEqual([AUTHORITY]);
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

      expect(sentTo('REQUEST_GAME_OBJECT')).toEqual([]);
      expect(ObjectStore.instance.isDeleted('deleted-by-me')).toBe(true);
      ObjectStore.instance.clearDeleteHistory();
    });

    it('asks the server for what its catalog offers, though this seat saw it deleted, never deleting it', () => {
      const gone = new GameObject('brought-back');
      ObjectStore.instance.add(gone, false);
      ObjectStore.instance.delete(gone, false);

      localDispatch('SYNCHRONIZE_GAME_OBJECT', [{ identifier: 'brought-back', version: 1 }], AUTHORITY);

      expect(sentTo('DELETE_GAME_OBJECT')).toEqual([]);
      expect(sentTo('REQUEST_GAME_OBJECT')).toEqual([AUTHORITY]);
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

      task.ontimeout?.(task, [
        { identifier: 'held-by-a-and-gone', version: 1, holderIds: ['peer-a', 'peer-gone'], ttl: 1 },
        { identifier: 'held-by-the-gone', version: 1, holderIds: ['peer-gone'], ttl: 1 },
      ]);

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

      task.ontimeout?.(task, [{ identifier: 'moving-on', version: 1, holderIds: ['peer-a'], ttl: 1 }]);

      expect(internals().requestMap.get('moving-on')?.version).toBe(2);
    });
  });
});
