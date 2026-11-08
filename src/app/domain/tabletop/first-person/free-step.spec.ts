import { freeStepClear, FreeStepGround } from '@axe/domain/tabletop/first-person/free-step';
import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { describe, expect, it } from 'vitest';

const GRID = 50;

function groundWith(terrains: Terrain[], others: { x: number; y: number }[] = []): FreeStepGround {
  return { widthPx: 10 * GRID, heightPx: 10 * GRID, gridSize: GRID, terrains, others };
}

function wall(x: number, y: number, width: number, depth: number, rotate = 0): Terrain {
  const terrain = Terrain.create('壁', width, depth, 1, 'stone', 'slab');
  terrain.location = { name: 'table', x, y };
  terrain.rotate = rotate;
  return terrain;
}

describe('freeStepClear', () => {
  const from = { x: 100, y: 200 };
  const to = { x: 150, y: 200 };

  it('lets a step across open ground through', () => {
    expect(freeStepClear(from, to, groundWith([]))).toBe(true);
  });

  it('stops at a cliff of the raised ground higher than a cell, and steps up one of a cell', () => {
    const raisedBy = (cells: number) => {
      const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
      for (let j = 0; j < GROUND_CHUNK_SAMPLES; j++) {
        for (let i = 5; i < GROUND_CHUNK_SAMPLES; i++) heights[j * GROUND_CHUNK_SAMPLES + i] = cells * 64;
      }
      return { ...groundWith([]), raised: groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]) };
    };

    expect(freeStepClear(from, to, raisedBy(2))).toBe(false);
    expect(freeStepClear(from, to, raisedBy(1))).toBe(true);
  });

  it('stops at the edge of the table', () => {
    expect(freeStepClear({ x: 480, y: 200 }, { x: 530, y: 200 }, groundWith([]))).toBe(false);
    expect(freeStepClear({ x: 100, y: 20 }, { x: 100, y: -30 }, groundWith([]))).toBe(false);
  });

  it('stops at a wall standing across the way, turned or not', () => {
    expect(freeStepClear(from, to, groundWith([wall(120, 150, 0.2, 2)]))).toBe(false);
    expect(freeStepClear(from, to, groundWith([wall(110, 175, 1, 1, 45)]))).toBe(false);
  });

  it('never lands inside a block, even one too big for the step to cross an edge of', () => {
    expect(freeStepClear({ x: 150, y: 200 }, { x: 160, y: 200 }, groundWith([wall(100, 100, 4, 4)]))).toBe(false);
  });

  it('stops at a shut door and walks through an open one', () => {
    const door = wall(120, 150, 0.2, 2);
    door.doorStyle = DoorStyle.SWING;

    expect(freeStepClear(from, to, groundWith([door]))).toBe(false);

    door.isDoorOpen = true;
    expect(freeStepClear(from, to, groundWith([door]))).toBe(true);
  });

  it('keeps out of the way of another piece standing where the step would land', () => {
    expect(freeStepClear(from, to, groundWith([], [{ x: 160, y: 205 }]))).toBe(false);
    expect(freeStepClear(from, to, groundWith([], [{ x: 250, y: 200 }]))).toBe(true);
  });
});
