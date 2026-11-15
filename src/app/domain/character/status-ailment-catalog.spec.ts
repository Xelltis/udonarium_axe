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
    StatusAilmentCatalog.forget();
  });

  afterEach(() => {
    clearStore();
    StatusAilmentCatalog.forget();
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

  describe('whether putting a state on plays its effect', () => {
    afterEach(() => {
      StatusAilmentCatalog.instance.playsEffectOnPlant = false;
    });

    it('is off in a room just started', () => {
      expect(StatusAilmentCatalog.instance.playsEffectOnPlant).toBe(false);
      expect(ObjectSerializer.instance.toXml(StatusAilmentCatalog.instance)).not.toContain('plantEffect="true"');
    });

    it('reads as off from a room saved before it could be asked for, even over a room that had asked', () => {
      const room = StatusAilmentCatalog.instance;
      room.playsEffectOnPlant = true;

      ObjectSerializer.instance.parseXml(
        '<status-ailment-catalog identifier="LoadedCatalog">毒</status-ailment-catalog>'
      );

      expect(StatusAilmentCatalog.instance).toBe(room);
      expect(room.playsEffectOnPlant).toBe(false);
    });

    it('comes back as it was saved, on and off', () => {
      for (const asked of [true, false]) {
        StatusAilmentCatalog.instance.ailments = [newStatusAilment('毒')];
        StatusAilmentCatalog.instance.playsEffectOnPlant = asked;
        const xml = ObjectSerializer.instance.toXml(StatusAilmentCatalog.instance);
        StatusAilmentCatalog.instance.playsEffectOnPlant = !asked;

        ObjectSerializer.instance.parseXml(xml.replace('identifier="StatusAilmentCatalog"', 'identifier="Loaded"'));

        expect(StatusAilmentCatalog.instance.playsEffectOnPlant, `${asked}`).toBe(asked);
        expect(StatusAilmentCatalog.instance.ailments.map((entry) => entry.name)).toEqual(['毒']);
      }
    });

    it('reads anything but a plain yes as off: no value, an empty one, a number or a word', () => {
      for (const written of ['', 'plantEffect=""', 'plantEffect="1"', 'plantEffect="on"', 'plantEffect="TRUE"']) {
        StatusAilmentCatalog.instance.playsEffectOnPlant = true;

        ObjectSerializer.instance.parseXml(
          `<status-ailment-catalog identifier="LoadedCatalog" ${written}>毒</status-ailment-catalog>`
        );

        expect(StatusAilmentCatalog.instance.playsEffectOnPlant, written).toBe(false);
      }
    });

    it('is told to the room only when it changes', () => {
      const room = StatusAilmentCatalog.instance;
      const update = vi.spyOn(room, 'update');

      room.playsEffectOnPlant = false;
      expect(update).not.toHaveBeenCalled();
      room.playsEffectOnPlant = true;
      expect(update).toHaveBeenCalledTimes(1);
      update.mockRestore();
    });
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
