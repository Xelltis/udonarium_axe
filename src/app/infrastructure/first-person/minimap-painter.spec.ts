import { MinimapView } from '@axe/domain/tabletop/first-person/minimap-view';
import { MINIMAP_PALETTE, MinimapCanvas, paintMinimap } from '@axe/infrastructure/first-person/minimap-painter';
import { describe, expect, it } from 'vitest';

interface Fill {
  style: string;
  points: { x: number; y: number }[];
}

function recorder(): { ctx: MinimapCanvas; fills: Fill[]; cleared: number[][] } {
  const fills: Fill[] = [];
  const cleared: number[][] = [];
  let points: { x: number; y: number }[] = [];
  const ctx: MinimapCanvas = {
    canvas: { width: 100, height: 100 },
    fillStyle: '',
    save: () => undefined,
    restore: () => undefined,
    clearRect: (...args: number[]) => cleared.push(args),
    beginPath: () => {
      points = [];
    },
    moveTo: (x, y) => points.push({ x, y }),
    lineTo: (x, y) => points.push({ x, y }),
    closePath: () => undefined,
    arc: () => undefined,
    clip: () => undefined,
    fill: () => fills.push({ style: String(ctx.fillStyle), points }),
  };
  return { ctx, fills, cleared };
}

function viewWith(cells: MinimapView['cells'], yaw = 0): MinimapView {
  return { centre: { x: 250, y: 250 }, radiusPx: 100, yaw, cells };
}

describe('paintMinimap', () => {
  it('clears the canvas and lays the round ground down before anything else', () => {
    const { ctx, fills, cleared } = recorder();

    paintMinimap(ctx, viewWith([]));

    expect(cleared).toEqual([[0, 0, 100, 100]]);
    expect(fills[0].style).toBe(MINIMAP_PALETTE.background);
  });

  it('paints each cell in its own colour, placed about the eye in the middle of the canvas', () => {
    const { ctx, fills } = recorder();
    const cell = {
      index: 1,
      tone: 'wall' as const,
      outline: [
        { x: 250, y: 200 },
        { x: 300, y: 200 },
        { x: 300, y: 250 },
        { x: 250, y: 250 },
      ],
    };

    paintMinimap(ctx, viewWith([cell, { ...cell, index: 2, tone: 'doorOpen' }]));

    expect(fills[1].style).toBe(MINIMAP_PALETTE.wall);
    expect(fills[1].points).toEqual([
      { x: 50, y: 25 },
      { x: 75, y: 25 },
      { x: 75, y: 50 },
      { x: 50, y: 50 },
    ]);
    expect(fills[2].style).toBe(MINIMAP_PALETTE.doorOpen);
  });

  it('draws the eye last, as an arrow pointing the way it looks', () => {
    const { ctx, fills } = recorder();

    paintMinimap(ctx, viewWith([], 90));

    const arrow = fills[fills.length - 1];
    expect(arrow.style).toBe(MINIMAP_PALETTE.arrow);
    expect(arrow.points[0].x).toBeGreaterThan(50);
    expect(arrow.points[0].y).toBeCloseTo(50);
  });
});
