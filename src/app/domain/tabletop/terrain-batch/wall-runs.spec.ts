import { runFaceAt, SquareFace, wallRunsOf } from '@axe/domain/tabletop/terrain-batch/wall-runs';
import { describe, expect, it } from 'vitest';

function face(identifier: string, extra: Partial<SquareFace>): SquareFace {
  return {
    identifier,
    side: 'north',
    startX: 0,
    startY: 0,
    lengthPx: 50,
    heightPx: 100,
    look: 'stone',
    ...extra,
  };
}

describe('faces lying end to end, joined into runs', () => {
  it('joins faces along one line into one run that remembers each of them', () => {
    const runs = wallRunsOf([
      face('b', { startX: 50, lengthPx: 100 }),
      face('a', { startX: 0 }),
      face('c', { startX: 150 }),
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ side: 'north', startX: 0, startY: 0, lengthPx: 200, wearer: 'a' });
    expect(runs[0].faces).toEqual([
      { identifier: 'a', offsetPx: 0, lengthPx: 50 },
      { identifier: 'b', offsetPx: 50, lengthPx: 100 },
      { identifier: 'c', offsetPx: 150, lengthPx: 50 },
    ]);
  });

  it('breaks a run at a gap, a change of height or picture, and another line', () => {
    const runs = wallRunsOf([
      face('a', { startX: 0 }),
      face('gap', { startX: 100 }),
      face('taller', { startX: 150, heightPx: 150 }),
      face('wood', { startX: 200, look: 'wood' }),
      face('below', { startX: 50, startY: 50 }),
    ]);

    expect(runs).toHaveLength(5);
  });

  it('keeps faces turned different ways apart, even on one line', () => {
    expect(
      wallRunsOf([face('north', { startY: 50 }), face('south', { side: 'south', startY: 50, startX: 50 })])
    ).toHaveLength(2);
  });

  it('runs a west face from its south end, the end its picture is laid from', () => {
    const runs = wallRunsOf([
      face('north end', { side: 'west', startX: 100, startY: 50 }),
      face('south end', { side: 'west', startX: 100, startY: 100 }),
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ startX: 100, startY: 100, lengthPx: 100 });
    expect(runs[0].faces.map((one) => one.identifier)).toEqual(['south end', 'north end']);
  });

  it('picks out the face under a point along a run', () => {
    const [run] = wallRunsOf([face('a', { startX: 0 }), face('b', { startX: 50 })]);

    expect(runFaceAt(run, 10)?.identifier).toBe('a');
    expect(runFaceAt(run, 50)?.identifier).toBe('b');
    expect(runFaceAt(run, 100)).toBeNull();
  });
});
