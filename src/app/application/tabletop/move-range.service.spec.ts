import { TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment, StatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { isSquareGrid } from '@axe/domain/tabletop/move/move-grid';
import { stepsFor } from '@axe/domain/tabletop/move/move-steps';
import { countCells } from '@axe/domain/tabletop/move/reachable-cells';
import { TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
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

  /** A wall two cells high, which is more than a piece steps over. */
  function wallOver(col: number, fromRow: number, depthCells: number): Terrain {
    const terrain = Terrain.create('壁', 1, depthCells, 2, '', '');
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

  describe('on a table that counts two cells as one square', () => {
    beforeEach(() => {
      table.squareSpan = 2;
    });

    it('reaches as many squares as the piece walks, over squares two cells across', () => {
      service.show(pieceAt(4, 5, 2));

      const view = service.range()!;
      expect(isSquareGrid(view.grid)).toBe(true);
      expect([view.grid.cols, view.grid.sizePx]).toEqual([6, 2 * GRID]);
      expect(countCells(view.cells)).toBe(24);
      expect(view.cells.get(cellIndexOf(view.grid, 4, 2))).toBe(true);
      expect(view.cells.get(cellIndexOf(view.grid, 5, 2))).toBe(false);
    });

    it('stops at the squares a wall one cell thick runs through', () => {
      wallOver(7, 0, 12);

      service.show(pieceAt(4, 5, 2));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 3, 2))).toBe(false);
      expect(view.cells.get(cellIndexOf(view.grid, 4, 2))).toBe(false);
      expect(view.cells.get(cellIndexOf(view.grid, 1, 2))).toBe(true);
    });

    it('counts each cell of a hex table as it always did', () => {
      table.gridType = GridType.HEX_VERTICAL;
      service.show(pieceAt(5, 5, 2));
      const squared = service.range()!;
      service.hide();
      table.squareSpan = 1;
      service.show(pieceAt(5, 5, 2));

      expect(isSquareGrid(squared.grid)).toBe(false);
      expect(squared.cells.equals(service.range()!.cells)).toBe(true);
    });
  });

  describe('a piece up on the blocks', () => {
    /** A block of the given height, walls and all, which is what a room is built out of. */
    function blockOver(col: number, row: number, cells: number, height: number): Terrain {
      const terrain = Terrain.create('ブロック', cells, cells, height, '', '');
      terrain.mode = TerrainViewState.ALL;
      terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
      table.appendChild(terrain);
      return terrain;
    }

    it('walks along the tops of the blocks it is standing on', () => {
      blockOver(4, 4, 4, 1);

      service.show(pieceAt(5, 5, 2));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 7, 5))).toBe(true);
      expect(view.cells.get(cellIndexOf(view.grid, 5, 7))).toBe(true);
    });

    it('is stopped by what stands higher than the ground it is on', () => {
      blockOver(4, 4, 4, 1);
      blockOver(8, 4, 1, 3);

      service.show(pieceAt(7, 4, 2));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 8, 4))).toBe(false);
    });

    it('is stopped by a face too sheer to be stood on, level or not', () => {
      blockOver(4, 4, 4, 1);
      blockOver(8, 4, 1, 1).blocksClimb = true;

      service.show(pieceAt(7, 4, 2));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 8, 4))).toBe(false);
    });

    it('steps up onto a ledge from the table, a cell high and under', () => {
      blockOver(6, 4, 2, 0.5);
      blockOver(8, 4, 2, 1);

      service.show(pieceAt(5, 5, 3));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(true);
      expect(view.cells.get(cellIndexOf(view.grid, 8, 5))).toBe(true);
    });

    it('is stopped by a wall that rises more than a cell over it', () => {
      blockOver(6, 4, 2, 1.5);

      service.show(pieceAt(5, 5, 2));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(false);
    });

    it('steps off a block onto ground within a cell of it', () => {
      blockOver(4, 4, 2, 2);
      blockOver(6, 4, 2, 1);

      service.show(pieceAt(5, 5, 2));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(true);
    });

    it('is stopped by a low ledge too sheer to be stood on', () => {
      blockOver(6, 4, 2, 0.5).blocksClimb = true;

      service.show(pieceAt(5, 5, 2));

      const view = service.range()!;
      expect(view.cells.get(cellIndexOf(view.grid, 6, 5))).toBe(false);
    });
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
      expect(terms.options.costOf!(at(5, 6), at(5, 7))).toBe(stepsFor(4));
      expect(terms.options.costOf!(at(5, 7), at(5, 6))).toBe(stepsFor(2));
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

  describe('whether a piece may take one step', () => {
    const at = (col: number, row: number) => row * 12 + col;

    /** A wall two cells high, which is more than a piece steps over. */
    function wallAt(col: number, fromRow: number, depthCells: number): void {
      const terrain = Terrain.create('壁', 1, depthCells, 2, '', '');
      terrain.location = { name: 'table', x: col * GRID, y: fromRow * GRID };
      table.appendChild(terrain);
    }

    it('answers a step onto open ground, and not one into a wall', () => {
      wallAt(6, 4, 3);
      const piece = pieceAt(5, 5, 2);

      expect(service.canStepTo(piece, at(4, 5))).toBe(true);
      expect(service.canStepTo(piece, at(6, 5))).toBe(false);
    });

    it('still answers where the table keeps no range', () => {
      table.moveRangeEnabled = false;
      wallAt(6, 4, 3);
      const piece = pieceAt(5, 5, 2);

      expect(service.canStepTo(piece, at(4, 5))).toBe(true);
      expect(service.canStepTo(piece, at(6, 5))).toBe(false);
    });

    it('steps up onto a block no higher than a cell, range or no range', () => {
      const ledge = Terrain.create('段', 1, 1, 1, '', '');
      ledge.location = { name: 'table', x: 6 * GRID, y: 5 * GRID };
      table.appendChild(ledge);
      const piece = pieceAt(5, 5, 2);

      expect(service.canStepTo(piece, at(6, 5))).toBe(true);

      table.moveRangeEnabled = false;
      expect(service.canStepTo(piece, at(6, 5))).toBe(true);
    });

    it('lets a piece whose sheet says nothing about walking take a step all the same', () => {
      const piece = pieceAt(5, 5, 2);
      DataElement.findElementByReference(piece.rootDataElement!, '移動')!.destroy();

      expect(service.canStepTo(piece, at(4, 5))).toBe(true);
    });

    it('keeps a piece off another where the table forbids sharing, range or no range', () => {
      table.piecesShareCells = false;
      pieceAt(6, 5, 2);
      const piece = pieceAt(5, 5, 2);

      expect(service.canStepTo(piece, at(6, 5))).toBe(false);

      table.moveRangeEnabled = false;
      expect(service.canStepTo(piece, at(6, 5))).toBe(false);
    });

    it('answers no for a cell that is not on the table', () => {
      const piece = pieceAt(5, 5, 2);

      expect(service.canStepTo(piece, -1)).toBe(false);
      expect(service.canStepTo(piece, 144)).toBe(false);
    });
  });

  describe('the ground a piece stands on', () => {
    const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

    /** A block laid flat, which a piece walked at steps up onto rather than around. */
    function platformAt(col: number, row: number, cells: number, height: number): Terrain {
      const terrain = Terrain.create('台', cells, cells, height, '', '');
      terrain.mode = TerrainViewState.FLOOR;
      terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
      table.appendChild(terrain);
      return terrain;
    }

    it('reads how high the ground under each cell stands', () => {
      platformAt(4, 4, 2, 1);

      const ground = service.groundHeightsOn(grid);
      expect(ground[cellIndexOf(grid, 4, 4)]).toBe(GRID);
      expect(ground[cellIndexOf(grid, 8, 8)]).toBe(0);
    });

    it('gathers the ground lying level with the piece and leaves the rest of the table out', () => {
      platformAt(4, 4, 2, 1);
      platformAt(8, 8, 2, 2);

      const level = service.groundAtHeight(grid, GRID);

      expect(level).not.toBeNull();
      expect(level!.get(cellIndexOf(grid, 5, 5))).toBe(true);
      expect(level!.get(cellIndexOf(grid, 8, 8))).toBe(false);
      expect(level!.get(cellIndexOf(grid, 0, 0))).toBe(false);
    });

    it('has no ground above the floor to speak of on a table laid flat', () => {
      expect(service.groundAtHeight(grid, 0)).toBeNull();
      expect(service.groundAtHeight(grid, GRID)).toBeNull();
    });

    it('hands the same set of cells back, so the overlay traces its paths once', () => {
      platformAt(4, 4, 2, 1);

      expect(service.groundAtHeight(grid, GRID)).toBe(service.groundAtHeight(grid, GRID));
    });

    it('reads the ground afresh once a block has moved', () => {
      const platform = platformAt(4, 4, 2, 1);
      expect(service.groundHeightsOn(grid)[cellIndexOf(grid, 4, 4)]).toBe(GRID);

      platform.location = { name: 'table', x: 8 * GRID, y: 8 * GRID };
      TestBed.inject(ObjectChangeService).notifyChanged(platform.identifier);

      const ground = service.groundHeightsOn(grid);
      expect(ground[cellIndexOf(grid, 4, 4)]).toBe(0);
      expect(ground[cellIndexOf(grid, 8, 8)]).toBe(GRID);
    });
  });
});

