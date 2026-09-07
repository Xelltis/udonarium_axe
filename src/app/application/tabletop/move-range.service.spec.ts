import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { countCells } from '@axe/domain/tabletop/move/reachable-cells';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;

describe('MoveRangeService', () => {
  let service: MoveRangeService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(MoveRangeService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number | string | null, unit?: string): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    const field = DataElement.findElementByReference(character.rootDataElement!, '移動')!;
    if (walk === null) {
      field.destroy();
      return character;
    }
    field.value = walk;
    if (unit !== undefined) field.setAttribute(DataElementAttribute.UNIT, unit);
    return character;
  }

  function wallOver(col: number, fromRow: number, depthCells: number): Terrain {
    const terrain = Terrain.create('壁', 1, depthCells, 1, '', '');
    terrain.location = { name: 'table', x: col * GRID, y: fromRow * GRID };
    table.appendChild(terrain);
    return terrain;
  }

  it('shows what a piece can reach the moment it is picked up', () => {
    service.show(pieceAt(5, 5, 2));

    const view = service.range();
    expect(view).not.toBeNull();
    expect(countCells(view!.cells)).toBe(24);
    expect(view!.cells.get(cellIndexOf(view!.grid, 7, 5))).toBe(true);
  });

  it('shows nothing once it is put down', () => {
    service.show(pieceAt(5, 5, 2));
    service.hide();
    expect(service.range()).toBeNull();
  });

  it('shows nothing when the table has the range turned off', () => {
    table.moveRangeEnabled = false;
    service.show(pieceAt(5, 5, 2));
    expect(service.range()).toBeNull();
  });

  it('shows nothing for a piece whose sheet says nothing about walking', () => {
    service.show(pieceAt(5, 5, null));
    expect(service.range()).toBeNull();
  });

  it('shows nothing for a piece that could not take a step', () => {
    service.show(pieceAt(5, 5, 0));
    expect(service.range()).toBeNull();
  });

  it('walks round a wall rather than through it', () => {
    wallOver(6, 3, 4);

    service.show(pieceAt(5, 5, 3));

    const view = service.range()!;
    expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(false);
    expect(view.cells.get(cellIndexOf(view.grid, 7, 5))).toBe(false);
    expect(view.cells.get(cellIndexOf(view.grid, 5, 2))).toBe(true);
  });

  it('walks through a door somebody has opened', () => {
    const door = wallOver(6, 3, 4);
    door.doorStyle = DoorStyle.SWING;
    door.isDoorOpen = true;

    service.show(pieceAt(5, 5, 3));

    const view = service.range()!;
    expect(view.cells.get(cellIndexOf(view.grid, 7, 5))).toBe(true);
  });

  it('counts a wall that lets sight past as a wall all the same', () => {
    const glass = wallOver(6, 3, 4);
    glass.blocksSight = false;

    service.show(pieceAt(5, 5, 3));

    expect(service.range()!.cells.get(cellIndexOf(service.range()!.grid, 7, 5))).toBe(false);
  });

  it('leaves out the cells other pieces are standing on, where the table forbids sharing', () => {
    table.piecesShareCells = false;
    const standing = pieceAt(6, 5, 1);
    table.appendChild(standing);
    service.show(pieceAt(5, 5, 2));

    const view = service.range()!;
    expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(false);
    // Round it rather than through it: the ground beyond is reached by another way.
    expect(view.cells.get(cellIndexOf(view.grid, 7, 5))).toBe(true);
  });

  it('stands in the way rather than being walked through', () => {
    table.piecesShareCells = false;
    // A corridor one cell wide, with somebody standing in it.
    wallOver(6, 0, 5);
    wallOver(6, 6, 6);
    table.appendChild(pieceAt(6, 5, 1));
    service.show(pieceAt(5, 5, 4));

    const view = service.range()!;
    expect(view.cells.get(cellIndexOf(view.grid, 7, 5))).toBe(false);
  });

  it('walks the corridor once the one standing in it may be shared with', () => {
    table.piecesShareCells = true;
    wallOver(6, 0, 5);
    wallOver(6, 6, 6);
    table.appendChild(pieceAt(6, 5, 1));
    service.show(pieceAt(5, 5, 4));

    const view = service.range()!;
    expect(view.cells.get(cellIndexOf(view.grid, 7, 5))).toBe(true);
  });

  it('lets a piece stop on another where the table allows sharing', () => {
    const standing = pieceAt(6, 5, 1);
    table.appendChild(standing);
    service.show(pieceAt(5, 5, 2));

    const view = service.range()!;
    expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(true);
  });

  it('keeps the ground a big piece takes up, not just the cell it stands on', () => {
    table.piecesShareCells = false;
    const golem = pieceAt(6, 5, 1);
    DataElement.findElementByReference(golem.rootDataElement!, 'size')!.value = 2;
    table.appendChild(golem);
    service.show(pieceAt(5, 5, 3));

    const view = service.range()!;
    expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(false);
    expect(view.cells.get(cellIndexOf(view.grid, 7, 6))).toBe(false);
  });

  it('hands over the ground the enemies hold, so it can be shown while the piece is up', () => {
    table.zocMode = 'stop';
    const foe = pieceAt(7, 5, 1);
    foe.isNpc = true;
    service.show(pieceAt(5, 5, 3));

    const view = service.range()!;
    expect(view.held).not.toBeNull();
    expect(view.held!.get(cellIndexOf(view.grid, 6, 5))).toBe(true);
    expect(view.held!.get(cellIndexOf(view.grid, 5, 5))).toBe(false);
  });

  it('hands over no held ground where the table holds none', () => {
    const foe = pieceAt(7, 5, 1);
    foe.isNpc = true;
    service.show(pieceAt(5, 5, 3));

    expect(service.range()!.held).toBeNull();
  });

  describe('what a reach is, and is not, answerable for', () => {
    // Config outlives a test, so a room that asked for strict moves would ask it of every
    // test that ran afterwards.
    afterEach(() => {
      Config.instance.moveStrict = false;
    });

    it('shows what the piece can reach while it is carried, and nothing once it is let go', () => {
      const piece = pieceAt(5, 5, 2);
      service.show(piece);
      expect(service.range()).not.toBeNull();

      service.hide();

      expect(service.range()).toBeNull();
    });

    it('leaves where a piece is set down to the hand, since the way is the plan to answer for', () => {
      Config.instance.moveStrict = true;
      const piece = pieceAt(5, 5, 2);
      service.show(piece);

      piece.location = { name: 'table', x: 11 * GRID, y: 11 * GRID };
      service.hide();

      expect(piece.location.x).toBe(11 * GRID);
    });

    it('reads a room that answered the old pair of questions as asking for a strict move', () => {
      Config.instance.moveStrict = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Config.instance as any)._moveStrictPath = '1';
      try {
        expect(Config.instance.moveStrict).toBe(true);
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Config.instance as any)._moveStrictPath = '';
      }
    });
  });

  describe('what a picked piece keeps showing', () => {
    function pick(character: GameCharacter): void {
      TestBed.inject(SelectionSignalService).selectObject(character.identifier, 'character');
    }

    it('shows nothing for a picked piece where the table was not asked to', () => {
      pick(pieceAt(5, 5, 2));

      expect(service.range()).toBeNull();
    });

    it('keeps the reach of a picked piece on the table', () => {
      table.moveRangeAlways = true;
      pick(pieceAt(5, 5, 2));

      const view = service.range()!;
      expect(view.showsReach).toBe(true);
      expect(countCells(view.cells)).toBe(24);
    });

    it('keeps the ground held against it without drawing the reach', () => {
      table.zocAlways = true;
      table.zocMode = 'stop';
      const foe = pieceAt(7, 5, 1);
      foe.isNpc = true;
      pick(pieceAt(5, 5, 2));

      const view = service.range()!;
      expect(view.showsReach).toBe(false);
      expect(view.held!.get(cellIndexOf(view.grid, 6, 5))).toBe(true);
    });

    it('answers again once the table is told to keep showing it', () => {
      const picked = pieceAt(5, 5, 2);
      pick(picked);
      expect(service.range()).toBeNull();

      table.moveRangeAlways = true;
      TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);

      expect(service.range()).not.toBeNull();
    });

    it('answers again once another piece moves out of the way', () => {
      table.moveRangeAlways = true;
      table.piecesShareCells = false;
      wallOver(6, 0, 5);
      wallOver(6, 6, 6);
      const blocking = pieceAt(6, 5, 1);
      pick(pieceAt(5, 5, 4));
      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 7, 5))).toBe(false);

      blocking.location = { name: 'table', x: 1 * GRID, y: 1 * GRID };
      TestBed.inject(ObjectChangeService).notifyChanged(blocking.identifier);

      const after = service.range()!;
      expect(after.cells.get(cellIndexOf(after.grid, 7, 5))).toBe(true);
    });

    it('gives way to the piece in hand', () => {
      table.moveRangeAlways = true;
      const picked = pieceAt(5, 5, 2);
      pick(picked);
      const carried = pieceAt(1, 1, 1);

      service.show(carried);

      expect(service.range()!.characterIdentifier).toBe(carried.identifier);
      service.hide();
      expect(service.range()!.characterIdentifier).toBe(picked.identifier);
    });
  });

  it('walks an even-sized piece out of the cell it stands on rather than the one below right', () => {
    const golem = pieceAt(5, 5, 1);
    DataElement.findElementByReference(golem.rootDataElement!, 'size')!.value = 2;
    service.show(golem);

    const view = service.range()!;
    // Two across from (5,5): a reach of one steps from that cell, not from (6,6).
    expect(view.cells.get(cellIndexOf(view.grid, 4, 4))).toBe(true);
    expect(view.cells.get(cellIndexOf(view.grid, 7, 7))).toBe(false);
  });

  it('reaches a diamond where the table forbids cutting corners', () => {
    table.moveDiagonally = false;
    service.show(pieceAt(5, 5, 2));

    expect(countCells(service.range()!.cells)).toBe(12);
    expect(service.range()!.cells.get(cellIndexOf(service.range()!.grid, 7, 7))).toBe(false);
  });

  it('turns a sheet written in feet into cells of the table', () => {
    table.cellDistance = 5;
    table.cellDistanceUnit = 'foot';
    service.show(pieceAt(5, 5, 10, 'フィート'));

    expect(countCells(service.range()!.cells)).toBe(24);
  });

  it('reads a sheet written in cells as cells, whatever the table is ruled in', () => {
    table.cellDistance = 5;
    table.cellDistanceUnit = 'foot';
    service.show(pieceAt(5, 5, 2, 'マス'));

    expect(countCells(service.range()!.cells)).toBe(24);
  });

  it('turns a sheet written in feet into a table ruled in metres', () => {
    // Thirty feet is nine and a bit metres, which is three cells of three metres.
    table.cellDistance = 3;
    table.cellDistanceUnit = 'metre';
    service.show(pieceAt(5, 5, 30, 'ft'));

    expect(countCells(service.range()!.cells)).toBe(48);
  });

  it('turns a sheet written in metres into a table ruled in feet', () => {
    // Nine metres is a little under thirty feet, which is five cells of five feet.
    table.cellDistance = 5;
    table.cellDistanceUnit = 'foot';
    service.show(pieceAt(5, 5, 9, 'm'));

    expect(countCells(service.range()!.cells)).toBe(120);
  });
});

