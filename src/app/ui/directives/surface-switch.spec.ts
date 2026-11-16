import { PickHit } from '@axe/domain/tabletop/pick/pick-index';
import { TERRAIN_PICK_LAYER } from '@axe/domain/tabletop/pick/terrain-pick';
import { beamRestUnder, highestBeamAmong, placeOnFace, SurfaceFaces } from '@axe/ui/directives/surface-switch';

function faces(opts: {
  localX: number;
  localY: number;
  size?: { width: number; height: number };
  overhangs?: boolean;
}) {
  return {
    pointOn: vi.fn(() => ({ localX: opts.localX, localY: opts.localY })),
    sizeOf: vi.fn(() => opts.size ?? { width: 500, height: 400 }),
    overhangs: vi.fn(() => opts.overhangs ?? false),
  } satisfies SurfaceFaces;
}

const SIZE = { width: 100, height: 60 };

describe('placeOnFace()', () => {
  it('puts the piece with its middle under the pointer, kept inside a face of the table', () => {
    expect(placeOnFace(faces({ localX: 200, localY: 100 }), 'north-wall', { x: 1, y: 2 }, SIZE)).toEqual({
      x: 150,
      y: 70,
    });
    expect(placeOnFace(faces({ localX: 10, localY: 395 }), 'north-wall', { x: 1, y: 2 }, SIZE)).toEqual({
      x: 0,
      y: 340,
    });
  });

  it('lets the piece hang over the edge of a face that allows it', () => {
    expect(placeOnFace(faces({ localX: 10, localY: 395, overhangs: true }), 'a-board', { x: 1, y: 2 }, SIZE)).toEqual({
      x: -40,
      y: 365,
    });
  });

  it('answers nothing off the face, or for a face it does not know', () => {
    expect(placeOnFace(faces({ localX: -1, localY: 100 }), 'north-wall', { x: 1, y: 2 }, SIZE)).toBeNull();
    expect(placeOnFace(faces({ localX: 10, localY: 401 }), 'north-wall', { x: 1, y: 2 }, SIZE)).toBeNull();
    const unknown = faces({ localX: 10, localY: 10 });
    unknown.sizeOf.mockReturnValue(null as never);
    expect(placeOnFace(unknown, 'nowhere', { x: 1, y: 2 }, SIZE)).toBeNull();
  });
});

function beam(
  id: string,
  top: number,
  opts: { layer?: string; surface?: string; kind?: 'prism' | 'quad' } = {}
): PickHit {
  const shape =
    opts.kind === 'quad'
      ? { kind: 'quad' as const, corners: [] as never }
      : {
          kind: 'prism' as const,
          outline: [
            { x: 10, y: 20 },
            { x: 110, y: 20 },
            { x: 110, y: 70 },
            { x: 10, y: 70 },
          ],
          base: 0,
          top,
        };
  return {
    target: {
      id,
      layer: opts.layer ?? TERRAIN_PICK_LAYER,
      order: 0,
      surface: opts.surface ?? 'north-wall',
      shapes: [shape as never],
    },
    t: 1,
    point: { x: 60, y: 45, z: 0 },
    shapeIndex: 0,
  };
}

describe('highestBeamAmong()', () => {
  it('takes the highest block on a wall the line of sight meets, passing over the piece itself', () => {
    const hits = [beam('low', 30), beam('self', 200), beam('high', 90)];

    expect(highestBeamAmong(hits, 'self')).toEqual({
      box: { minX: 10, maxX: 110, minY: 20, maxY: 70, minZ: 0, maxZ: 90 },
      at: { x: 60, y: 45, z: 0 },
    });
  });

  it('passes over what is not a block on a wall', () => {
    const hits = [
      beam('floor-block', 90, { surface: 'floor' }),
      beam('piece', 90, { layer: 'character' }),
      beam('flat', 90, { kind: 'quad' }),
    ];

    expect(highestBeamAmong(hits, undefined)).toBeNull();
  });
});

describe('beamRestUnder()', () => {
  it('rests the piece on the beam, and nowhere with no beam under the pointer', () => {
    const rest = beamRestUnder([beam('beam', 90)], undefined, SIZE);

    expect(rest).not.toBeNull();
    expect(rest!.z).toBe(90);
    expect(beamRestUnder([], undefined, SIZE)).toBeNull();
  });
});