describe('MoveRangeService and ground that costs more to cross', () => {
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

  function dearGround(col: number, row: number, width: number, height: number, extraCost: number): TableMoveCost {
    const area = new TableMoveCost();
    area.col = col;
    area.row = row;
    area.width = width;
    area.height = height;
    area.extraCost = extraCost;
    area.initialize();
    table.appendChild(area);
    return area;
  }

  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  function reached(col: number, row: number): boolean {
    const view = service.range()!;
    return view.cells.get(cellIndexOf(view.grid, col, row));
  }

  it('walks as far as ever over a table nobody has painted', () => {
    service.show(pieceAt(5, 5, 2));

    expect(countCells(service.range()!.cells)).toBe(24);
  });

  it('stops short on the far side of a band that costs twice to cross', () => {
    dearGround(6, 0, 1, 12, 1);
    service.show(pieceAt(5, 5, 2));

    expect(reached(6, 5)).toBe(true);
    expect(reached(7, 5)).toBe(false);
    expect(reached(3, 5)).toBe(true);
  });

  it('covers a quarter of the ground where every step of it costs twice', () => {
    dearGround(0, 0, 12, 12, 1);
    service.show(pieceAt(5, 5, 2));

    expect(countCells(service.range()!.cells)).toBe(8);
  });

  describe('a road painted across the board', () => {
    function road(col: number, row: number, width: number, height: number): TableMoveCost {
      const area = dearGround(col, row, width, height, 1);
      area.halves = true;
      return area;
    }

    it('carries a piece twice as far along it', () => {
      road(0, 5, 12, 1);

      service.show(pieceAt(5, 5, 2));

      expect(reached(9, 5)).toBe(true);
      expect(reached(10, 5)).toBe(false);
    });

    it('leaves the ground beside it as far off as it ever was', () => {
      road(0, 5, 12, 1);

      service.show(pieceAt(5, 5, 2));

      expect(reached(5, 7)).toBe(true);
      expect(reached(5, 8)).toBe(false);
    });

    it('runs through a swamp as a road rather than as swamp', () => {
      dearGround(0, 0, 12, 12, 1);
      road(0, 5, 12, 1);

      service.show(pieceAt(5, 5, 2));

      // Four cells along the road, and one into the swamp beside it.
      expect(reached(9, 5)).toBe(true);
      expect(reached(5, 6)).toBe(true);
      expect(reached(5, 7)).toBe(false);
    });
  });

  describe('a piece getting about some other way than on its feet', () => {
    it('covers a quarter of the ground where every step costs it twice', () => {
      const swimmer = pieceAt(5, 5, 2);
      swimmer.moveMode = 'swim';

      service.show(swimmer);

      expect(countCells(service.range()!.cells)).toBe(8);
    });

    it('pays a bog nothing where it is over the bog rather than in it', () => {
      dearGround(0, 0, 12, 12, 1);
      const flier = pieceAt(5, 5, 2);
      flier.moveMode = 'fly';

      service.show(flier);

      expect(countCells(service.range()!.cells)).toBe(24);
    });

    function wallDown(col: number): void {
      const wall = Terrain.create('壁', 1, 12, 2, '', '');
      wall.location = { name: 'table', x: col * GRID, y: 0 };
      table.appendChild(wall);
    }

    it('goes over a wall a walk has to go round', () => {
      wallDown(6);
      const flier = pieceAt(5, 5, 2);
      flier.moveMode = 'fly';

      service.show(flier);

      expect(reached(7, 5)).toBe(true);
    });

    it('leaves a walking piece stopped by that same wall', () => {
      wallDown(6);

      service.show(pieceAt(5, 5, 2));

      expect(reached(7, 5)).toBe(false);
    });

    it('walks the board as it always has where nobody has said otherwise', () => {
      dearGround(0, 0, 12, 12, 1);

      service.show(pieceAt(5, 5, 2));

      expect(countCells(service.range()!.cells)).toBe(8);
    });
  });

  it('charges the dearer of two stretches painted over one another', () => {
    dearGround(6, 0, 1, 12, 1);
    dearGround(6, 5, 1, 1, 2);
    service.show(pieceAt(5, 5, 2));

    expect(reached(6, 4)).toBe(true);
    expect(reached(6, 5)).toBe(false);
  });

  it('adds what the ground costs to what an enemy holds against it', () => {
    table.zocMode = 'cost';
    table.zocExtraCost = 1;
    dearGround(4, 0, 1, 12, 1);
    const monster = pieceAt(5, 6, 1);
    monster.isNpc = true;
    service.show(pieceAt(2, 5, 3));

    // Both cells of the band cost a step over the plain one. Only the second is held by the
    // monster as well, and that one step over is what puts it out of reach.
    expect(reached(4, 4)).toBe(true);
    expect(reached(4, 5)).toBe(false);
  });

  it('reads the ground afresh once a stretch of it has been painted', () => {
    const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);
    const beyond = cellIndexOf(grid, 7, 5);
    const piece = pieceAt(5, 5, 2);
    expect(service.shownReachOf(piece, false)!.cells.get(beyond)).toBe(true);

    const area = dearGround(6, 0, 1, 12, 1);
    TestBed.inject(ObjectChangeService).notifyChanged(area.identifier);

    expect(service.shownReachOf(piece, false)!.cells.get(beyond)).toBe(false);
  });

  it('charges the ground of a board of hexes just as it does a board of squares', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      table.gridType = type;
      dearGround(0, 0, 12, 12, 1);
      service.show(pieceAt(5, 5, 2));

      expect(countCells(service.range()!.cells)).toBe(6);
    }
  });
});

