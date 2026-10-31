import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';

describe('StatusAilmentCatalog', () => {
  function clearStore(): void {}

  beforeEach(() => {
    TestBed.configureTestingModule({});
    clearStore();
    (StatusAilmentCatalog as unknown as Record<string, unknown>)['_instance'] = undefined;
  });

  afterEach(() => {
    clearStore();
    (StatusAilmentCatalog as unknown as Record<string, unknown>)['_instance'] = undefined;
  });

  it('holds one catalogue for the room', () => {
    expect(StatusAilmentCatalog.instance).toBe(StatusAilmentCatalog.instance);
  });

  it('makes one anew once the one held has left the store, rather than putting that one back', () => {
    const held = StatusAilmentCatalog.instance;
    held.ailments = [newStatusAilment('毒')];

    ObjectStore.instance.delete(held, false);

    expect(StatusAilmentCatalog.instance).not.toBe(held);
    expect(StatusAilmentCatalog.instance.ailments).toEqual([]);
  });

  it('starts with nothing on hand', () => {
    expect(StatusAilmentCatalog.instance.ailments).toEqual([]);
  });

  it('keeps what is put on it', () => {
    StatusAilmentCatalog.instance.ailments = [newStatusAilment('毒'), { ...newStatusAilment('加護'), rounds: 3 }];

    expect(StatusAilmentCatalog.instance.ailments.map((entry) => entry.name)).toEqual(['毒', '加護']);
    expect(StatusAilmentCatalog.instance.ailments[1].rounds).toBe(3);
  });

  it('writes the states into saved data a line at a time', () => {
    StatusAilmentCatalog.instance.ailments = [newStatusAilment('毒'), newStatusAilment('麻痺')];

    const xml = ObjectSerializer.instance.toXml(StatusAilmentCatalog.instance);

    // A newline in an attribute is folded into a space when the xml is read back, so the
    // list has to sit in the body of the element.
    expect(xml).toContain('毒\n麻痺');
  });

  it('reads a loaded catalogue into the one the room already has', () => {
    const room = StatusAilmentCatalog.instance;
    room.ailments = [newStatusAilment('古い')];

    ObjectSerializer.instance.parseXml(
      '<status-ailment-catalog identifier="LoadedCatalog">毒 color:green\n麻痺</status-ailment-catalog>'
    );

    expect(StatusAilmentCatalog.instance).toBe(room);
    expect(room.ailments.map((entry) => entry.name)).toEqual(['毒', '麻痺']);
    expect(room.ailments[0].color).toBe('green');
  });
});
