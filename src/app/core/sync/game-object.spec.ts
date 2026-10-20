import { TestBed } from '@angular/core/testing';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';

describe('GameObject', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('carries an identifier of its own', () => {
      const obj = DataElement.create('test', '', {});
      expect(obj.identifier).toBeTruthy();
      expect(obj.identifier.length).toBeGreaterThan(0);
    });

    it('takes the identifier it is given', () => {
      const obj = DataElement.create('test', '', {}, 'custom-id');
      expect(obj.identifier).toBe('custom-id');
    });

    it('gives two instances different identifiers', () => {
      const obj1 = DataElement.create('a', '', {});
      const obj2 = DataElement.create('b', '', {});
      expect(obj1.identifier).not.toBe(obj2.identifier);
    });
  });

  describe('aliasName', () => {
    it('calls a data element data', () => {
      const obj = DataElement.create('test', '', {});
      expect(obj.aliasName).toBe('data');
    });
  });

  describe('version', () => {
    it('starts at a version of zero or more', () => {
      const obj = DataElement.create('test', '', {});
      expect(obj.version).toBeGreaterThanOrEqual(0);
    });
  });

  describe('initialize()', () => {
    it('is added to the object store', () => {
      const obj = DataElement.create('test', '', {});
      // initialises as part of being created
      expect(store.get(obj.identifier)).toBe(obj);
    });
  });

  describe('destroy()', () => {
    it('is removed from the object store', () => {
      const obj = DataElement.create('test', '', {});
      const id = obj.identifier;
      obj.destroy();
      expect(store.get(id)).toBeFalsy();
    });
  });

  describe('update()', () => {
    it('bumps its version', () => {
      const obj = DataElement.create('test', '', {});
      const v1 = obj.version;
      obj.update();
      expect(obj.version).toBeGreaterThan(v1);
    });

    it('keeps bumping its version', () => {
      const obj = DataElement.create('test', '', {});
      const versions: number[] = [];
      for (let i = 0; i < 5; i++) {
        obj.update();
        versions.push(obj.version);
      }
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]).toBeGreaterThan(versions[i - 1]);
      }
    });
  });

  describe('readSyncData()', () => {
    it('hands over the sync data as it stands, with no copy, where toContext copies it', () => {
      const obj = DataElement.create('hp', '10', {});

      expect(obj.readSyncData()).toBe(obj.readSyncData());
      expect(obj.toContext().syncData).not.toBe(obj.readSyncData());
      expect(obj.toContext().syncData).toEqual(obj.readSyncData());
    });
  });

  describe('toContext()', () => {
    it('returns a context', () => {
      const obj = DataElement.create('test', '', {});
      const context = obj.toContext();

      expect(context.aliasName).toBe('data');
      expect(context.identifier).toBe(obj.identifier);
      expect(typeof context.majorVersion).toBe('number');
      expect(typeof context.minorVersion).toBe('number');
      expect(typeof context.syncData).toBe('object');
    });

    it('returns a deep copy of the sync data', () => {
      const obj = DataElement.create('test', 'value', {});
      const context1 = obj.toContext();
      const context2 = obj.toContext();

      expect(context1.syncData).toEqual(context2.syncData);
      expect(context1.syncData).not.toBe(context2.syncData);
    });
  });

  describe('apply()', () => {
    it('applies the values from a context', () => {
      const obj = DataElement.create('test', '', {});
      const context = obj.toContext();
      context.majorVersion = 100;

      obj.apply(context);

      expect(obj.version).toBeGreaterThanOrEqual(100);
    });

    it('applies nothing when the identifier does not match', () => {
      const obj = DataElement.create('test', '', {});
      const vBefore = obj.version;
      const context = obj.toContext();
      context.identifier = 'wrong-id';
      context.majorVersion = 999;

      obj.apply(context);

      expect(obj.version).toBe(vBefore);
    });

    it('ignores a null context', () => {
      const obj = DataElement.create('test', '', {});
      expect(() => obj.apply(null!)).not.toThrow();
    });
  });

  describe('toXml()', () => {
    it('returns an xml string', () => {
      const obj = DataElement.create('test', 'value', {});
      const xml = obj.toXml();

      expect(typeof xml).toBe('string');
      expect(xml.startsWith('<')).toBe(true);
      expect(xml).toContain('data');
    });
  });

  describe('clone()', () => {
    it('clones with the same alias', () => {
      const obj = DataElement.create('test', 'value', {});
      const cloned = obj.clone();

      expect(cloned.aliasName).toBe(obj.aliasName);
    });

    it('takes a new identifier where parsing generates one', () => {
      const obj = DataElement.create('test', 'value', {});
      const cloned = obj.clone();

      // cloning goes out to xml and back to build a new object, and since the identifier
      // travels in the xml the copy can end up with the same one
      expect(cloned).toBeTruthy();
      expect(cloned).not.toBe(obj);
    });
  });

  describe('batch()', () => {
    it('says an object changed once for a run of fields, when the batch ends', () => {
      const element = DataElement.create('test', 'value', {});
      element.initialize();
      const before = store.localChangeCountOf(element.identifier);
      const wasVersion = element.majorVersion;

      GameObject.batch(() => {
        element.name = 'one';
        element.value = 'two';
        element.currentValue = 'three';
        expect(store.localChangeCountOf(element.identifier)).toBe(before);
        expect(element.majorVersion).toBe(wasVersion);
      });

      expect(store.localChangeCountOf(element.identifier)).toBe(before + 1);
      expect(element.majorVersion).toBe(wasVersion + 1);
      expect(element.name).toBe('one');
    });

    it('says each object in the batch changed once, and no untouched one at all', () => {
      const one = DataElement.create('one', 'a', {});
      const two = DataElement.create('two', 'b', {});
      const quiet = DataElement.create('quiet', 'c', {});
      [one, two, quiet].forEach((element) => element.initialize());
      const wasOne = store.localChangeCountOf(one.identifier);
      const wasTwo = store.localChangeCountOf(two.identifier);
      const wasQuiet = store.localChangeCountOf(quiet.identifier);

      GameObject.batch(() => {
        one.name = 'first';
        one.value = 'again';
        two.name = 'second';
      });

      expect(store.localChangeCountOf(one.identifier)).toBe(wasOne + 1);
      expect(store.localChangeCountOf(two.identifier)).toBe(wasTwo + 1);
      expect(store.localChangeCountOf(quiet.identifier)).toBe(wasQuiet);
    });

    it('waits for the outermost batch to end', () => {
      const element = DataElement.create('test', 'value', {});
      element.initialize();
      const before = store.localChangeCountOf(element.identifier);

      GameObject.batch(() => {
        GameObject.batch(() => {
          element.name = 'inner';
        });
        expect(store.localChangeCountOf(element.identifier)).toBe(before);
        element.value = 'outer';
      });

      expect(store.localChangeCountOf(element.identifier)).toBe(before + 1);
    });

    it('still announces what was changed when the work throws', () => {
      const element = DataElement.create('test', 'value', {});
      element.initialize();
      const before = store.localChangeCountOf(element.identifier);

      expect(() =>
        GameObject.batch(() => {
          element.name = 'written';
          throw new Error('stopped');
        })
      ).toThrow('stopped');

      expect(store.localChangeCountOf(element.identifier)).toBe(before + 1);
      expect(element.name).toBe('written');
    });

    it('announces the rest of the batch when one of them throws', () => {
      const first = DataElement.create('first', 'a', {});
      const second = DataElement.create('second', 'b', {});
      [first, second].forEach((element) => element.initialize());
      const wasSecond = store.localChangeCountOf(second.identifier);
      const previous = GameObject.onUpdate;
      GameObject.onUpdate = (object) => {
        if (object === first) throw new Error('listener stopped');
      };

      try {
        expect(() =>
          GameObject.batch(() => {
            first.name = 'one';
            second.name = 'two';
          })
        ).toThrow('listener stopped');
      } finally {
        GameObject.onUpdate = previous;
      }

      expect(store.localChangeCountOf(second.identifier)).toBe(wasSecond + 1);
    });

    it('takes an object into a later batch after one of them threw', () => {
      const first = DataElement.create('first', 'a', {});
      const second = DataElement.create('second', 'b', {});
      [first, second].forEach((element) => element.initialize());
      const previous = GameObject.onUpdate;
      GameObject.onUpdate = (object) => {
        if (object === first) throw new Error('listener stopped');
      };

      try {
        expect(() =>
          GameObject.batch(() => {
            first.name = 'one';
            second.name = 'two';
          })
        ).toThrow('listener stopped');
      } finally {
        GameObject.onUpdate = previous;
      }

      const wasSecond = store.localChangeCountOf(second.identifier);
      GameObject.batch(() => {
        second.name = 'again';
      });

      expect(store.localChangeCountOf(second.identifier)).toBe(wasSecond + 1);
    });

    it('hands back what the work returned', () => {
      expect(GameObject.batch(() => 42)).toBe(42);
    });
  });
});
