import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { RangeArea } from '@axe/domain/tabletop/range';

describe('RangeArea', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('is created with a name and a size', () => {
      const range = RangeArea.create('射程範囲', 3, 5, 80);
      expect(range).toBeTruthy();
      expect(range.name).toBe('射程範囲');
      expect(range.width).toBe(3);
      expect(range.length).toBe(5);
    });

    it('is created against an identifier of its own', () => {
      const range = RangeArea.create('range', 1, 1, 50, 'range-id');
      expect(range.identifier).toBe('range-id');
    });

    it('is added to the store', () => {
      const range = RangeArea.create('range', 1, 1, 50);
      expect(store.get(range.identifier)).toBe(range);
    });
  });

  describe('aliasName', () => {
    it('names itself a range', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.aliasName).toBe('range');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unlocked', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.isLock).toBe(false);
    });

    it('starts unturned', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.rotate).toBe(0);
    });

    it('starts as a cone', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.type).toBe('CORN');
    });

    it('takes the diamond by its older name as the diamond, turned no further', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      range.rotate = 10;

      range.type = 'DIAMOND';

      expect(range.type).toBe('RHOMBUS');
      expect(range.rotate).toBe(10);
    });

    it('starts at the default grid colour', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.gridColor).toBe('#FFFF00');
    });

    it('starts at the default range colour', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.rangeColor).toBe('#000000');
    });

    it('starts without the outline filled', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.fillOutLine).toBe(false);
    });

    it('starts unoffset across', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.offSetX).toBe(false);
    });

    it('starts unoffset down', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.offSetY).toBe(false);
    });
  });

  describe('isAltitudeIndicate', () => {
    it('is set as it is created', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.isAltitudeIndicate).toBe(true);
    });
  });

  describe('what it inherits', () => {
    it('starts on the table', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.location.name).toBe('table');
    });
  });

  describe('reading older saved data', () => {
    it('reads a diamond saved under its older name as the diamond it was saved as', () => {
      const range = ObjectSerializer.instance.parseXml('<range type="DIAMOND" rotate="0"></range>') as RangeArea;

      expect(range.type).toBe('RHOMBUS');
      expect(range.rotate).toBe(0);
    });

    it('reads the diamond back under its own name, never the older one an older version would turn', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      range.type = 'RHOMBUS';

      const saved = range.toXml();

      expect(saved).toContain('type="RHOMBUS"');
      expect(saved).not.toContain('DIAMOND');
    });

    it('reads free placement as it was saved, off where it was never saved, and off from the text false a version that does not know it passes on', () => {
      const free = RangeArea.create('test', 1, 1, 50);
      free.placesFreely = true;
      const saved = free.toXml();
      const parse = (xml: string) => ObjectSerializer.instance.parseXml(xml) as RangeArea;

      expect(saved).toContain('freePlacement="true"');
      expect(parse('<range type="CORN"></range>').placesFreely).toBe(false);
      expect(parse('<range type="CORN" freePlacement="false"></range>').placesFreely).toBe(false);
      expect(parse('<range type="CORN" freePlacement="true"></range>').placesFreely).toBe(true);
      const told = RangeArea.create('test', 1, 1, 50);
      (told as unknown as { freePlacement: unknown }).freePlacement = 'false';
      expect(told.placesFreely).toBe(false);
    });

    it('never places a shape of its own cells freely, as they keep to the cell its point is in', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      range.placesFreely = true;
      range.type = 'CUSTOM';

      expect(range.placesFreely).toBe(false);
    });

    it('reads a square saved turned an eighth as that turned square', () => {
      const range = ObjectSerializer.instance.parseXml('<range type="SQUARE" rotate="45"></range>') as RangeArea;

      expect(range.type).toBe('SQUARE');
      expect(range.rotate).toBe(45);
    });

    it('starts with no pattern and no grid of its own', () => {
      const range = RangeArea.create('test', 1, 1, 50);
      expect(range.cellPattern).toBe('');
      expect(range.customGridType).toBe('');
    });
  });

  describe('createCustom()', () => {
    it('saves the pattern and the grid of a custom shape', () => {
      const range = RangeArea.createCustom('カスタム', '0,0;1,0;0,1', 'square', 100);
      expect(range.type).toBe('CUSTOM');
      expect(range.cellPattern).toBe('0,0;1,0;0,1');
      expect(range.customGridType).toBe('square');
    });

    it('measures the width and the length from the cells', () => {
      const range = RangeArea.createCustom('L字', '0,0;1,0;2,0;0,1;0,2', 'square', 100);
      expect(range.width).toBe(3);
      expect(range.length).toBe(3);
    });

    it('keeps at least one cell either way', () => {
      const range = RangeArea.createCustom('空', '', 'square', 100);
      expect(range.width).toBe(1);
      expect(range.length).toBe(1);
      expect(range.cellPattern).toBe('');
    });

    it('takes the option that says it may be turned', () => {
      const rotatable = RangeArea.createCustom('回転可', '0,0', 'square', 100, { isRotatable: true });
      const fixed = RangeArea.createCustom('回転不可', '0,0', 'square', 100);
      expect(rotatable.isRotatable).toBe(true);
      expect(fixed.isRotatable).toBe(false);
    });
  });
});