describe('MoveRangeService and the ground another piece stands on', () => {
  let service: MoveRangeService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    // Corners are left uncut so that walking round a piece costs more than walking through it,
    // which is the whole of what these rules change.
    table.moveDiagonally = false;
    table.initialize();
    service = TestBed.inject(MoveRangeService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number, party = ''): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    character.partyIdentifier = party;
    return character;
  }

  function reached(col: number, row: number): boolean {
    const view = service.range()!;
    return view.cells.get(cellIndexOf(view.grid, col, row));
  }

  it('walks onto another piece on a table that has said nothing about it', () => {
    pieceAt(6, 5, 1, 'heroes');
    service.show(pieceAt(5, 5, 2, 'heroes'));

    expect(reached(6, 5)).toBe(true);
    expect(reached(7, 5)).toBe(true);
  });

  it('keeps off every piece on a table that said pieces may not share a cell', () => {
    table.piecesShareCells = false;
    pieceAt(6, 5, 1, 'heroes');
    service.show(pieceAt(5, 5, 2, 'heroes'));

    expect(reached(6, 5)).toBe(false);
    expect(reached(7, 5)).toBe(false);
  });

  it('squeezes past its own side without stopping on it', () => {
    table.samePartyPassage = 'pass';
    pieceAt(6, 5, 1, 'heroes');
    service.show(pieceAt(5, 5, 2, 'heroes'));

    expect(reached(6, 5)).toBe(false);
    expect(reached(7, 5)).toBe(true);
  });

  it('stops on a mount of its own side to get on it, and a mount on no other mount', () => {
    table.samePartyPassage = 'pass';
    const horse = pieceAt(6, 5, 1, 'heroes');
    horse.mountable = '1';
    const cart = pieceAt(4, 5, 1, 'heroes');
    cart.mountable = '1';
    service.show(pieceAt(5, 5, 2, 'heroes'));
    expect(reached(6, 5)).toBe(true);

    service.show(cart);
    expect(reached(6, 5)).toBe(false);
  });

  it('pays for squeezing past where the table charges for it', () => {
    table.samePartyPassage = 'cost';
    table.piecePassageCost = 1;
    pieceAt(6, 5, 1, 'heroes');
    service.show(pieceAt(5, 5, 2, 'heroes'));

    expect(reached(6, 5)).toBe(false);
    expect(reached(7, 5)).toBe(false);
    expect(reached(3, 5)).toBe(true);
  });

  it('is turned back by the other side', () => {
    table.otherPartyPassage = 'block';
    pieceAt(6, 5, 1, 'goblins');
    service.show(pieceAt(5, 5, 2, 'heroes'));

    expect(reached(6, 5)).toBe(false);
    expect(reached(7, 5)).toBe(false);
  });

  it('tells its own side from the other, and both from a piece in no party', () => {
    table.samePartyPassage = 'pass';
    table.otherPartyPassage = 'block';
    table.noPartyPassage = 'share';
    pieceAt(6, 5, 1, 'heroes');
    pieceAt(4, 5, 1, 'goblins');
    pieceAt(5, 4, 1);
    service.show(pieceAt(5, 5, 2, 'heroes'));

    expect(reached(7, 5)).toBe(true);
    expect(reached(3, 5)).toBe(false);
    expect(reached(5, 4)).toBe(true);
  });

  it('is not turned back by a piece nobody can see', () => {
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockReturnValue(false);
    table.otherPartyPassage = 'block';
    pieceAt(6, 5, 1, 'goblins');
    service.show(pieceAt(5, 5, 2, 'heroes'));

    expect(reached(6, 5)).toBe(true);
    expect(reached(7, 5)).toBe(true);
  });

  it('reads a piece of a party it is in no party itself as one of the others', () => {
    table.otherPartyPassage = 'block';
    pieceAt(6, 5, 1, 'goblins');
    service.show(pieceAt(5, 5, 2));

    expect(reached(6, 5)).toBe(false);
  });

  it('squeezes past its own side on a board of hexes as well', () => {
    table.gridType = GridType.HEX_VERTICAL;
    pieceAt(6, 5, 1, 'heroes');
    const hero = pieceAt(5, 5, 2, 'heroes');
    service.show(hero);
    const shared = countCells(service.range()!.cells);

    table.samePartyPassage = 'pass';
    service.show(hero);

    // Everything the piece could reach before is still reached, bar the one cell it may now
    // only cross: nothing has been walked round, since walking through costs the same.
    expect(countCells(service.range()!.cells)).toBe(shared - 1);
  });
});

