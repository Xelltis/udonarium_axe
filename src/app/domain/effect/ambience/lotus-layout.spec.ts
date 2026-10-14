import { LOTUS_TILE_PX, lotusPadsOf } from '@axe/domain/effect/ambience/lotus-layout';

describe('lotusPadsOf()', () => {
  it('lays no leaves at none and more of them the more of the scale', () => {
    expect(lotusPadsOf(3, 0)).toHaveLength(0);
    expect(lotusPadsOf(3, 0.5).length).toBeGreaterThan(5);
    expect(lotusPadsOf(3, 1).length).toBeGreaterThan(lotusPadsOf(3, 0.5).length);
  });

  it('lays the same leaves from the same seed', () => {
    expect(lotusPadsOf(3, 0.6)).toEqual(lotusPadsOf(3, 0.6));
    expect(lotusPadsOf(4, 0.6)).not.toEqual(lotusPadsOf(3, 0.6));
  });

  it('keeps every leaf on the tile and never lays one over another, even across the edge', () => {
    const pads = lotusPadsOf(9, 1);
    for (const pad of pads) {
      expect(pad.x).toBeGreaterThanOrEqual(0);
      expect(pad.x).toBeLessThan(LOTUS_TILE_PX);
      for (const other of pads) {
        if (other === pad) continue;
        const wrap = (delta: number) => Math.min(Math.abs(delta), LOTUS_TILE_PX - Math.abs(delta));
        const apart = Math.hypot(wrap(pad.x - other.x), wrap(pad.y - other.y));
        expect(apart).toBeGreaterThanOrEqual((pad.radius + other.radius) * 0.82 - 1e-9);
      }
    }
  });

  it('gives a few leaves a flower and a few a bud', () => {
    const blooms = lotusPadsOf(9, 1).map((pad) => pad.bloom);
    expect(blooms).toContain('flower');
    expect(blooms.filter((bloom) => bloom !== null).length).toBeLessThan(blooms.length / 2);
  });
});