describe('a range following a character', () => {
  it('centres itself on the character in the cells of the table it is on', () => {
    const character = GameCharacter.create('対象', 2, '');
    character.location.x = 100;
    character.location.y = 200;
    const range = RangeArea.create('範囲', 3, 5, 1);
    range.followingCharacterIdentifier = character.identifier;

    range.following(80);

    expect([range.location.x, range.location.y]).toEqual([180, 280]);
    character.destroy();
    range.destroy();
  });

  it('stops following a character that is not there', () => {
    const range = RangeArea.create('範囲', 3, 5, 1);
    range.followingCharacterIdentifier = 'missing-id';

    range.following(50);

    expect(range.followingCharacterIdentifier).toBe('');
    range.destroy();
  });
});

describe('fitting a range to its cell pattern', () => {
  it('sizes it to the box round the pattern, at least one cell each way', () => {
    const range = RangeArea.create('範囲', 3, 5, 1);
    range.cellPattern = '0,0;2,0;0,3';

    range.fitToPattern();

    expect([range.width, range.length]).toEqual([3, 4]);

    range.cellPattern = '';
    range.fitToPattern();

    expect([range.width, range.length]).toEqual([1, 1]);
    range.destroy();
  });
});

describe('The saved name of what it follows.', () => {
  it('leaves the saved name misspelt as it is', () => {
    // It is the name in the room data already out there and in use by everybody else at the
    // table; changing it to fix the spelling here would lose the target in older data and break step with them.
    const range = RangeArea.create('範囲', 3, 5, 1);
    range.followingCharacterIdentifier = 'char-1';

    expect(range.toXml()).toContain('followingCharctorIdentifier="char-1"');
  });

  it('reads room data written under that name', () => {
    const restored = ObjectSerializer.instance.parseXml(
      '<range name="範囲" followingCharctorIdentifier="char-1"></range>'
    ) as RangeArea;

    expect(restored.followingCharacterIdentifier).toBe('char-1');
  });
});

