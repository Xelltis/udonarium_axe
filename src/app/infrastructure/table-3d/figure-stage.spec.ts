import { PIECE_MODEL_AS_MADE } from '@axe/domain/tabletop/piece-model';
import { standing } from '@axe/infrastructure/table-3d/figure-stage';
import type { StageFigure } from '@axe/infrastructure/table-3d/table-3d-port';

function figure(fields: Partial<StageFigure> = {}): StageFigure {
  return {
    key: 'knight',
    url: 'blob:knight',
    model: { identifier: 'knight-model', scale: 1, turnDeg: 0, idle: '', walk: '', ...PIECE_MODEL_AS_MADE },
    at: { x: 120, y: 40, z: 8 },
    widthPx: 60,
    heightPx: 110,
    turnDeg: 30,
    ...fields,
  };
}

describe('a figure of a stage as the table’s models are stood', () => {
  it('stands on a floor where it is put, as wide and as tall as asked, turned as asked', () => {
    expect(standing(figure(), false, 0)).toMatchObject({
      owner: 'knight',
      kind: 'character',
      url: 'blob:knight',
      foot: { x: 120, y: 40, z: 8 },
      footprintPx: 60,
      heightPx: 110,
      rotateDeg: 30,
      rollDeg: 0,
      altitudePx: 0,
      walking: false,
    });
  });

  it('seen from the front, stands with its foot on the point of the canvas it is put at, a little taller for the eye looking down', () => {
    const stood = standing(figure({ at: { x: 120, y: 160, z: 0 } }), true, 200);
    const seen = 1 / Math.cos((8 * Math.PI) / 180);

    expect(stood.foot.x).toBe(120);
    expect(stood.foot.y).toBe(0);
    expect(stood.foot.z).toBeCloseTo(40 * seen);
    expect(stood.heightPx).toBeCloseTo(110 * seen);
  });

  it('walks and acts what it is asked to, and nothing otherwise', () => {
    const act = { key: 'blow', role: 'attack', atMs: 0 } as const;

    expect(standing(figure({ walking: true, act, speaking: true }), false, 0)).toMatchObject({
      walking: true,
      act,
      speaking: true,
    });
    expect('act' in standing(figure(), false, 0)).toBe(false);
    expect('speaking' in standing(figure(), false, 0)).toBe(false);
  });

  it('keeps a figure asked to be no width at all wide enough to be fitted', () => {
    expect(standing(figure({ widthPx: 0 }), false, 0).footprintPx).toBe(1);
  });
});
