import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { GameObject } from '@axe/core/sync/game-object';
import { objectAdded$, objectRemoved$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';

type ObjectStorePrivate = {
  aliasNameMap: Map<string, Map<string, GameObject> | undefined>;
  garbageMap: Map<string, number>;
  garbageSweepCooldown: ReturnType<typeof setTimeout> | null;
  runGarbageCollection(ms: number): void;
};

const asPrivate = (store: ObjectStore): ObjectStorePrivate => store as unknown as ObjectStorePrivate;

describe('ObjectStore', () => {
  let store: ObjectStore;
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
    sendSpy = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
    // The store is a singleton, and its sweep waits a second between runs. A test that
    // deletes has to start from a state where the next sweep can actually run.
    const cooldown = asPrivate(store).garbageSweepCooldown;
    if (cooldown !== null) clearTimeout(cooldown);
    asPrivate(store).garbageSweepCooldown = null;
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  it('should create singleton instance', () => {
    expect(store).toBeTruthy();
    expect(ObjectStore.instance).toBe(store);
  });

  describe('add()', () => {
    it('should add a new object to the store', () => {
      const obj = new GameObject('test-id-1');
      const result = store.add(obj, false);

      expect(result).toBe(obj);
      expect(store.get('test-id-1')).toBe(obj);
    });

    it('should call onStoreAdded lifecycle method', () => {
      const obj = new GameObject('test-id-2');
      vi.spyOn(obj, 'onStoreAdded');

      store.add(obj, false);

      expect(obj.onStoreAdded).toHaveBeenCalled();
    });

    it('should not add duplicate objects', () => {
      const obj = new GameObject('test-id-3');
      store.add(obj, false);

      const result = store.add(obj, false);

      expect(result).toBeNull();
    });

    it('should not add already deleted objects', () => {
      const obj = new GameObject('test-id-4');
      store.add(obj, false);
      store.delete(obj, false);

      const newObj = new GameObject('test-id-4');
      const result = store.add(newObj, false);

      expect(result).toBeNull();
    });

    it('accepts a fixed identifier rebuilt here', () => {
      const obj = new GameObject('fixed-id');
      store.add(obj, false);
      store.delete(obj, false);

      const remade = new GameObject('fixed-id');
      const result = store.add(remade);

      expect(result).toBe(remade);
      expect(store.get('fixed-id')).toBe(remade);
      expect(store.isDeleted('fixed-id')).toBe(false);
    });

    it('still refuses the same identifier arriving from elsewhere', () => {
      const obj = new GameObject('fixed-id-2');
      store.add(obj, false);
      store.delete(obj, false);

      expect(store.add(new GameObject('fixed-id-2'), false)).toBeNull();
    });

    it('should broadcast update when shouldBroadcast is true', () => {
      vi.spyOn(store, 'update');
      const obj = new GameObject('test-id-5');

      store.add(obj, true);

      expect(store.update).toHaveBeenCalled();
    });

    it('should not broadcast update when shouldBroadcast is false', () => {
      vi.spyOn(store, 'update');
      const obj = new GameObject('test-id-6');

      store.add(obj, false);

      expect(store.update).not.toHaveBeenCalled();
    });

    it('should recover when aliasNameMap entry is unexpectedly undefined', () => {
      const privateStore = asPrivate(store);
      try {
        privateStore.aliasNameMap.set(GameObject.aliasName, undefined);
        const obj = new GameObject('test-id-6-robust');

        expect(() => store.add(obj, false)).not.toThrow();
        expect(store.get('test-id-6-robust')).toBe(obj);
      } finally {
        privateStore.aliasNameMap.delete(GameObject.aliasName);
      }
    });
  });

  describe('get()', () => {
    it('should retrieve an object by identifier', () => {
      const obj = new GameObject('test-id-7');
      store.add(obj, false);

      const retrieved = store.get('test-id-7');

      expect(retrieved).toBe(obj);
    });

    it('should return null for non-existent identifier', () => {
      const retrieved = store.get('non-existent');

      expect(retrieved).toBeNull();
    });
  });

  describe('getObjects()', () => {
    it('should return all objects when called without arguments', () => {
      const obj1 = new GameObject('test-id-8');
      const obj2 = new GameObject('test-id-9');
      store.add(obj1, false);
      store.add(obj2, false);

      const objects = store.getObjects();

      expect(objects.length).toBe(2);
      expect(objects).toContain(obj1);
      expect(objects).toContain(obj2);
    });

    it('should return objects filtered by aliasName', () => {
      const obj1 = new GameObject('test-id-10');
      const obj2 = new GameObject('test-id-11');
      store.add(obj1, false);
      store.add(obj2, false);

      const objects = store.getObjects(GameObject.aliasName);

      expect(objects.length).toBe(2);
      expect(objects).toContain(obj1);
      expect(objects).toContain(obj2);
    });

    it('should return empty array for non-existent aliasName', () => {
      const objects = store.getObjects('NonExistentAlias');

      expect(objects).toEqual([]);
    });

    it('should return objects filtered by constructor', () => {
      const obj1 = new GameObject('test-id-12');
      const obj2 = new GameObject('test-id-13');
      store.add(obj1, false);
      store.add(obj2, false);

      const objects = store.getObjects(GameObject);

      expect(objects.length).toBe(2);
      expect(objects).toContain(obj1);
      expect(objects).toContain(obj2);
    });

    it('should return empty array when aliasName map value is unexpectedly undefined', () => {
      const privateStore = asPrivate(store);
      try {
        privateStore.aliasNameMap.set(GameObject.aliasName, undefined);

        expect(() => store.getObjects(GameObject.aliasName)).not.toThrow();
        expect(store.getObjects(GameObject.aliasName)).toEqual([]);
      } finally {
        privateStore.aliasNameMap.delete(GameObject.aliasName);
      }
    });
  });

  describe('remove()', () => {
    it('should remove an object from the store', () => {
      const obj = new GameObject('test-id-14');
      store.add(obj, false);

      const result = store.remove(obj);

      expect(result).toBe(obj);
      expect(store.get('test-id-14')).toBeNull();
    });

    it('should call onStoreRemoved lifecycle method', () => {
      const obj = new GameObject('test-id-15');
      store.add(obj, false);
      vi.spyOn(obj, 'onStoreRemoved');

      store.remove(obj);

      expect(obj.onStoreRemoved).toHaveBeenCalled();
    });

    it('should return null for non-existent object', () => {
      const obj = new GameObject('test-id-16');

      const result = store.remove(obj);

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('should delete an object by reference', () => {
      const obj = new GameObject('test-id-17');
      store.add(obj, false);

      const result = store.delete(obj, false);

      expect(result).toBe(obj);
      expect(store.get('test-id-17')).toBeNull();
    });

    it('should delete an object by identifier', () => {
      const obj = new GameObject('test-id-18');
      store.add(obj, false);

      const result = store.delete('test-id-18', false);

      expect(result).toBe(obj);
      expect(store.get('test-id-18')).toBeNull();
    });

    it('should mark identifier as deleted', () => {
      const obj = new GameObject('test-id-19');
      store.add(obj, false);

      store.delete(obj, false);

      expect(store.isDeleted('test-id-19')).toBe(true);
    });

    it('should broadcast DELETE_GAME_OBJECT event when shouldBroadcast is true', () => {
      const obj = new GameObject('test-id-20');
      store.add(obj, false);

      store.delete(obj, true);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'DELETE_GAME_OBJECT',
          data: { aliasName: obj.aliasName, identifier: obj.identifier },
        }),
        undefined
      );
    });

    it('should not broadcast event when shouldBroadcast is false', () => {
      const obj = new GameObject('test-id-21');
      store.add(obj, false);

      store.delete(obj, false);

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should return null when deleting non-existent object by identifier', () => {
      const result = store.delete('non-existent', false);

      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('should queue update by identifier', () => {
      const obj = new GameObject('test-id-22');
      store.add(obj, false);

      store.update('test-id-22');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'UPDATE_GAME_OBJECT' }),
        undefined,
        'test-id-22'
      );
    });

    it('should queue update by context', () => {
      const obj = new GameObject('test-id-23');
      store.add(obj, false);
      const context = obj.toContext();

      store.update(context);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'UPDATE_GAME_OBJECT', data: context }),
        undefined,
        'test-id-23'
      );
    });

    it('hands every update to the network under the identifier, so a later one replaces one still waiting', () => {
      const obj = new GameObject('test-id-24');
      store.add(obj, false);
      const context1 = obj.toContext();
      context1.majorVersion = 1;
      const context2 = obj.toContext();
      context2.majorVersion = 2;

      store.update(context1);
      store.update(context2);

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy).toHaveBeenLastCalledWith(expect.objectContaining({ data: context2 }), undefined, 'test-id-24');
    });

    it('still sends an update made after the one before it was taken for sending', () => {
      sendSpy.mockRestore();
      const network = Network.instance as unknown as { connection: unknown; sendQueue(): void };
      const sentVersions: number[] = [];
      network.connection = {
        send: (batch: { data?: { identifier?: string; minorVersion?: number } }[]) => {
          for (const message of batch) {
            if (message.data?.identifier === 'test-id-25') sentVersions.push(message.data.minorVersion ?? -1);
          }
        },
      };
      try {
        const obj = new GameObject('test-id-25');
        store.add(obj, false);
        const context1 = obj.toContext();
        context1.minorVersion = 1;
        const context2 = obj.toContext();
        context2.minorVersion = 2;

        store.update(context1);
        network.sendQueue();
        store.update(context2);
        network.sendQueue();

        expect(sentVersions).toEqual([1, 2]);
      } finally {
        network.connection = null;
      }
    });

    it('should do nothing for non-existent object identifier', () => {
      store.update('non-existent');

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('isDeleted()', () => {
    it('should return true for deleted identifiers', () => {
      const obj = new GameObject('test-id-25');
      store.add(obj, false);
      store.delete(obj, false);

      expect(store.isDeleted('test-id-25')).toBe(true);
    });

    it('should return false for non-deleted identifiers', () => {
      expect(store.isDeleted('never-existed')).toBe(false);
    });

    it('should return false for active objects', () => {
      const obj = new GameObject('test-id-26');
      store.add(obj, false);

      expect(store.isDeleted('test-id-26')).toBe(false);
    });
  });

  describe('getCatalog()', () => {
    it('should return catalog of all objects', () => {
      const obj1 = new GameObject('test-id-27');
      const obj2 = new GameObject('test-id-28');
      store.add(obj1, false);
      store.add(obj2, false);

      const catalog = store.getCatalog();

      expect(catalog.length).toBe(2);
      const identifiers = catalog.map((item) => item.identifier);
      expect(identifiers).toContain('test-id-27');
      expect(identifiers).toContain('test-id-28');
    });

    it('should include version information', () => {
      const obj = new GameObject('test-id-29');
      store.add(obj, false);

      const catalog = store.getCatalog();

      expect(catalog[0]).toEqual({
        identifier: 'test-id-29',
        version: obj.version,
      });
    });

    it('should return empty array when no objects exist', () => {
      const catalog = store.getCatalog();

      expect(catalog).toEqual([]);
    });
  });

  describe('clearDeleteHistory()', () => {
    it('should clear delete history', () => {
      const obj = new GameObject('test-id-30');
      store.add(obj, false);
      store.delete(obj, false);

      expect(store.isDeleted('test-id-30')).toBe(true);

      store.clearDeleteHistory();

      expect(store.isDeleted('test-id-30')).toBe(false);
    });

    it('should allow adding previously deleted object after clearing history', () => {
      const obj1 = new GameObject('test-id-31');
      store.add(obj1, false);
      store.delete(obj1, false);
      store.clearDeleteHistory();

      const obj2 = new GameObject('test-id-31');
      const result = store.add(obj2, false);

      expect(result).toBe(obj2);
      expect(store.get('test-id-31')).toBe(obj2);
    });
  });

  describe('scheduleGarbageCollection()', () => {
    it('should evict old entries from garbageMap when size exceeds 100000', () => {
      vi.useFakeTimers();
      try {
        // Directly populate the garbageMap beyond 100000 entries
        const privateStore = asPrivate(store);
        const garbageMap = privateStore.garbageMap;
        const oldTimestamp = performance.now() - 11 * 60 * 1000; // 11 minutes ago
        for (let i = 0; i < 100002; i++) {
          garbageMap.set(`gc-test-${i}`, oldTimestamp);
        }

        expect(garbageMap.size).toBe(100002);

        // Trigger GC by adding and deleting one more object
        const triggerObj = new GameObject('gc-trigger');
        store.add(triggerObj, false);
        store.delete(triggerObj, false);

        // Advance timer to fire the garbageCollection setTimeout(1000)
        vi.advanceTimersByTime(1100);

        // Old entries should be evicted (size should be back to 100000 or fewer)
        expect(garbageMap.size).toBeLessThanOrEqual(100001);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not evict entries when garbageMap size is below 100000', () => {
      // Add and delete a small number of objects
      const obj = new GameObject('gc-small-test');
      store.add(obj, false);
      store.delete(obj, false);

      // Entry should remain in garbage map
      expect(store.isDeleted('gc-small-test')).toBe(true);
    });
  });

  describe('objectAdded$ / objectRemoved$ emit', () => {
    it('announces an addition', () => {
      const callback = vi.fn();
      const sub = objectAdded$.subscribe(callback);

      const obj = new GameObject('emit-add-1');
      store.add(obj, false);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        identifier: 'emit-add-1',
        aliasName: GameObject.aliasName,
      });
      sub();
    });

    it('announces nothing when the addition is a duplicate', () => {
      const obj = new GameObject('emit-add-2');
      store.add(obj, false);

      const callback = vi.fn();
      const sub = objectAdded$.subscribe(callback);

      store.add(obj, false); // duplicate → returns null

      expect(callback).not.toHaveBeenCalled();
      sub();
    });

    it('announces nothing when the identifier was deleted', () => {
      const obj = new GameObject('emit-add-3');
      store.add(obj, false);
      store.delete(obj, false);

      const callback = vi.fn();
      const sub = objectAdded$.subscribe(callback);

      const newObj = new GameObject('emit-add-3');
      store.add(newObj, false); // deleted → returns null

      expect(callback).not.toHaveBeenCalled();
      sub();
    });

    it('announces a removal', () => {
      const obj = new GameObject('emit-rm-1');
      store.add(obj, false);

      const callback = vi.fn();
      const sub = objectRemoved$.subscribe(callback);

      store.remove(obj);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        identifier: 'emit-rm-1',
        aliasName: GameObject.aliasName,
      });
      sub();
    });

    it('announces nothing for removing something that is not there', () => {
      const callback = vi.fn();
      const sub = objectRemoved$.subscribe(callback);

      const obj = new GameObject('emit-rm-2');
      store.remove(obj); // not in store → returns null

      expect(callback).not.toHaveBeenCalled();
      sub();
    });

    it('announces a removal from a delete, which goes through remove', () => {
      const obj = new GameObject('emit-del-1');
      store.add(obj, false);

      const callback = vi.fn();
      const sub = objectRemoved$.subscribe(callback);

      store.delete(obj, false);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        identifier: 'emit-del-1',
        aliasName: GameObject.aliasName,
      });
      sub();
    });

    it('announces the right identifier and alias', () => {
      const addedEvents: { identifier: string; aliasName: string }[] = [];
      const removedEvents: { identifier: string; aliasName: string }[] = [];
      const sub1 = objectAdded$.subscribe((e) => addedEvents.push(e));
      const sub2 = objectRemoved$.subscribe((e) => removedEvents.push(e));

      const obj1 = new GameObject('emit-multi-1');
      const obj2 = new GameObject('emit-multi-2');
      store.add(obj1, false);
      store.add(obj2, false);
      store.remove(obj1);

      expect(addedEvents).toHaveLength(2);
      expect(addedEvents[0].identifier).toBe('emit-multi-1');
      expect(addedEvents[1].identifier).toBe('emit-multi-2');
      expect(removedEvents).toHaveLength(1);
      expect(removedEvents[0].identifier).toBe('emit-multi-1');

      sub1();
      sub2();
    });
  });

  it('counts your own changes and not the ones that arrive', () => {
    const object = new GameObject('counted');
    object.initialize();
    const before = ObjectStore.instance.localChangeCountOf(object.identifier);

    object.update();

    // Telling your own change apart matters against values replaced by a load or a sync.
    expect(ObjectStore.instance.localChangeCountOf(object.identifier)).toBe(before + 1);

    object.apply(object.toContext());

    expect(ObjectStore.instance.localChangeCountOf(object.identifier)).toBe(before + 1);
  });
});

describe('sweeping the record of what was deleted', () => {
  it('sweeps once for a run of deletes rather than once per delete', () => {
    const store = ObjectStore.instance;
    const cooldown = asPrivate(store).garbageSweepCooldown;
    if (cooldown !== null) clearTimeout(cooldown);
    asPrivate(store).garbageSweepCooldown = null;
    const sweep = vi.spyOn(asPrivate(store), 'runGarbageCollection');

    for (let i = 0; i < 5; i++) {
      const object = DataElement.create(`gone-${i}`, '', {});
      object.initialize();
      store.delete(object, false);
    }

    expect(sweep).toHaveBeenCalledTimes(1);
    sweep.mockRestore();
  });
});