describe('MoveRangeService and the ground an enemy holds', () => {
  let service: MoveRangeService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(MoveRangeService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  function monsterAt(col: number, row: number): GameCharacter {
    const monster = pieceAt(col, row, 1);
    monster.isNpc = true;
    return monster;
  }

  function walkHero(): void {
    service.show(pieceAt(2, 5, 5));
  }

  function reached(col: number, row: number): boolean {
    const view = service.range()!;
    return view.cells.get(cellIndexOf(view.grid, col, row));
  }

  it('walks past an enemy on a table that asks for nothing', () => {
    monsterAt(6, 5);
    walkHero();

    expect(reached(5, 5)).toBe(true);
    expect(reached(6, 5)).toBe(true);
    expect(reached(7, 5)).toBe(true);
  });

  it('never enters the ground where the table shuts it', () => {
    table.zocMode = 'block';
    monsterAt(6, 5);
    walkHero();

    expect(reached(5, 5)).toBe(false);
    expect(reached(6, 5)).toBe(false);
    expect(reached(0, 5)).toBe(true);
  });

  it('stops on the ground where the table holds it there', () => {
    table.zocMode = 'stop';
    monsterAt(6, 5);
    walkHero();

    expect(reached(5, 5)).toBe(true);
    expect(reached(6, 5)).toBe(false);
    expect(reached(7, 5)).toBe(false);
  });

  it('gets less far for the ground where the table charges for it', () => {
    table.zocMode = 'cost';
    table.zocExtraCost = 1;
    monsterAt(6, 5);
    walkHero();

    expect(reached(5, 5)).toBe(true);
    expect(reached(7, 5)).toBe(false);
  });

  it('walks as far as ever where the table charges nothing for it', () => {
    table.zocMode = 'cost';
    table.zocExtraCost = 0;
    monsterAt(6, 5);
    walkHero();

    expect(reached(7, 5)).toBe(true);
  });

  it('holds ground two cells out where the table says two', () => {
    table.zocMode = 'block';
    table.zocRange = 2;
    monsterAt(6, 5);
    walkHero();

    expect(reached(4, 5)).toBe(false);
    expect(reached(3, 5)).toBe(true);
  });

  it('lets a piece on the same side hold no ground at all', () => {
    table.zocMode = 'block';
    pieceAt(6, 5, 1);
    walkHero();

    expect(reached(5, 5)).toBe(true);
    expect(reached(6, 5)).toBe(true);
  });

  it('lets a piece nobody can see hold no ground', () => {
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockReturnValue(false);
    table.zocMode = 'block';
    monsterAt(6, 5);
    walkHero();

    expect(reached(5, 5)).toBe(true);
  });

  it('lets a piece off the table hold no ground', () => {
    table.zocMode = 'block';
    monsterAt(6, 5).location = { name: 'graveyard', x: 0, y: 0 };
    walkHero();

    expect(reached(5, 5)).toBe(true);
  });

  it('holds no ground against the piece being moved itself', () => {
    table.zocMode = 'block';
    const monster = pieceAt(2, 5, 5);
    monster.isNpc = true;

    service.show(monster);

    expect(reached(3, 5)).toBe(true);
    expect(reached(4, 5)).toBe(true);
  });

  describe('a table that holds a fight as one place', () => {
    beforeEach(() => {
      Config.instance.zocEngages = true;
    });

    afterEach(() => {
      Config.instance.zocEngages = null;
      Config.instance.engagementCountsSize = null;
      Config.instance.breakOutMode = null;
      Config.instance.breakOutCost = null;
    });

    function heroBeside(): void {
      service.show(pieceAt(5, 5, 5));
    }

    /** Two against two, so neither side may walk out of it as though it were not there. */
    function evenFight(): void {
      pieceAt(3, 5, 1);
      monsterAt(4, 5);
      monsterAt(5, 5);
    }

    it('has an ally in the fight hold ground of its own against the piece leaving', () => {
      table.zocMode = 'block';
      evenFight();

      service.show(pieceAt(2, 5, 5));

      expect(reached(2, 4)).toBe(false);
    });

    it('leaves that ground open where the table holds fights as pairs', () => {
      Config.instance.zocEngages = false;
      table.zocMode = 'block';
      evenFight();

      service.show(pieceAt(2, 5, 5));

      expect(reached(2, 4)).toBe(true);
    });

    it('charges nothing to a side that outweighs the one across from it', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      monsterAt(6, 5);
      pieceAt(4, 5, 1);

      heroBeside();

      expect(reached(0, 5)).toBe(true);
    });

    it('charges again for the next fight it walks into and out of', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      monsterAt(6, 5);
      monsterAt(4, 8).size = 3;

      const terms = service.termsOf(pieceAt(5, 5, 5))!;
      const at = (col: number, row: number) => cellIndexOf(terms.grid, col, row);

      // (5,7) is a fight with the wide one alone: three against one, so leaving it costs three.
      expect(terms.options.costOf!(at(5, 6), at(5, 7))).toBe(4);
      expect(terms.options.costOf!(at(5, 7), at(5, 6))).toBe(2);
    });

    it('charges for the step that leaves the fight, and only for that one', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      monsterAt(6, 5);

      heroBeside();

      // Five to spend: one to (4,5), two for the step out to (3,5), one for each after it.
      expect(reached(1, 5)).toBe(true);
      expect(reached(0, 5)).toBe(false);
    });

    it('lets a piece walk clean away where no fight holds it', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      monsterAt(9, 9);

      heroBeside();

      expect(reached(0, 5)).toBe(true);
    });

    it('lets a piece walk out where the table asks nothing for leaving', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      Config.instance.breakOutMode = 'free';
      monsterAt(6, 5);

      heroBeside();

      expect(reached(0, 5)).toBe(true);
    });

    it('charges the same for every leaving where the table names a number', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      Config.instance.breakOutMode = 'cost';
      Config.instance.breakOutCost = 2;
      monsterAt(6, 5);
      pieceAt(4, 5, 1);

      heroBeside();

      // The side walking out is the heavier one, and pays all the same.
      expect(reached(2, 5)).toBe(true);
      expect(reached(1, 5)).toBe(false);
    });

    it('keeps a piece in the fight where the table lets nobody leave one', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      Config.instance.breakOutMode = 'block';
      monsterAt(6, 5);

      heroBeside();

      expect(reached(4, 5)).toBe(false);
      expect(reached(6, 4)).toBe(true);
    });

    it('weighs an enemy by the ground it covers', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      monsterAt(6, 5).size = 3;

      heroBeside();

      expect(reached(3, 5)).toBe(true);
      expect(reached(2, 5)).toBe(false);
    });

    it('weighs it as one where the table says size is not to decide it', () => {
      table.zocMode = 'cost';
      table.zocExtraCost = 0;
      Config.instance.engagementCountsSize = false;
      monsterAt(6, 5).size = 3;

      heroBeside();

      expect(reached(1, 5)).toBe(true);
    });
  });

  describe('the rules the room answers for', () => {
    afterEach(() => {
      (Config as unknown as { _instance: Config | undefined })._instance = undefined;
    });

    it('leaves a table that the room has never been asked about ruling itself', () => {
      expect(Config.instance.roomRuleAnswers.zocMode).toBeNull();
      table.zocMode = 'block';
      monsterAt(6, 5);
      walkHero();

      expect(reached(6, 5)).toBe(false);
    });

    it("takes the room's answer over the table's", () => {
      table.zocMode = 'block';
      Config.instance.zocMode = 'none';
      monsterAt(6, 5);
      walkHero();

      expect(reached(6, 5)).toBe(true);
    });

    it('hears an answer of no from the room', () => {
      table.moveRangeEnabled = true;
      Config.instance.moveRangeEnabled = false;

      service.show(pieceAt(5, 5, 2));

      expect(service.range()).toBeNull();
    });

    it('answers again once the room changes its mind', () => {
      const picked = pieceAt(5, 5, 2);
      TestBed.inject(SelectionSignalService).selectObject(picked.identifier, 'character');
      expect(service.range()).toBeNull();

      Config.instance.moveRangeAlways = true;
      TestBed.inject(ObjectChangeService).notifyChanged('Config');

      expect(service.range()).not.toBeNull();
    });

    it('gives the rule back to the table when the answer is taken away', () => {
      table.zocMode = 'block';
      Config.instance.zocMode = 'none';
      Config.instance.zocMode = null;
      monsterAt(6, 5);
      walkHero();

      expect(reached(6, 5)).toBe(false);
    });
  });
});