describe('MoveRangeService and a piece a state has stopped', () => {
  let service: MoveRangeService;
  let ailments: StatusAilmentService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(MoveRangeService);
    ailments = TestBed.inject(StatusAilmentService);
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

  const binding = (): StatusAilment => ({ ...newStatusAilment('拘束'), stat: '移動', op: '=', amount: '0' });

  it('draws a reach for a piece nothing has hold of', () => {
    const piece = pieceAt(5, 5, 2);

    service.show(piece);

    expect(countCells(service.range()!.cells)).toBe(24);
  });

  // The reach is read off the sheet, and a state that holds the sheet at nought therefore stops
  // the piece without anything in the reckoning of movement knowing states exist at all.
  it('draws no reach at all for a piece a state is holding still', () => {
    const piece = pieceAt(5, 5, 2);
    ailments.plant(piece, binding());

    service.show(piece);

    expect(service.range()).toBeNull();
  });

  it('draws it again once the state comes off', () => {
    const piece = pieceAt(5, 5, 2);
    ailments.plant(piece, binding());
    ailments.pull(piece, '拘束');

    service.show(piece);

    expect(countCells(service.range()!.cells)).toBe(24);
  });

  it('draws a shorter reach for a piece a state has merely slowed', () => {
    const piece = pieceAt(5, 5, 3);
    ailments.plant(piece, { ...binding(), name: '鈍足', op: '-', amount: '2' });

    service.show(piece);

    expect(countCells(service.range()!.cells)).toBe(8);
  });
});

