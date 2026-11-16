import { hexChannels } from '@axe/core/util/hex-color';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import { type EffectFloorMark } from '@axe/domain/effect/scene/effect-scene';
import { crushLetsGoAt, spaceBeatAt } from '@axe/domain/effect/space-looks';
import { castOn, CELL, stagedAt } from '@axe/testing/holy-effect-stage';

function spacePresetOf(
  kind: 'warp' | 'gravity',
  grade: number,
  durationMs: number,
  fields: Partial<EffectPreset> = {}
): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = durationMs;
  preset.colorPrimary = '#e0d4ff';
  preset.colorSecondary = '#241040';
  Object.assign(preset, fields);
  return preset;
}

const AT = { x: 400, y: 300 };

function isEmpty(drawn: Staged): boolean {
  return drawn.motes.length + drawn.ribbons.length + drawn.floor.length + drawn.lights.length === 0;
}

function clearedAt(preset: EffectPreset, cast: EffectCast): number {
  return (preset.totalDuration(cast.targets.length) + sceneLingerMsOf(preset)) / 1000 + 0.01;
}

function seals(drawn: Staged): EffectFloorMark[] {
  return drawn.floor.filter((mark) => mark.shape === 'seal');
}

/** How much of a seal is written, and whether it is its star, from its seed. */
function sealOf(mark: EffectFloorMark): { star: boolean; written: number } {
  const whole = Math.floor(mark.seed);
  return { star: whole % 2 === 1, written: 1 - (mark.seed - whole) };
}

