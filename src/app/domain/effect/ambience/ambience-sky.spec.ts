import { SKY_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import {
  skyAmbienceFlash,
  skyAmbienceLayer,
  skyAmbienceWash,
  type SkyCurrent,
} from '@axe/domain/effect/ambience/ambience-sky';

const WIDTH = 1280;
const HEIGHT = 720;

function layerOf(kind: (typeof SKY_AMBIENCE_KINDS)[number], elapsed: number, density = 0.6) {
  return skyAmbienceLayer({ kind, color: '', density, elapsed, width: WIDTH, height: HEIGHT });
}

describe('skyAmbienceLayer()', () => {
  it('returns particles for every kind of weather', () => {
    for (const kind of SKY_AMBIENCE_KINDS) {
      expect(layerOf(kind, 1000).particles.length).toBeGreaterThan(0);
    }
  });

  it('shows nothing at no density', () => {
    for (const kind of SKY_AMBIENCE_KINDS) {
      expect(layerOf(kind, 1000, 0).particles).toHaveLength(0);
    }
  });

  it('returns none for a screen of no size', () => {
    const layer = skyAmbienceLayer({ kind: 'rain', color: '', density: 1, elapsed: 0, width: 0, height: 0 });
    expect(layer.particles).toHaveLength(0);
  });

  it('draws the same at the same moment', () => {
    expect(layerOf('snow', 2400)).toEqual(layerOf('snow', 2400));
  });

  it('moves them on as the time passes', () => {
    const before = layerOf('rain', 0).particles[0];
    const after = layerOf('rain', 400).particles[0];
    expect(after.y).not.toBe(before.y);
  });

  it('never leaves them off the screen as they wrap', () => {
    // They wrap at the edges, so a large step in time does not carry them away.
    for (const elapsed of [0, 10_000, 600_000]) {
      for (const particle of layerOf('snow', elapsed).particles) {
        expect(particle.x).toBeGreaterThanOrEqual(-WIDTH);
        expect(particle.x).toBeLessThanOrEqual(WIDTH * 2);
        expect(particle.y).toBeGreaterThanOrEqual(-HEIGHT);
        expect(particle.y).toBeLessThanOrEqual(HEIGHT * 2);
      }
    }
  });

  it('keeps every opacity between none and full', () => {
    for (const kind of SKY_AMBIENCE_KINDS) {
      for (const particle of layerOf(kind, 3300, 1).particles) {
        expect(particle.alpha).toBeGreaterThanOrEqual(0);
        expect(particle.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('draws rain as streaks drawn out downwards', () => {
    const [particle] = layerOf('rain', 500).particles;
    expect(particle.shape).toBe('streak');
    expect(particle.stretch).toBeGreaterThan(1);
  });
});

describe('how it looks over the screen', () => {
  it('makes enough particles to fill the screen for the kinds shown by them', () => {
    // Fog and miasma are shown by large masses and a wash, so they are not measured by count.
    for (const kind of SKY_AMBIENCE_KINDS.filter((candidate) => candidate !== 'fog' && candidate !== 'miasma')) {
      expect(layerOf(kind, 2000).particles.length).toBeGreaterThanOrEqual(60);
    }
  });

  it('keeps the wash thick enough that the colour of the air reads', () => {
    for (const kind of ['fog', 'miasma', 'ash', 'sand'] as const) {
      const alphas = [...skyAmbienceWash(kind, '', 0.6).matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((match) =>
        Number(match[1])
      );
      expect(Math.max(...alphas)).toBeGreaterThanOrEqual(0.15);
    }
  });
});

describe('skyAmbienceWash()', () => {
  it('washes nothing at no density', () => {
    expect(skyAmbienceWash('fog', '', 0)).toBe('');
  });

  it('washes fog in the colour it is given', () => {
    expect(skyAmbienceWash('fog', '#102030', 1)).toContain('rgba(16, 32, 48');
  });

  it('leaves the colour of the air alone for particles of light', () => {
    expect(skyAmbienceWash('bloom', '', 1)).toBe('');
  });

  it('never crushes thick fog with the wash, however dense', () => {
    const alphasAt = (density: number) =>
      [...skyAmbienceWash('fog', '', density).matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((match) => Number(match[1]));

    // The density belongs to the overlapping cloud; thickened by the wash, the cloud sinks into a lump.
    expect(Math.max(...alphasAt(1))).toBeLessThan(0.6);
    // Even so, the distance hazes first.
    const [far, , near] = alphasAt(1);
    expect(far).toBeGreaterThan(near * 2);
  });

  it('shows thicker fog by more cloud', () => {
    const cloudsAt = (density: number) => layerOf('fog', 2000, density).particles.length;

    expect(cloudsAt(1)).toBeGreaterThan(cloudsAt(0.6));
    expect(cloudsAt(0.6)).toBeGreaterThan(cloudsAt(0.3));
    // Without a mixture of sizes it is wallpaper of one cloud repeated.
    const sizes = layerOf('fog', 2000).particles.map((particle) => particle.size);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(3);
  });

  it('drives a thunderstorm sideways', () => {
    const particles = layerOf('storm', 2000).particles;
    const rain = layerOf('rain', 2000).particles;

    // It leans further than falling rain; the angle is measured from the horizontal, and the smaller it is the harder it drives.
    expect(Math.min(...particles.map((particle) => particle.angle))).toBeLessThan(
      Math.min(...rain.map((particle) => particle.angle))
    );
    expect(particles.length).toBeGreaterThan(rain.length);
    // Without torn spray mixed in it is merely heavy rain.
    const stretches = particles.map((particle) => particle.stretch);
    expect(Math.max(...stretches)).toBeGreaterThan(20);
  });

  it('thickens the water with the distance and lets the light down from the surface', () => {
    const wash = skyAmbienceWash('underwater', '', 0.6);
    expect(wash).toContain('at 50% -12%');
    const [, far, , near] = [...wash.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((match) => Number(match[1]));
    expect(far).toBeGreaterThan(near * 2);
  });

  it('fills the water with bubbles rising, motes and a few shafts of light', () => {
    const particles = layerOf('underwater', 2000).particles;
    const shapes = new Set(particles.map((particle) => particle.shape));
    expect(shapes).toEqual(new Set(['bubble', 'glow', 'streak']));
    expect(particles.filter((particle) => particle.shape === 'streak').length).toBeLessThan(particles.length / 6);

    const before = layerOf('underwater', 2000).particles.filter((particle) => particle.shape === 'bubble');
    const after = layerOf('underwater', 2400).particles.filter((particle) => particle.shape === 'bubble');
    const risen = before.filter((bubble, index) => after[index].y < bubble.y).length;
    expect(risen).toBeGreaterThan(before.length * 0.8);
  });

  describe('in flowing water', () => {
    // A large screen, so enough of the motes drifting about the eye fall within it to count.
    const BIG_WIDTH = 2560;
    const BIG_HEIGHT = 1440;
    const glowsIn = (current: SkyCurrent) =>
      skyAmbienceLayer({
        kind: 'underwater',
        color: '',
        density: 1,
        elapsed: 2000,
        width: BIG_WIDTH,
        height: BIG_HEIGHT,
        current,
      }).particles.filter((particle) => particle.shape === 'glow');
    const still: SkyCurrent = { carriedAcross: 0, carriedToward: 0, across: 0.3, toward: 0 };

    it('carries the motes across the view the way the water flows, near ones faster than far', () => {
      const before = glowsIn(still);
      const after = glowsIn({ ...still, carriedAcross: 0.02 });
      // Carried across, a mote keeps its height and its size: that is how it is found again.
      const shifts = before.flatMap((mote) => {
        const next = after.find((moved) => moved.y === mote.y && moved.size === mote.size);
        return next ? [next.x - mote.x] : [];
      });

      expect(shifts.length).toBeGreaterThan(20);
      expect(shifts.every((shift) => shift > 0)).toBe(true);
      expect(Math.max(...shifts)).toBeGreaterThan(Math.min(...shifts) * 3);
    });

    it('spreads the motes out from the middle as water comes at the eye', () => {
      const coming: SkyCurrent = { carriedAcross: 0, carriedToward: 0, across: 0, toward: 1 };
      const before = glowsIn(coming);
      const after = glowsIn({ ...coming, carriedToward: 0.01 });
      const fromMiddle = (mote: { x: number; y: number }) =>
        Math.hypot(mote.x - BIG_WIDTH / 2, mote.y - BIG_HEIGHT / 2);
      const nearest = (mote: { x: number; y: number }) =>
        after.reduce((best, next) =>
          Math.hypot(next.x - mote.x, next.y - mote.y) < Math.hypot(best.x - mote.x, best.y - mote.y) ? next : best
        );
      // A small step moves each mote a few pixels; one found further off has come round from the far end.
      const moved = before
        .map((mote) => [mote, nearest(mote)] as const)
        .filter(([mote, next]) => Math.hypot(next.x - mote.x, next.y - mote.y) < 12);

      expect(moved.length).toBeGreaterThan(20);
      const outward = moved.filter(([mote, next]) => fromMiddle(next) > fromMiddle(mote)).length;
      expect(outward).toBeGreaterThan(moved.length * 0.9);
    });

    it('draws fast water as streaks along the way it runs', () => {
      const particles = skyAmbienceLayer({
        kind: 'underwater',
        color: '',
        density: 1,
        elapsed: 2000,
        width: BIG_WIDTH,
        height: BIG_HEIGHT,
        current: { carriedAcross: 0, carriedToward: 0, across: 2.2, toward: 0 },
      }).particles;
      // The shafts of light lean down the view; the streaks of the current lie across it.
      const across = particles.filter((particle) => particle.shape === 'streak' && Math.abs(particle.angle) < 0.2);

      expect(across.length).toBeGreaterThan(10);
      expect(glowsIn(still).length).toBeGreaterThan(0);
    });
  });

  it('lays the wash along the depth of the board', () => {
    // Washed evenly down the screen it does not meet the depth of a tilted board.
    expect(skyAmbienceWash('fog', '', 0.6, '160.5deg')).toContain('linear-gradient(160.5deg,');
    expect(skyAmbienceWash('fog', '', 0.6)).toContain('linear-gradient(to bottom,');
  });
});

describe('skyAmbienceFlash()', () => {
  const SPAN_MS = 12_000;

  function peakWithin(density = 0.6): { peak: number; lit: number } {
    let peak = 0;
    let lit = 0;
    for (let time = 0; time < SPAN_MS; time += 10) {
      const power = skyAmbienceFlash('storm', time, density);
      peak = Math.max(peak, power);
      if (power > 0.02) lit += 10;
    }
    return { peak, lit };
  }

  it('flashes nothing for weather that carries no lightning', () => {
    for (const time of [0, 1200, 4800, 9000]) {
      expect(skyAmbienceFlash('rain', time, 1)).toBe(0);
      expect(skyAmbienceFlash('fog', time, 1)).toBe(0);
    }
  });

  it('flashes hard now and then', () => {
    const { peak, lit } = peakWithin(1);
    expect(peak).toBeGreaterThan(0.5);
    // Held on it is lighting rather than lightning.
    expect(lit).toBeLessThan(SPAN_MS * 0.2);
    expect(lit).toBeGreaterThan(0);
  });

  it('flashes nothing at no density', () => {
    for (let time = 0; time < SPAN_MS; time += 10) expect(skyAmbienceFlash('storm', time, 0)).toBe(0);
  });

  it('flashes the same on every screen at the same moment', () => {
    for (const time of [900, 3300, 7700]) {
      expect(skyAmbienceFlash('storm', time, 0.6)).toBe(skyAmbienceFlash('storm', time, 0.6));
    }
  });
});
