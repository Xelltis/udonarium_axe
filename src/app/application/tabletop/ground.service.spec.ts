import { TestBed } from '@angular/core/testing';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { FLAT_GROUND } from '@axe/domain/tabletop/ground/ground-surface';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GRID = 50;

describe('GroundService', () => {
  let ground: GroundService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    ground = TestBed.inject(GroundService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('reads a table that keeps no ground as flat, and lifts nothing on it', () => {
    expect(ground.surface()).toBe(FLAT_GROUND);
    expect(ground.heightPxAt(200, 200)).toBe(0);
    expect(ground.lowestPxIn(100, 100, 100, 100)).toBe(0);
    expect(groundFieldOn(table)).toBeNull();
  });

  it('keeps a dab of the brush on the table and reads the ground it raised, in table pixels', () => {
    ground.dab({ kind: 'raise', x: 4, y: 4, radius: 2, strength: 1 });

    expect(groundFieldOn(table)?.readChunks()).toHaveLength(1);
    expect(ground.surface().isFlat).toBe(false);
    expect(ground.heightPxAt(4 * GRID, 4 * GRID)).toBe(GRID);
  });

  it('lifts a box by the lowest the ground stands anywhere in it', () => {
    ground.dab({ kind: 'raise', x: 4, y: 4, radius: 2, strength: 1 });

    expect(ground.lowestPxIn(3.5 * GRID, 3.5 * GRID, GRID, GRID)).toBeGreaterThan(0);
    expect(ground.lowestPxIn(3.5 * GRID, 3.5 * GRID, GRID, GRID)).toBeLessThan(GRID);
    expect(ground.lowestPxIn(1 * GRID, 1 * GRID, 6 * GRID, 6 * GRID)).toBe(0);
  });
});