describe('a blink', () => {
  const preset = spacePresetOf('warp', 1, 1411, { colorPrimary: '#dff0ff', colorSecondary: '#5aa8ff' });
  const cast = castOn([AT]);
  const snaps = spaceBeatAt('blink', 1.411);

  it('opens a seam across the eye through the piece before it snaps shut', () => {
    const drawn = stagedAt(preset, cast, snaps * 0.6);
    const seam = drawn.motes.filter((mote) => mote.shape === 'flare' && mote.aside !== undefined);

    expect(seam.length).toBeGreaterThan(40);
    expect(Math.max(...seam.map((mote) => mote.aside!.up))).toBeGreaterThan(CELL * 0.5);
    expect(
      drawn.motes.filter((mote) => mote.blend === 'color' && mote.shape === 'puff' && mote.aside).length
    ).toBeGreaterThan(6);
  });

  it('snaps shut in a white cross that lights the floor, and the air rushes in over it in a ring', () => {
    const drawn = stagedAt(preset, cast, snaps + 0.04);

    expect(drawn.lights.some((light) => light.strength > 1.5)).toBe(true);
    expect(
      drawn.motes.filter((mote) => mote.shape === 'flare' && mote.color === '#ffffff').length
    ).toBeGreaterThanOrEqual(2);
    expect(drawn.floor.some((mark) => mark.shape === 'ring')).toBe(true);
    expect(drawn.motes.some((mote) => mote.shape === 'gust')).toBe(true);
  });

  it('tears its afterimage away in heavy lines of colour over dark rims', () => {
    const torn = stagedAt(preset, cast, snaps + 0.2).motes.filter(
      (mote) => mote.shape === 'puff' && mote.blend === 'color' && mote.aside !== undefined
    );

    expect(torn.length).toBeGreaterThanOrEqual(100);
    expect(Math.max(...torn.map((mote) => mote.size))).toBeGreaterThan(CELL * 0.1);
  });

  it('leaves glints and a fading mark after the snap, and nothing once it has cleared', () => {
    const late = stagedAt(preset, cast, 1.8);

    expect(late.motes.some((mote) => mote.shape === 'star')).toBe(true);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});

describe('a summoning', () => {
  const preset = spacePresetOf('warp', 3, 3553, { colorPrimary: '#ffe9a8', colorSecondary: '#b06bff', scale: 1.6 });
  const cast = castOn([AT]);
  const arrives = spaceBeatAt('summon', 3.553);

  it('writes its band of glyphs round the floor first, the pen at the front of it, and no star yet', () => {
    const drawn = stagedAt(preset, cast, 0.4);
    const written = seals(drawn).map(sealOf);

    expect(written.length).toBeGreaterThan(0);
    expect(written.every((seal) => !seal.star && seal.written > 0.3 && seal.written < 0.7)).toBe(true);
    expect(drawn.motes.some((mote) => mote.shape === 'star' && mote.color === '#ffffff')).toBe(true);
  });

  it('traces its star in one line along the floor once the band is written', () => {
    const drawn = stagedAt(preset, cast, 0.85);
    const level = drawn.ribbons.filter((ribbon) => ribbon.points.every((point) => point.z < 2));

    expect(
      seals(drawn)
        .map(sealOf)
        .every((seal) => !seal.star && seal.written === 1)
    ).toBe(true);
    expect(level.some((ribbon) => ribbon.points.length >= 3)).toBe(true);
  });

  it('turns its band and its star against each other once both are written, both whole', () => {
    const before = seals(stagedAt(preset, cast, 1.3));
    const after = seals(stagedAt(preset, cast, 1.6));
    const turnOf = (marks: EffectFloorMark[], star: boolean) => marks.find((mark) => sealOf(mark).star === star)!.turn;

    expect(new Set(before.map((mark) => sealOf(mark).star))).toEqual(new Set([false, true]));
    expect(before.every((mark) => sealOf(mark).written === 1)).toBe(true);
    expect(Math.sign(turnOf(after, false) - turnOf(before, false))).toBe(
      -Math.sign(turnOf(after, true) - turnOf(before, true))
    );
  });

  it('raises a pillar of light out of the circle and blazes white as what it calls arrives', () => {
    const rising = stagedAt(preset, cast, arrives - 0.2);
    const arrival = stagedAt(preset, cast, arrives + 0.05);

    expect(
      rising.ribbons.filter((ribbon) => ribbon.points[ribbon.points.length - 1].z > CELL * 2).length
    ).toBeGreaterThan(10);
    expect(arrival.lights.some((light) => light.color === '#ffffff')).toBe(true);
    const lightest = (drawn: Staged) =>
      Math.max(
        ...seals(drawn)
          .filter((mark) => mark.blend === 'light')
          .map((mark) => Math.min(...hexChannels(mark.color)!))
      );
    expect(lightest(arrival)).toBeGreaterThan(lightest(rising) + 40);
  });

  it('writes one circle about all it calls, wide enough to take them all in, and raises a pillar on each', () => {
    const several = castOn([AT, { x: 520, y: 300 }, { x: 460, y: 400 }]);
    const drawn = stagedAt(preset, several, 1.6);
    const written = seals(drawn);
    const middle = { x: (AT.x + 520 + 460) / 3, y: (AT.y + 300 + 400) / 3 };
    const far = Math.max(...several.targets.map((target) => Math.hypot(target.x - middle.x, target.y - middle.y)));
    const pillars = drawn.ribbons.filter(
      (ribbon) => ribbon.about !== undefined && ribbon.points[ribbon.points.length - 1].z > CELL * 2
    );

    expect(new Set(written.map((mark) => `${mark.x.toFixed(1)},${mark.y.toFixed(1)}`))).toEqual(
      new Set([`${middle.x.toFixed(1)},${middle.y.toFixed(1)}`])
    );
    expect(Math.min(...written.map((mark) => mark.radius))).toBeGreaterThan(far);
    expect(new Set(pillars.map((ribbon) => Math.round(ribbon.about![0].x))).size).toBe(3);
  });

  it('lays its circle in heavy lines over a near black underlay, a body of its deep colour and a heart of gold', () => {
    const lines = seals(stagedAt(preset, cast, 1.3)).filter((mark) => mark.blend === 'color');
    const lightness = (color: string) => {
      const channels = hexChannels(color)!;
      return (Math.max(...channels) + Math.min(...channels)) / 510;
    };

    expect(Math.max(...lines.map((mark) => mark.width))).toBeGreaterThanOrEqual(0.2);
    expect(lines.some((mark) => mark.width >= 0.2 && lightness(mark.color) < 0.12)).toBe(true);
    const [red, green, blue] = hexChannels(
      lines.reduce((least, mark) => (mark.width < least.width ? mark : least)).color
    )!;
    expect(red).toBeGreaterThan(blue + 100);
    expect(green).toBeGreaterThan(blue + 60);
  });

  it('burns its circle out glyph by glyph after the arrival, and leaves nothing once it has cleared', () => {
    const burning = seals(stagedAt(preset, cast, arrives + 1.4))
      .map(sealOf)
      .filter((seal) => !seal.star);

    expect(burning.length).toBeGreaterThan(0);
    expect(burning.every((seal) => seal.written < 1)).toBe(true);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});

describe('a crush', () => {
  const preset = spacePresetOf('gravity', 2, 1855, { colorPrimary: '#c9b6ff', colorSecondary: '#3a1f66' });
  const strikes = spaceBeatAt('crush', 1.855);

  it('hangs its lens over the head of the piece, clear of it', () => {
    const drawn = stagedAt(preset, castOn([AT]), strikes * 0.8);
    const black = drawn.motes.filter((mote) => mote.color === '#000000' && mote.shape === 'puff');

    expect(black.length).toBeGreaterThan(0);
    expect(Math.min(...black.map((mote) => mote.z))).toBeGreaterThan(CELL * 1.5);
  });

  it('cracks the floor into a dish under every piece it is cast on as it comes down', () => {
    const cast = castOn([AT, { x: 700, y: 300 }]);
    const drawn = stagedAt(preset, cast, strikes + 0.2 + preset.stagger / 1000);
    const cracked = drawn.floor.filter((mark) => mark.shape === 'cracks');

    expect(cracked.some((mark) => mark.x === AT.x)).toBe(true);
    expect(cracked.some((mark) => mark.x === 700)).toBe(true);
    expect(drawn.floor.filter((mark) => mark.shape === 'fissure').length).toBeGreaterThanOrEqual(10);
  });

  it('bears down on the piece in a well of heavy bands from the lens to the floor once it comes down', () => {
    const drawn = stagedAt(preset, castOn([AT]), strikes + 0.2);
    const well = drawn.ribbons.filter(
      (ribbon) =>
        ribbon.blend === 'color' &&
        ribbon.points[0].z > CELL * 0.8 &&
        ribbon.points[ribbon.points.length - 1].z < CELL * 0.2
    );

    expect(well.length).toBeGreaterThanOrEqual(12);
  });

  it('squeezes stones out flat along the floor from under it as it comes down', () => {
    const cast = castOn([AT]);
    const squeezed = stagedAt(preset, cast, strikes + 0.3).motes.filter(
      (mote) => mote.shape === 'chunk' && mote.z < CELL * 0.2 && Math.hypot(mote.x - AT.x, mote.y - AT.y) > CELL
    );

    expect(squeezed.length).toBeGreaterThanOrEqual(5);
  });

  it('drops the pebbles it held as it lets go, to lie on the floor', () => {
    const cast = castOn([AT]);
    const held = stagedAt(preset, cast, crushLetsGoAt(1.855) - 0.05).motes.filter(
      (mote) => mote.shape === 'chunk' && Math.hypot(mote.x - AT.x, mote.y - AT.y) < CELL * 1.1
    );
    const dropped = stagedAt(preset, cast, crushLetsGoAt(1.855) + 1.2).motes.filter((mote) => mote.shape === 'chunk');

    expect(Math.min(...held.map((mote) => mote.z))).toBeGreaterThan(CELL * 1.2);
    expect(Math.max(...dropped.map((mote) => mote.z))).toBeLessThan(CELL * 0.2);
  });
});

describe('a singularity', () => {
  const preset = spacePresetOf('gravity', 3, 3788, { areaRadius: 3, targeting: 'multi', maxTargets: 8, scale: 1.6 });
  const cast = castOn([AT, { x: 500, y: 330 }, { x: 330, y: 260 }]);
  const fallsAt = spaceBeatAt('singularity', 3.788);

  it('hangs its hole high over the pieces, and opens it once however many it takes in', () => {
    const drawn = stagedAt(preset, cast, 1.1);
    const black = drawn.motes.filter((mote) => mote.color === '#000000' && mote.shape === 'puff');

    expect(black.length).toBeGreaterThan(0);
    expect(new Set(black.map((mote) => `${mote.x},${mote.y}`))).toEqual(new Set([`${AT.x},${AT.y}`]));
    expect(Math.min(...black.map((mote) => mote.z))).toBeGreaterThan(CELL * 2);
  });

  it('whirls a ring of light round its hole by halves, and lays a spiral over the floor', () => {
    const drawn = stagedAt(preset, cast, 1.1);

    expect(drawn.ribbons.filter((ribbon) => ribbon.half === 'far').length).toBeGreaterThanOrEqual(4);
    expect(drawn.ribbons.filter((ribbon) => ribbon.half === 'near').length).toBeGreaterThanOrEqual(4);
    expect(drawn.ribbons.filter((ribbon) => ribbon.points.every((point) => point.z < 2)).length).toBeGreaterThanOrEqual(
      4
    );
  });

  it('drags heavy streams of debris in off the edge of its area and up into its disc', () => {
    const drawn = stagedAt(preset, cast, 1.1);
    const streams = drawn.ribbons.filter((ribbon) => {
      const first = ribbon.points[0];
      const last = ribbon.points[ribbon.points.length - 1];
      return (
        ribbon.blend === 'color' &&
        first.z < CELL * 0.4 &&
        Math.hypot(first.x - AT.x, first.y - AT.y) > CELL * 2.5 &&
        last.z > CELL * 2
      );
    });

    expect(streams.length).toBeGreaterThanOrEqual(10);
  });

  it('throws a surge of dust out over its area as it falls in, and smoulders on through the end of its sound', () => {
    const surge = stagedAt(preset, cast, fallsAt + 0.3);
    const smouldering = stagedAt(preset, cast, 3.3);

    expect(surge.motes.filter((mote) => mote.shape === 'billow').length).toBeGreaterThanOrEqual(15);
    expect(smouldering.motes.filter((mote) => mote.shape === 'wisp').length).toBeGreaterThanOrEqual(3);
    expect(
      smouldering.ribbons.filter((ribbon) => ribbon.blend === 'light' && ribbon.points.every((point) => point.z < 2))
        .length
    ).toBeGreaterThanOrEqual(4);
  });

  it('goes dark for an instant before it falls in, then beats white and throws a ring out over the floor', () => {
    const nothing = stagedAt(preset, cast, fallsAt - 0.02);
    const beat = stagedAt(preset, cast, fallsAt + 0.05);

    expect(nothing.motes.filter((mote) => mote.blend === 'light' && mote.x === AT.x)).toEqual([]);
    expect(nothing.ribbons).toEqual([]);
    expect(beat.lights.some((light) => light.strength > 2)).toBe(true);
    expect(beat.motes.some((mote) => mote.color === '#ffffff' && mote.shape === 'puff' && mote.blend === 'color')).toBe(
      true
    );
    expect(beat.floor.some((mark) => mark.shape === 'ring' && mark.radius > CELL * 0.5)).toBe(true);
  });

  it('leaves the floor scoured in a spiral with stones lying on it, and nothing once it has cleared', () => {
    const after = stagedAt(preset, cast, fallsAt + 2.4);

    expect(after.ribbons.filter((ribbon) => ribbon.points.every((point) => point.z < 2)).length).toBeGreaterThanOrEqual(
      4
    );
    expect(after.motes.some((mote) => mote.shape === 'chunk' && mote.z < CELL * 0.3)).toBe(true);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});