describe('a range standing up off the table', () => {
  const parse = (xml: string) => ObjectSerializer.instance.parseXml(xml) as RangeArea;

  it('reads a range saved before it could stand up as flat, at the default height, reach and tip', () => {
    const range = parse('<range type="CIRCLE"></range>');

    expect(range.solidKind).toBe('');
    expect(range.isSolid).toBe(false);
    expect(range.columnHeight).toBe(3);
    expect(range.reachSquares).toBe(6);
    expect(range.aimPitch).toBe(0);
    expect(range.casterOffset).toEqual({ x: 0, y: 0 });
  });

  it('saves what it stands up as and reads it back as it was', () => {
    const range = RangeArea.create('test', 1, 3, 50);
    range.type = 'CIRCLE';
    range.solidKind = 'sphere';
    range.columnHeight = 4.5;
    range.reachSquares = 8;
    range.aimPitch = -30;
    range.casterOffset = { x: 2, y: -1.5 };

    const saved = range.toXml();
    expect(saved).toContain('solid="sphere"');
    expect(saved).toContain('solidHeight="4.5"');
    expect(saved).toContain('solidReach="8"');
    expect(saved).toContain('pitch="-30"');
    expect(saved).toContain('casterOffsetX="2" casterOffsetY="-1.5"');
    range.destroy();

    const read = parse(
      '<range type="CIRCLE" solid="sphere" solidHeight="4.5" solidReach="8" pitch="-30" casterOffsetX="2" casterOffsetY="-1.5"></range>'
    );

    expect(read.solidKind).toBe('sphere');
    expect(read.columnHeight).toBe(4.5);
    expect(read.reachSquares).toBe(8);
    expect(read.aimPitch).toBe(-30);
    expect(read.casterOffset).toEqual({ x: 2, y: -1.5 });
    read.destroy();
  });

  it('reads the empty text a version that does not know the fields passes on as the defaults, never as nought', () => {
    const range = parse(
      '<range type="CORN" solid="" solidHeight="" solidReach="" pitch="" casterOffsetX="" casterOffsetY=""></range>'
    );

    expect(range.solidKind).toBe('');
    expect(range.columnHeight).toBe(3);
    expect(range.reachSquares).toBe(6);
    expect(range.aimPitch).toBe(0);
    expect(range.casterOffset).toEqual({ x: 0, y: 0 });
    range.destroy();
  });

  it('falls back to the defaults, not to nothing a number, when the fields arrive missing', () => {
    const range = RangeArea.create('test', 1, 3, 50);
    const context = range.toContext();
    range.apply({ ...context, syncData: { ...context.syncData, attributes: {} } });

    expect(range.solidKind).toBe('');
    expect(range.columnHeight).toBe(3);
    expect(range.reachSquares).toBe(6);
    expect(range.aimPitch).toBe(0);
    expect(range.casterOffset).toEqual({ x: 0, y: 0 });
    range.destroy();
  });

  it('stays standing when a version that does not know the fields moves it, as that version passes them back on', () => {
    const range = RangeArea.create('test', 1, 3, 50);
    range.type = 'CIRCLE';
    range.solidKind = 'column';
    range.columnHeight = 2;
    const older = range.toContext();
    const attributes = older.syncData['attributes'] as Record<string, unknown>;
    attributes['location'] = { name: 'table', x: 300, y: 400 };
    older.majorVersion += 1;

    range.apply(older);

    expect(range.location.x).toBe(300);
    expect(range.solidKind).toBe('column');
    expect(range.columnHeight).toBe(2);
    range.destroy();
  });

  it('reads a kind nobody knows as flat, and a round kind its shape cannot take as a column', () => {
    expect(parse('<range type="CIRCLE" solid="dome"></range>').solidKind).toBe('');
    expect(parse('<range type="SQUARE" solid="sphere"></range>').solidKind).toBe('column');
    expect(parse('<range type="CORN" solid="cone"></range>').solidKind).toBe('cone');
  });

  it('keeps a tip between straight down and straight up, and a reach no less than nought', () => {
    const range = parse('<range type="CORN" pitch="120" solidReach="-2"></range>');

    expect(range.aimPitch).toBe(90);
    expect(range.reachSquares).toBe(0);
    range.destroy();
  });
});

describe('a solid range following a character', () => {
  it('stands a sphere or a column as far off the character as it was put', () => {
    const character = GameCharacter.create('対象', 2, '');
    character.location.x = 100;
    character.location.y = 200;
    const range = RangeArea.create('範囲', 3, 5, 1);
    range.type = 'CIRCLE';
    range.solidKind = 'sphere';
    range.casterOffset = { x: 1.5, y: -2 };
    range.followingCharacterIdentifier = character.identifier;

    range.following(80);

    expect([range.location.x, range.location.y]).toEqual([300, 120]);
    character.destroy();
    range.destroy();
  });

  it('starts a cone, a beam and a flat range from the middle of the character whatever offset it holds', () => {
    const character = GameCharacter.create('対象', 1, '');
    character.location.x = 0;
    character.location.y = 0;
    for (const [type, kind] of [
      ['CORN', 'cone'],
      ['LINE', 'beam'],
      ['CIRCLE', ''],
    ] as const) {
      const range = RangeArea.create('範囲', 3, 5, 1);
      range.type = type;
      range.solidKind = kind;
      range.casterOffset = { x: 3, y: 3 };
      range.followingCharacterIdentifier = character.identifier;

      range.following(50);

      expect([range.location.x, range.location.y]).toEqual([25, 25]);
      range.destroy();
    }
    character.destroy();
  });
});