describe('MoveRangeService and which side a piece is on', () => {
  let service: MoveRangeService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.zocMode = 'block';
    table.initialize();
    service = TestBed.inject(MoveRangeService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number, party = '', npc = false): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    character.partyIdentifier = party;
    character.isNpc = npc;
    return character;
  }

  function reached(col: number, row: number): boolean {
    const view = service.range()!;
    return view.cells.get(cellIndexOf(view.grid, col, row));
  }

  it('holds ground against a monster near a hero, by whom the master runs', () => {
    pieceAt(7, 5, 1, 'heroes', true);
    service.show(pieceAt(5, 5, 3, 'heroes'));

    expect(reached(6, 5)).toBe(false);
  });

  it('holds none against a piece of its own party where the sides are parties', () => {
    table.hostilityBy = 'party';
    pieceAt(7, 5, 1, 'heroes', true);
    service.show(pieceAt(5, 5, 3, 'heroes'));

    expect(reached(6, 5)).toBe(true);
  });

  it('holds ground against another party where the sides are parties', () => {
    table.hostilityBy = 'party';
    pieceAt(7, 5, 1, 'goblins');
    service.show(pieceAt(5, 5, 3, 'heroes'));

    expect(reached(6, 5)).toBe(false);
  });

  it('holds none for a piece nobody has placed, where the sides are parties', () => {
    table.hostilityBy = 'party';
    pieceAt(7, 5, 1, '', true);
    service.show(pieceAt(5, 5, 3, 'heroes'));

    expect(reached(6, 5)).toBe(true);
  });

  it('holds none against a piece nobody has placed either, where the sides are parties', () => {
    table.hostilityBy = 'party';
    pieceAt(7, 5, 1, 'goblins');

    // Held both ways or neither: a stray that holds no ground of its own is not walled in by
    // everybody else's.
    service.show(pieceAt(5, 5, 3, ''));

    expect(reached(6, 5)).toBe(true);
  });

  describe('and the parties it stands with', () => {
    function party(identifier: string, allies = ''): Party {
      const held = new Party(identifier);
      held.allies = allies;
      held.initialize();
      return held;
    }

    it('holds ground against an allied band until somebody says they are allied', () => {
      table.hostilityBy = 'party';
      party('heroes');
      party('villagers');
      pieceAt(7, 5, 1, 'villagers');
      service.show(pieceAt(5, 5, 3, 'heroes'));

      expect(reached(6, 5)).toBe(false);
    });

    it('holds none against a band it stands with', () => {
      table.hostilityBy = 'party';
      party('heroes', 'villagers');
      party('villagers');
      pieceAt(7, 5, 1, 'villagers');
      service.show(pieceAt(5, 5, 3, 'heroes'));

      expect(reached(6, 5)).toBe(true);
    });

    it('goes on holding ground against everybody else', () => {
      table.hostilityBy = 'party';
      party('heroes', 'villagers');
      party('villagers');
      party('goblins');
      pieceAt(7, 5, 1, 'goblins');
      service.show(pieceAt(5, 5, 3, 'heroes'));

      expect(reached(6, 5)).toBe(false);
    });

    it('shuts the ground an unallied band stands on, where the room shuts it', () => {
      table.otherPartyPassage = 'block';
      table.zocMode = 'none';
      party('heroes');
      party('villagers');
      pieceAt(6, 5, 1, 'villagers');
      service.show(pieceAt(5, 5, 3, 'heroes'));

      expect(reached(6, 5)).toBe(false);
    });

    it('opens that same ground once the two stand together', () => {
      table.otherPartyPassage = 'block';
      table.zocMode = 'none';
      party('heroes', 'villagers');
      party('villagers');
      pieceAt(6, 5, 1, 'villagers');
      service.show(pieceAt(5, 5, 3, 'heroes'));

      expect(reached(6, 5)).toBe(true);
    });
  });
});

