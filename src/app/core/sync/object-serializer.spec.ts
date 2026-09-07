import { TestBed } from '@angular/core/testing';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { DataElement } from '@axe/domain/data/data-element';

describe('ObjectSerializer', () => {
  let serializer: ObjectSerializer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    serializer = ObjectSerializer.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('instance', () => {
    it('returns the one instance', () => {
      const instance1 = ObjectSerializer.instance;
      const instance2 = ObjectSerializer.instance;
      expect(instance1).toBe(instance2);
    });
  });

  describe('toXml()', () => {
    it('turns an object into an xml string', () => {
      const element = DataElement.create('test', 'value', {});
      const xml = serializer.toXml(element);

      expect(typeof xml).toBe('string');
      expect(xml).toContain('data');
      expect(xml.startsWith('<')).toBe(true);
    });

    it('writes the attributes into the xml', () => {
      const element = DataElement.create('name', 'hello', { type: 'text' });
      const xml = serializer.toXml(element);

      expect(xml).toContain('name');
    });

    it('encodes the special characters', () => {
      const element = DataElement.create('test', 'a&b<c>"d', {});
      const xml = serializer.toXml(element);

      expect(xml).not.toContain('&b');
      expect(xml).toContain('&amp;');
    });
  });

  describe('parseXml()', () => {
    it('builds an object back from an xml string', () => {
      const element = DataElement.create('test', 'value', {});
      const xml = serializer.toXml(element);

      const parsed = serializer.parseXml(xml);
      expect(parsed).toBeTruthy();
      expect(parsed).toBeInstanceOf(GameObject);
    });

    it('gives the restored object the same alias', () => {
      const element = DataElement.create('test', 'value', {});
      const xml = serializer.toXml(element);

      const parsed = serializer.parseXml(xml);
      expect(parsed?.aliasName).toBe(element.aliasName);
    });

    it('returns nothing for broken xml', () => {
      const parsed = serializer.parseXml('<unclosed');
      expect(parsed).toBeFalsy();
    });

    it('returns nothing for an empty string', () => {
      const parsed = serializer.parseXml('');
      expect(parsed).toBeFalsy();
    });

    it('returns nothing for a tag it does not know', () => {
      const parsed = serializer.parseXml('<unknownTag />');
      expect(parsed).toBeFalsy();
    });
  });

  describe('toAttributes()', () => {
    it('turns flat sync data into attributes', () => {
      const syncData = { name: 'test', value: 42 };
      const attrs = ObjectSerializer.toAttributes(syncData);

      expect(attrs['name']).toBe('test');
      expect(attrs['value']).toBe(42);
    });

    it('writes a nested object in dotted notation', () => {
      const syncData = { location: { x: 10, y: 20 } };
      const attrs = ObjectSerializer.toAttributes(syncData);

      expect(attrs['location.x']).toBe(10);
      expect(attrs['location.y']).toBe(20);
    });

    it('writes an array in dotted notation with indices', () => {
      const syncData = { items: ['a', 'b', 'c'] };
      const attrs = ObjectSerializer.toAttributes(syncData);

      expect(attrs['items.0']).toBe('a');
      expect(attrs['items.1']).toBe('b');
      expect(attrs['items.2']).toBe('c');
    });

    it('returns nothing for empty sync data', () => {
      const attrs = ObjectSerializer.toAttributes({});
      expect(Object.keys(attrs)).toHaveLength(0);
    });

    it('leaves an undefined nested value out rather than writing it as the word', () => {
      const syncData = { location: { name: 'table', x: 10, y: 20, surface: undefined } };
      const attrs = ObjectSerializer.toAttributes(syncData);

      expect(attrs['location.x']).toBe(10);
      expect(Object.keys(attrs)).not.toContain('location.surface');
    });
  });

  describe('undefined attributes in the xml', () => {
    it('never writes an undefined surface as the word undefined', () => {
      const element = DataElement.create('name', 'hello', { type: 'text' });
      (element as unknown as { location: Record<string, unknown> }).location = {
        name: 'table',
        x: 1,
        y: 2,
        surface: undefined,
      };
      const xml = serializer.toXml(element);

      expect(xml).not.toContain('surface="undefined"');
    });
  });

  describe('an attribute a number or a flag cannot be read from', () => {
    function parsed(xml: string): Record<string, unknown> {
      const element = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
      const syncData: Record<string, unknown> = { count: 7, ready: true, name: 'kept' };
      ObjectSerializer.parseAttributes(syncData, element.attributes);
      return syncData;
    }

    it('leaves the field at what it already held, rather than failing the whole object', () => {
      expect(parsed('<node count="" ready="" name="" />')).toEqual({ count: 7, ready: true, name: '' });
    });

    it('still reads everything the attribute does say', () => {
      expect(parsed('<node count="3" ready="false" name="written" />')).toEqual({
        count: 3,
        ready: false,
        name: 'written',
      });
    });

    it('passes over a word where a number was written down', () => {
      expect(parsed('<node count="many" />').count).toBe(7);
    });
  });

  describe('the xml round trip', () => {
    it('writing a data element out and reading it back', () => {
      const original = DataElement.create('testName', 'testValue', {}, 'round-trip-id');
      const xml = serializer.toXml(original);
      const restored = serializer.parseXml(xml) as DataElement;

      expect(restored).toBeTruthy();
      expect(restored.aliasName).toBe(original.aliasName);
    });
  });
});
