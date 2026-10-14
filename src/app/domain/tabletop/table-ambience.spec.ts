import { TestBed } from '@angular/core/testing';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ambiencePalette } from '@axe/domain/effect/ambience/ambience-kind';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';

describe('TableAmbience', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('is created with a name and an area', () => {
    const ambience = TableAmbience.create('毒沼', 'swamp', 4, 6);
    expect(ambience.name).toBe('毒沼');
    expect(ambience.kind).toBe('swamp');
    expect(ambience.width).toBe(4);
    expect(ambience.height).toBe(6);
  });

  it('takes a new area', () => {
    const ambience = TableAmbience.create('毒沼', 'swamp', 4, 4);
    ambience.width = 10;
    ambience.height = 2;
    expect(ambience.width).toBe(10);
    expect(ambience.height).toBe(2);
  });

  it('falls back to the marsh for a kind it cannot read', () => {
    const ambience = TableAmbience.create('場', 'swamp', 2, 2);
    ambience.ambienceKind = 'unknown';
    expect(ambience.kind).toBe('swamp');
  });

  it('falls back to the colour of its kind when none is given', () => {
    const ambience = TableAmbience.create('溶岩', 'lava', 2, 2);
    expect(ambience.color).toBe(ambiencePalette('lava').primary);
    ambience.ambienceColor = '#123456';
    expect(ambience.color).toBe('#123456');
  });

  it('keeps the density between none and all', () => {
    const ambience = TableAmbience.create('場', 'swamp', 2, 2);
    ambience.ambienceDensity = 5;
    expect(ambience.density).toBe(1);
    ambience.ambienceDensity = -1;
    expect(ambience.density).toBe(0);
  });

  it('offsets the phase by the identifier', () => {
    const a = TableAmbience.create('場', 'swamp', 2, 2, 'ambience-a');
    const b = TableAmbience.create('場', 'swamp', 2, 2, 'ambience-b');
    expect(a.phaseOffset).not.toBe(b.phaseOffset);
  });

  describe('the height of the water', () => {
    it('stands knee deep when first laid', () => {
      const pond = TableAmbience.create('池', 'water', 2, 2);
      expect(pond.surface).toBe(0.5);
    });

    it('reads an empty value as knee deep rather than as a drained pond', () => {
      const pond = TableAmbience.create('池', 'water', 2, 2);
      pond.surfaceHeight = '' as unknown as number;
      expect(pond.surface).toBe(0.5);
    });

    it('reads an empty murkiness as a little murky rather than as clear', () => {
      const pond = TableAmbience.create('池', 'water', 2, 2);
      expect(pond.murk).toBe(0.15);
      pond.turbidity = '' as unknown as number;
      expect(pond.murk).toBe(0.15);
      pond.turbidity = 0.8;
      expect(pond.murk).toBe(0.8);
    });

    it('reads empty floating leaves as none', () => {
      const pond = TableAmbience.create('池', 'water', 2, 2);
      expect(pond.leaves).toBe(0);
      pond.floatingLeaves = '' as unknown as number;
      expect(pond.leaves).toBe(0);
      pond.floatingLeaves = 0.6;
      expect(pond.leaves).toBe(0.6);
    });

    it('reads an empty dirt as clean', () => {
      const pond = TableAmbience.create('池', 'water', 2, 2);
      expect(pond.dirt).toBe(0);
      pond.dirtiness = '' as unknown as number;
      expect(pond.dirt).toBe(0);
      pond.dirtiness = 0.7;
      expect(pond.dirt).toBe(0.7);
    });

    it('reads an area laid by a peer that knows nothing of the height as knee deep', () => {
      const pond = TableAmbience.create('池', 'water', 2, 2, 'pond-from-an-older-peer');
      const context = pond.toContext();
      delete (context.syncData['attributes'] as Record<string, unknown>)['surfaceHeight'];

      pond.apply(context);

      expect(pond.surface).toBe(0.5);
    });

    it('keeps the height through a change sent back by a peer that knows nothing of it', () => {
      // An older peer holds the whole bag of attributes it was sent, and sends the whole bag back.
      const pond = TableAmbience.create('池', 'water', 2, 2, 'pond-edited-by-an-older-peer');
      pond.surfaceHeight = 2;
      const context = pond.toContext();
      (context.syncData['attributes'] as Record<string, unknown>)['ambienceDensity'] = 0.2;
      context.majorVersion += 1;

      pond.apply(context);

      expect(pond.surface).toBe(2);
      expect(pond.density).toBeCloseTo(0.2);
    });
  });

  describe('saving into the room data', () => {
    it('is registered with the factory', () => {
      const object = ObjectFactory.instance.create('table-ambience');
      expect(object).toBeInstanceOf(TableAmbience);
      object?.destroy();
    });

    it('is written out as a child of the table', () => {
      const table = new GameTable();
      table.initialize();
      const ambience = TableAmbience.create('毒沼', 'swamp', 4, 6);
      ambience.ambienceDensity = 0.8;
      ambience.ambienceColor = '#123456';
      table.appendChild(ambience);

      const xml = ObjectSerializer.instance.toXml(table);

      expect(xml).toContain('<table-ambience');
      expect(xml).toContain('ambienceKind="swamp"');
      expect(xml).toContain('ambienceColor="#123456"');
      expect(xml).toContain('ambienceDensity="0.8"');
      expect(xml).toContain('>毒沼</data>');
    });

    it('is restored from what was written', () => {
      const ambience = TableAmbience.create('毒沼', 'swamp', 4, 6);
      ambience.ambienceDensity = 0.8;
      ambience.ambienceColor = '#123456';

      // The parser of happy-dom refuses an attribute name with a dot in it, so the position is
      // dropped and the rest read back; restoring a position is settled by the shared machinery.
      const xml = ObjectSerializer.instance.toXml(ambience).replace(/location\.[a-z]+="[^"]*"\s*/g, '');

      const restored = ObjectSerializer.instance.parseXml(xml) as TableAmbience;

      expect(restored).toBeInstanceOf(TableAmbience);
      expect(restored.name).toBe('毒沼');
      expect(restored.kind).toBe('swamp');
      expect(restored.width).toBe(4);
      expect(restored.height).toBe(6);
      expect(restored.density).toBeCloseTo(0.8);
      expect(restored.color).toBe('#123456');
    });

    it('keeps the height of the water through a save', () => {
      const pond = TableAmbience.create('池', 'water', 3, 3);
      pond.surfaceHeight = 1.5;

      const xml = ObjectSerializer.instance.toXml(pond).replace(/location\.[a-z]+="[^"]*"\s*/g, '');
      expect(xml).toContain('ambienceKind="water"');
      expect(xml).toContain('surfaceHeight="1.5"');

      const restored = ObjectSerializer.instance.parseXml(xml) as TableAmbience;
      expect(restored.kind).toBe('water');
      expect(restored.surface).toBe(1.5);
    });

    it('reads a marsh saved before water existed just as before', () => {
      const marsh = TableAmbience.create('毒沼', 'swamp', 4, 6);
      const xml = ObjectSerializer.instance
        .toXml(marsh)
        .replace(/location\.[a-z]+="[^"]*"\s*/g, '')
        .replace(/surfaceHeight="[^"]*"\s*/, '');
      expect(xml).not.toContain('surfaceHeight');

      const restored = ObjectSerializer.instance.parseXml(xml) as TableAmbience;

      expect(restored.kind).toBe('swamp');
      expect(restored.width).toBe(4);
      expect(restored.height).toBe(6);
      expect(restored.density).toBeCloseTo(0.6);
      expect(restored.surface).toBe(0.5);
    });

    it('writes the weather of the table out', () => {
      const table = new GameTable();
      table.initialize();
      table.weatherKind = 'rain';
      table.weatherDensity = 0.4;

      const xml = ObjectSerializer.instance.toXml(table);

      expect(xml).toContain('weatherKind="rain"');
      expect(xml).toContain('weatherDensity="0.4"');
    });
  });
});