describe('MoveRangeService and a piece wider than one cell', () => {
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

  function golemAt(col: number, row: number, walk: number, size = 2): GameCharacter {
    const character = GameCharacter.create('ゴーレム', size, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  /** A wall two cells high, which is more than a piece steps over. */
  function wallOver(col: number, fromRow: number, depthCells: number): void {
    const terrain = Terrain.create('壁', 1, depthCells, 2, '', '');
    terrain.location = { name: 'table', x: col * GRID, y: fromRow * GRID };
    table.appendChild(terrain);
  }

  function reached(col: number, row: number): boolean {
    const view = service.range()!;
    return view.cells.get(cellIndexOf(view.grid, col, row));
  }

  it('stands on ground a piece of one cell would stand on', () => {
    service.show(golemAt(5, 5, 2));

    expect(reached(6, 5)).toBe(true);
  });

  it('will not stand where only part of it would fit', () => {
    wallOver(7, 0, 12);
    service.show(golemAt(5, 5, 3));

    expect(reached(6, 5)).toBe(false);
    expect(reached(5, 6)).toBe(true);
  });

  it('will not thread a gap it could not stand in', () => {
    // Two walls with a single cell between them: a piece three across cannot stand in that
    // cell, and so cannot pass through it to the ground beyond either.
    const above = Terrain.create('壁', 1, 5, 2, '', '');
    above.location = { name: 'table', x: 6 * GRID, y: 0 };
    table.appendChild(above);
    const below = Terrain.create('壁', 1, 6, 2, '', '');
    below.location = { name: 'table', x: 6 * GRID, y: 6 * GRID };
    table.appendChild(below);

    service.show(golemAt(4, 5, 8, 3));

    expect(reached(9, 5)).toBe(false);
    expect(reached(10, 5)).toBe(false);
  });

  it('will not hang off the edge of the board', () => {
    service.show(golemAt(10, 5, 2));

    expect(reached(11, 5)).toBe(false);
    expect(reached(10, 6)).toBe(true);
  });

  it('leaves a piece of a single cell every cell it could reach before', () => {
    service.show(golemAt(10, 5, 2, 1));

    expect(reached(11, 5)).toBe(true);
  });

  describe('folding itself through a gap too small for it', () => {
    afterEach(() => {
      Config.instance.squeezes = null;
    });

    /**
     * A wall with a two-cell gap in it, which a piece three across cannot walk through.
     *
     * Two cells rather than one: a piece that folds itself down to two is still two across,
     * and a one-cell gap is shut to it however it holds itself.
     */
    function wallWithAGap(col: number, gapRow: number): void {
      const above = Terrain.create('壁', 1, gapRow, 2, '', '');
      above.location = { name: 'table', x: col * GRID, y: 0 };
      table.appendChild(above);
      const below = Terrain.create('壁', 1, 12 - gapRow - 2, 2, '', '');
      below.location = { name: 'table', x: col * GRID, y: (gapRow + 2) * GRID };
      table.appendChild(below);
    }

    it('stays on its own side of the gap where the room has not said it may', () => {
      wallWithAGap(6, 5);
      service.show(golemAt(4, 5, 4, 3));

      expect(reached(7, 5)).toBe(false);
    });

    it('gets through where the room says it may', () => {
      Config.instance.squeezes = true;
      wallWithAGap(6, 5);
      service.show(golemAt(4, 5, 4, 3));

      expect(reached(7, 5)).toBe(true);
    });

    it('pays a step again for the cell it spends folded up', () => {
      Config.instance.squeezes = true;
      wallWithAGap(6, 5);
      service.show(golemAt(4, 5, 3, 3));

      // It reaches the gap and stands in it folded up, and what that cell costs twice over is
      // what leaves it short of the ground beyond, which a step apiece would have paid for.
      expect(reached(6, 5)).toBe(true);
      expect(reached(7, 5)).toBe(false);
    });
  });
});

describe('MoveRangeService with kinds of move and engagement zones', () => {
  let service: MoveRangeService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 16;
    table.height = 16;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(MoveRangeService);
    Config.instance.moveKinds = '全力:3:,通常:1:,制限:1:2';
  });

  afterEach(() => {
    Config.instance.moveKinds = null;
    Config.instance.zoneEnabled = null;
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number, npc = false): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    character.isNpc = npc;
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  function reaches(cells: CellBits | undefined, col: number, row: number): boolean {
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    return cells?.get(cellIndexOf(grid, col, row)) === true;
  }

  it("reaches as far as the room's first kind takes a piece, and as far as another where it is asked for", () => {
    const piece = pieceAt(5, 5, 1);

    service.show(piece);
    expect(reaches(service.range()?.cells, 8, 5)).toBe(true);

    service.show(piece, '通常');
    expect(reaches(service.range()?.cells, 6, 5)).toBe(true);
    expect(reaches(service.range()?.cells, 7, 5)).toBe(false);
  });

  it('multiplies the movement on the sheet by a kind before rounding it down to whole cells', () => {
    const piece = pieceAt(5, 5, 2.5);

    service.show(piece, '全力');
    expect(reaches(service.range()?.cells, 12, 5)).toBe(true);
    expect(reaches(service.range()?.cells, 13, 5)).toBe(false);

    const slow = pieceAt(2, 2, 0.4);
    expect(service.canPlan(slow, '通常')).toBe(false);
    expect(service.canPlan(slow, '全力')).toBe(true);
    service.show(slow, '全力');
    expect(reaches(service.range()?.cells, 3, 2)).toBe(true);
  });

  it('holds a kind to its cap in metres, whatever the movement says', () => {
    table.cellDistance = 2;
    table.cellDistanceUnit = 'metre';
    const piece = pieceAt(5, 5, 3);

    service.show(piece, '制限');

    expect(reaches(service.range()?.cells, 6, 5)).toBe(true);
    expect(reaches(service.range()?.cells, 7, 5)).toBe(false);
  });

  it('keeps the reach shown for each kind apart', () => {
    const piece = pieceAt(5, 5, 1);

    expect(reaches(service.shownReachOf(piece, false, '全力')?.cells, 8, 5)).toBe(true);
    expect(reaches(service.shownReachOf(piece, false, '通常')?.cells, 8, 5)).toBe(false);
  });

  it("gives a piece held in its zone no reach, and one that said it would leave a reach from the zone's centre", () => {
    Config.instance.zoneEnabled = true;
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as never);
    const zones = TestBed.inject(EngagementZoneService);
    const hero = pieceAt(5, 5, 1);
    zones.declare(hero, pieceAt(5, 5, 1, true));

    expect(service.termsOf(hero, '通常')).toBeNull();
    expect(service.canPlan(hero)).toBe(false);

    zones.prepareLeave(hero);

    expect(service.canPlan(hero)).toBe(true);
    service.show(hero, '通常');
    expect(reaches(service.range()?.cells, 4, 5)).toBe(true);
    expect(reaches(service.range()?.cells, 6, 5)).toBe(true);
  });
});
