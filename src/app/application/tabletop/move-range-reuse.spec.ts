import { TestBed } from '@angular/core/testing';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_MOVE_REACH_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;

/** The throttle the vision service puts on a change before the scene is built again. */
const GEOMETRY_THROTTLE = 50;

describe('the reach a table keeps for the piece it is showing', () => {
  let service: MoveRangeService;
  let table: GameTable;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.moveRangeAlways = true;
    table.initialize();
    // Chosen outright: a table first read for is adopted then and there, and the writing that
    // takes would land in the middle of a measurement as a change to the table.
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(MoveRangeService);
  });

  afterEach(() => {
    perfCounters.enabled = false;
    perfCounters.clear();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    vi.useRealTimers();
  });

  /**
   * Lets the batched change events through and the throttled scene settle, so that what a
   * measurement afterwards sees is the change it made rather than the ones it was set up by.
   */
  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) await vi.advanceTimersByTimeAsync(GEOMETRY_THROTTLE);
  }

  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  function pick(character: GameCharacter): void {
    TestBed.inject(SelectionSignalService).selectObject(character.identifier, 'character');
  }

  function builds(): number {
    return perfCounters.drain().get(PERF_MOVE_REACH_BUILD) ?? 0;
  }

  function watching(): void {
    perfCounters.enabled = true;
    perfCounters.clear();
  }

  it('works the reach out once, and keeps it while another piece is only renamed', async () => {
    const picked = pieceAt(5, 5, 3);
    const other = pieceAt(9, 9, 3);
    pick(picked);
    await settle();
    watching();

    const first = service.range();
    expect(first).not.toBeNull();
    expect(builds()).toBe(1);

    other.name = 'べつの名前';
    other.update();
    await settle();

    const kept = service.range();
    expect(builds()).toBe(0);
    expect(kept).toBe(first);
  });

  it('works it out again when a piece in the way steps aside', async () => {
    const picked = pieceAt(5, 5, 3);
    const blocker = pieceAt(6, 5, 3);
    pick(picked);
    await settle();
    watching();
    const first = service.range();

    blocker.location = { name: 'table', x: 10 * GRID, y: 10 * GRID };
    blocker.update();
    await settle();

    expect(service.range()).not.toBe(first);
    expect(builds()).toBeGreaterThan(0);
  });

  it('works it out again when a wall moves', async () => {
    const wall = Terrain.create('壁', 1, 4, 1, '', '');
    wall.location = { name: 'table', x: 6 * GRID, y: 3 * GRID };
    table.appendChild(wall);
    const picked = pieceAt(5, 5, 3);
    pick(picked);
    await settle();
    watching();
    const first = service.range();

    wall.location = { name: 'table', x: 9 * GRID, y: 3 * GRID };
    wall.update();
    await settle();

    expect(service.range()).not.toBe(first);
    expect(builds()).toBeGreaterThan(0);
  });

  it('hands another mover the same reach for as long as nothing under it has changed', async () => {
    const mover = pieceAt(3, 3, 3);
    await settle();
    watching();

    const first = service.shownReachOf(mover, false);
    const second = service.shownReachOf(mover, false);

    expect(first).not.toBeNull();
    expect(second!.cells).toBe(first!.cells);
    expect(builds()).toBe(1);
  });

  it('answers nothing while the table has no cell size, and a reach once it has one', async () => {
    table.gridSize = 0;
    const picked = pieceAt(5, 5, 3);
    pick(picked);
    await settle();
    expect(service.range()).toBeNull();

    table.gridSize = GRID;
    table.update();
    await settle();

    expect(service.range()).not.toBeNull();
  });
});
