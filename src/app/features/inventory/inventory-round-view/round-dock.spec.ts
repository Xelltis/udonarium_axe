import {
  DOCK_FACE,
  DOCK_LEAST_FACE,
  DOCK_LEAST_STEP,
  DOCK_NEXT_FACE,
  type DockEntry,
  type DockLayout,
  layDock,
  pieceAt,
} from '@axe/features/inventory/inventory-round-view/round-dock';
import { describe, expect, it } from 'vitest';

const HEADING = 22;

function pieces(count: number, current = -1, next = -1): DockEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: 'piece' as const,
    key: `p${index}`,
    current: index === current,
    next: index === next,
  }));
}

const slot = (layout: DockLayout, key: string) => layout.slots.find((one) => one.key === key)!;

describe('layDock', () => {
  it('lays every face at its full size, apart, where there is room for them', () => {
    const layout = layDock(pieces(5, 1, 2), 1000, HEADING);

    expect(layout.slots.map((one) => [one.at, one.size, one.covered])).toEqual([
      [0, DOCK_FACE, false],
      [58, DOCK_FACE, false],
      [116, DOCK_FACE, false],
      [174, DOCK_FACE, false],
      [232, DOCK_FACE, false],
    ]);
    expect(layout.length).toBe(280);
  });

  it('draws the rest smaller where room is short, keeping the one up at its full size', () => {
    const layout = layDock(pieces(15, 4, 5), 600, HEADING);

    expect(layout.length).toBeLessThanOrEqual(600);
    expect(slot(layout, 'p4').size).toBe(DOCK_FACE);
    expect(slot(layout, 'p5').size).toBe(DOCK_NEXT_FACE);
    expect(slot(layout, 'p0').size).toBeLessThan(DOCK_NEXT_FACE);
    expect(slot(layout, 'p0').size).toBeGreaterThanOrEqual(DOCK_LEAST_FACE);
    expect(layout.slots.some((one) => one.covered)).toBe(false);
  });

  it('lays the faces over one another past their least size, standing no longer than its room however many', () => {
    for (const count of [30, 45, 60]) {
      const layout = layDock(pieces(count, 10, 11), 500, HEADING);

      expect(layout.length).toBeLessThanOrEqual(500 + 0.001);
      expect(slot(layout, 'p0').size).toBe(DOCK_LEAST_FACE);
      expect(slot(layout, 'p0').covered).toBe(true);
      expect(slot(layout, 'p10')).toMatchObject({ size: DOCK_FACE, covered: false });
    }
  });

  it('keeps the next one no smaller than the rest', () => {
    const layout = layDock(pieces(11, 0, 1), 600, HEADING);

    expect(slot(layout, 'p1').size).toBe(slot(layout, 'p2').size);
    expect(layout.length).toBeLessThanOrEqual(600);
  });

  it('runs past its room only where not even a sliver of every face would fit', () => {
    const layout = layDock(pieces(200, 0, 1), 400, HEADING);

    expect(slot(layout, 'p5').reach).toBe(DOCK_LEAST_STEP);
    expect(layout.length).toBeGreaterThan(400);
  });

  it('keeps the length of the headings of the sides', () => {
    const entries: DockEntry[] = [
      { kind: 'heading', key: 'side:a' },
      ...pieces(10, 2, 3),
      { kind: 'heading', key: 'side:b' },
      ...pieces(10).map((one) => ({ ...one, key: `q${one.key}` })),
    ];
    const layout = layDock(entries, 500, HEADING);

    expect(slot(layout, 'side:a')).toMatchObject({ at: 0, size: HEADING });
    expect(slot(layout, 'side:b').size).toBe(HEADING);
    expect(layout.length).toBeLessThanOrEqual(500 + 0.001);
  });
});

describe('pieceAt', () => {
  it('points at the face a point lies on, by where it lies rather than which face is on top', () => {
    const layout = layDock(pieces(40, 10, 11), 500, HEADING);
    const p3 = slot(layout, 'p3');
    const p4 = slot(layout, 'p4');

    expect(pieceAt(layout, p3.at + 1)).toBe('p3');
    expect(pieceAt(layout, p4.at - 0.5)).toBe('p3');
    expect(pieceAt(layout, p4.at)).toBe('p4');
    expect(pieceAt(layout, layout.length - 1)).toBe('p39');
  });

  it('points at none on a heading, before the start or past the end', () => {
    const layout = layDock([{ kind: 'heading', key: 'side:a' }, ...pieces(3)], 500, HEADING);

    expect(pieceAt(layout, 5)).toBeNull();
    expect(pieceAt(layout, -1)).toBeNull();
    expect(pieceAt(layout, layout.length + 1)).toBeNull();
    expect(pieceAt(layout, HEADING + 1)).toBe('p0');
  });
});
