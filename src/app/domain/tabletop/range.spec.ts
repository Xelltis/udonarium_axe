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
