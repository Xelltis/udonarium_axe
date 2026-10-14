import {
  groundSurfaceLayer,
  groundSurfaceWash,
  groundVaporLayer,
  vaporCellsOf,
  vaporSliceCount,
} from '@axe/domain/effect/ambience/ambience-ground';
import { type AmbienceKind, ambiencePalette, GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';

const UNIT = 50;
const WIDTH = UNIT * 6;
const HEIGHT = UNIT * 6;
const VAPOR_HEIGHT = UNIT * 2.6;

/**
 * The kinds an area draws for itself. Water is left to the water layer, which draws every pond
 * whole so that one laid as many areas side by side shows no seam.
 */
const DRAWN_BY_THE_AREA = GROUND_AMBIENCE_KINDS.filter((kind) => kind !== 'water');

function specOf(kind: AmbienceKind, elapsed: number, density = 0.6, height = HEIGHT) {
  return { kind, color: '', density, elapsed, width: WIDTH, height, unit: UNIT };
}

describe('groundSurfaceLayer()', () => {
  it('returns particles for the kinds that have a surface', () => {
    for (const kind of DRAWN_BY_THE_AREA.filter((candidate) => candidate !== 'fog')) {
      expect(groundSurfaceLayer(specOf(kind, 1200)).particles.length).toBeGreaterThan(0);
    }
  });

  it('shows a pool of mist by what rises from it alone, with nothing on the surface', () => {
    expect(groundSurfaceLayer(specOf('fog', 1200)).particles).toHaveLength(0);
    expect(groundVaporLayer(specOf('fog', 1200, 0.6, VAPOR_HEIGHT)).particles.length).toBeGreaterThan(0);
  });

  it('shows nothing at no density', () => {
    for (const kind of DRAWN_BY_THE_AREA) {
      expect(groundSurfaceLayer(specOf(kind, 1200, 0)).particles).toHaveLength(0);
    }
  });

  it('keeps the particles inside the area', () => {
    for (const kind of DRAWN_BY_THE_AREA) {
      for (const particle of groundSurfaceLayer(specOf(kind, 4400, 1)).particles) {
        expect(particle.x).toBeGreaterThanOrEqual(0);
        expect(particle.x).toBeLessThanOrEqual(WIDTH);
        expect(particle.y).toBeGreaterThanOrEqual(0);
        expect(particle.y).toBeLessThanOrEqual(HEIGHT);
      }
    }
  });

  it('sizes them by the cells rather than by the area', () => {
    const narrow = groundSurfaceLayer({ ...specOf('lava', 900), width: UNIT * 4, height: UNIT * 4 });
    const wide = groundSurfaceLayer({ ...specOf('lava', 900), width: UNIT * 16, height: UNIT * 16 });
    expect(wide.particles[0].size).toBe(narrow.particles[0].size);
  });

  it('draws differently at one moment when the phase is offset', () => {
    const plain = groundSurfaceLayer(specOf('swamp', 1000));
    const shifted = groundSurfaceLayer({ ...specOf('swamp', 1000), phase: 777 });
    expect(shifted.particles).not.toEqual(plain.particles);
  });
});

describe('groundVaporLayer()', () => {
  it('returns rising particles for every kind', () => {
    for (const kind of DRAWN_BY_THE_AREA) {
      expect(groundVaporLayer(specOf(kind, 1500, 0.6, VAPOR_HEIGHT)).particles.length).toBeGreaterThan(0);
    }
  });

  it('puts the origin at the middle of the near edge and widens the canvas by the margin', () => {
    const layer = groundVaporLayer(specOf('vent', 0, 0.6, VAPOR_HEIGHT));
    // The origin is the middle of the near edge, and the canvas spreads a margin around it.
    expect(layer.originX).toBeGreaterThan(WIDTH / 2);
    expect(layer.originY).toBeGreaterThan(VAPOR_HEIGHT);
    expect(layer.width - layer.originX).toBeCloseTo(layer.originX);
    expect(layer.height).toBeGreaterThan(layer.originY);
  });

  it('shows nothing below the origin', () => {
    for (const kind of DRAWN_BY_THE_AREA) {
      for (const particle of groundVaporLayer(specOf(kind, 2600, 1, VAPOR_HEIGHT)).particles) {
        expect(particle.y).toBeLessThanOrEqual(0);
        expect(particle.y).toBeGreaterThanOrEqual(-VAPOR_HEIGHT);
      }
    }
  });

  it('keeps every opacity between none and full', () => {
    for (const kind of DRAWN_BY_THE_AREA) {
      for (const particle of groundVaporLayer(specOf(kind, 3100, 1, VAPOR_HEIGHT)).particles) {
        expect(particle.alpha).toBeGreaterThanOrEqual(0);
        expect(particle.alpha).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('water', () => {
  it('draws nothing of its own, being drawn whole by the water layer', () => {
    expect(groundSurfaceLayer(specOf('water', 1200, 1)).particles).toHaveLength(0);
    expect(groundVaporLayer(specOf('water', 1200, 1, VAPOR_HEIGHT)).particles).toHaveLength(0);
    expect(groundSurfaceWash('water', '', 1)).toBe('');
  });
});

describe('groundSurfaceWash()', () => {
  it('keeps the surface filled even at a density that shows no particles', () => {
    for (const kind of DRAWN_BY_THE_AREA) {
      expect(groundSurfaceWash(kind, '', 0).length).toBeGreaterThan(0);
    }
  });

  it('takes the given colour into the fill', () => {
    expect(groundSurfaceWash('swamp', '#102030', 1)).toContain('rgba(16, 32, 48');
  });
});

describe('how it looks the moment it is placed', () => {
  const DEFAULT_CELLS = 4;
  const width = UNIT * DEFAULT_CELLS;

  function placedSpec(kind: AmbienceKind, height: number) {
    return { kind, color: '', density: 0.6, elapsed: 2000, width, height, unit: UNIT };
  }

  it('shows enough particles to count even at the default size', () => {
    // Counted by area, an area this small would show a handful for some kinds and look as
    // though nothing had been placed at all.
    for (const kind of DRAWN_BY_THE_AREA) {
      const surface = groundSurfaceLayer(placedSpec(kind, width));
      const vapor = groundVaporLayer(placedSpec(kind, UNIT * 2.6));
      expect(surface.particles.length + vapor.particles.length).toBeGreaterThanOrEqual(14);
    }
  });

  it('keeps the picture off the edge of the canvas', () => {
    // The particles are cut to the canvas. One as wide as the area is cut at its skirt even
    // with its centre in the middle, and a grey square floats on the board. Thinning it is no
    // guard, so the canvas is widened until the largest particle fits.
    let checked = 0;
    for (const kind of DRAWN_BY_THE_AREA) {
      for (const elapsed of [0, 700, 1600, 2900, 5200]) {
        const layers = [
          groundSurfaceLayer({ ...placedSpec(kind, width), elapsed }),
          groundVaporLayer({ ...placedSpec(kind, UNIT * 2.6), elapsed }),
        ];
        for (const layer of layers) {
          for (const particle of layer.particles) {
            if (particle.alpha < 0.02) continue;
            checked += 1;
            // A particle drawn out upwards, such as a tongue of flame, stands taller than its size.
            const halfWidth = particle.size / 2;
            const halfHeight = (particle.size * particle.stretch) / 2;
            const centerX = layer.originX + particle.x;
            const centerY = layer.originY + particle.y;
            expect(halfWidth).toBeLessThanOrEqual(Math.min(centerX, layer.width - centerX));
            expect(halfHeight).toBeLessThanOrEqual(Math.min(centerY, layer.height - centerY));
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('adds no particles when the rise is split through the depth', () => {
    // Thickening with each sheet added, a wider area would draw more slowly and lose its colour.
    const wide = { ...placedSpec('vent', UNIT * 3), width: UNIT * 16 };
    const single = groundVaporLayer(wide).particles.length;
    const sliced = [0, 1, 2, 3, 4].reduce(
      (total, index) => total + groundVaporLayer({ ...wide, sliceIndex: index, sliceCount: 5 }).particles.length,
      0
    );
    expect(sliced).toBeLessThanOrEqual(single + 5);
  });

  it('keeps the flame as dense over a wider area', () => {
    // Capped by the total count, each sheet thins as it widens until a few flames float apart.
    const densityOf = (cells: number) => {
      const areaWidth = UNIT * cells;
      const slices = vaporSliceCount(areaWidth, UNIT);
      let covered = 0;
      for (let index = 0; index < slices; index++) {
        const layer = groundVaporLayer({
          ...placedSpec('blaze', UNIT * vaporCellsOf('blaze')),
          width: areaWidth,
          sliceIndex: index,
          sliceCount: slices,
        });
        for (const particle of layer.particles) {
          if (particle.shape !== 'glow') continue;
          covered += particle.size * particle.size * particle.stretch * particle.alpha;
        }
      }
      return covered / areaWidth;
    };

    expect(densityOf(16)).toBeGreaterThan(densityOf(4) * 0.7);
  });

  it('adds sheets with the depth, but not without limit', () => {
    expect(vaporSliceCount(UNIT * 2, UNIT)).toBe(1);
    expect(vaporSliceCount(UNIT * 8, UNIT)).toBeGreaterThan(1);
    expect(vaporSliceCount(UNIT * 16, UNIT)).toBeGreaterThan(vaporSliceCount(UNIT * 8, UNIT));
    expect(vaporSliceCount(UNIT * 100, UNIT)).toBeLessThanOrEqual(5);
  });

  it('draws each sheet differently', () => {
    const wide = { ...placedSpec('vent', UNIT * 3), width: UNIT * 16, sliceCount: 4 };
    const first = groundVaporLayer({ ...wide, sliceIndex: 0 }).particles;
    const second = groundVaporLayer({ ...wide, sliceIndex: 1 }).particles;
    expect(second).not.toEqual(first);
  });

  describe('ground on fire', () => {
    const height = UNIT * vaporCellsOf('blaze');

    function flames() {
      return groundVaporLayer(placedSpec('blaze', height)).particles.filter(
        (particle) => particle.shape === 'glow' && particle.alpha >= 0.08
      );
    }

    it('raises the flame off the floor', () => {
      // Fastest at the moment it appears, it has left the floor by the time it thickens and hangs in the air.
      // It is the ground that burns, so most of the brightness has to touch the floor.
      const lit = flames();
      const onFloor = lit.filter((flame) => -flame.y - (flame.size * flame.stretch) / 2 < UNIT * 0.2);
      const litWeight = lit.reduce((sum, flame) => sum + flame.alpha, 0);
      const floorWeight = onFloor.reduce((sum, flame) => sum + flame.alpha, 0);

      expect(floorWeight / litWeight).toBeGreaterThan(0.5);
    });

    it('reaches tongues of flame up from that bed', () => {
      const tongues = flames().filter((flame) => flame.stretch > 1.5);
      expect(tongues.length).toBeGreaterThan(5);

      // All of a size it is a campfire rather than a blaze.
      const heights = tongues.map((tongue) => tongue.size * tongue.stretch);
      expect(Math.max(...heights) / Math.min(...heights)).toBeGreaterThan(4);
    });

    it('reaches several cells high', () => {
      const top = Math.max(...flames().map((flame) => -flame.y + (flame.size * flame.stretch) / 2));
      expect(top).toBeGreaterThan(UNIT * 3);
    });

    it('burns white at the root and carries dark smoke above', () => {
      const layer = groundVaporLayer(placedSpec('blaze', height));
      expect(layer.particles.some((particle) => particle.color === '#ffffff')).toBe(true);
      expect(layer.particles.some((particle) => particle.shape === 'smoke')).toBe(true);

      // Darkened all the way up, the particles add nothing where they are laid additively and the flame goes thin.
      const dark = layer.particles.filter((particle) => particle.shape === 'glow' && particle.color !== '#ffffff');
      expect(dark.every((particle) => particle.color !== ambiencePalette('blaze').secondary)).toBe(true);
    });
  });

  it('thins the particles towards the edge of the area', () => {
    let checked = 0;
    for (const kind of DRAWN_BY_THE_AREA) {
      for (const elapsed of [0, 900, 2000, 3700]) {
        const layer = groundSurfaceLayer({ ...placedSpec(kind, width), elapsed });
        if (layer.particles.length < 1) continue;
        const peak = Math.max(...layer.particles.map((particle) => particle.alpha));
        for (const particle of layer.particles) {
          const toEdge = Math.min(particle.x, width - particle.x, particle.y, width - particle.y);
          if (toEdge > 4) continue;
          checked += 1;
          expect(particle.alpha).toBeLessThan(peak * 0.35);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('always leaves the fill transparent at the edge of its box', () => {
    // A gradient at its default size runs past the box and is cut in a straight line where it does.
    for (const kind of DRAWN_BY_THE_AREA) {
      const wash = groundSurfaceWash(kind, '', 0.6);
      const layers = wash.split('radial-gradient').filter((part) => part.trim().length > 0);
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) {
        expect(layer).toContain('closest-side');
        expect(layer).toContain('transparent 100%');
      }
    }
  });

  it('keeps the surface thick enough to read as ground', () => {
    for (const kind of DRAWN_BY_THE_AREA) {
      const alphas = [...groundSurfaceWash(kind, '', 0.6).matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((match) =>
        Number(match[1])
      );
      expect(Math.max(...alphas)).toBeGreaterThanOrEqual(0.35);
    }
  });
});
