import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { drawThunderShot, isThunderShot, type ThunderFlight } from '@axe/domain/effect/scene/shot/thunder-shot';
import { castOn, CELL, HAND, stagedAt, thunderPresetOf } from '@axe/testing/thunder-effect-stage';

const RAMP = rampOf('#f0f7ff', '#7b5cff', 7);

function flightOf(share = 0.5, seconds = share * 0.4): ThunderFlight {
  const pathAt = (along: number) => ({ x: 100 + along * 400, y: 300, z: 30 });
  return {
    at: pathAt(share),
    way: { x: 1, y: 0, z: 0 },
    cell: CELL,
    share,
    pathAt,
    seconds,
    seed: 5,
    floorZ: 0,
    forward: 20,
  };
}

function drawnOf(share = 0.5, seconds?: number) {
  const drawn = nothingStaged();
  drawThunderShot(drawn, flightOf(share, seconds), RAMP);
  return drawn;
}

describe('a shot of lightning in flight', () => {
  it('flies as a ball white at its heart, in a dark sheath that keeps it on a bright floor', () => {
    const drawn = drawnOf();
    const at = flightOf().at;
    const ball = drawn.motes.filter((mote) => mote.x === at.x && mote.y === at.y && mote.z === at.z);
    const heart = ball.find((mote) => mote.color === '#ffffff')!;
    const sheath = ball.find((mote) => mote.blend === 'color')!;

    expect(heart.blend).toBe('light');
    expect(sheath.size).toBeGreaterThan(heart.size * 2);
    expect(
      Math.max(...[1, 3, 5].map((channel) => parseInt(sheath.color.slice(channel, channel + 2), 16)))
    ).toBeLessThan(110);
  });

  it('is wound about with small bolts close to the ball, which take another shape a moment later', () => {
    const at = flightOf().at;
    const woundOf = (seconds: number) =>
      drawnOf(0.5, seconds).ribbons.filter(
        (ribbon) =>
          ribbon.blend === 'light' &&
          ribbon.points.every((point) => Math.hypot(point.x - at.x, point.y - at.y, point.z - at.z) < CELL * 1.2)
      );

    expect(woundOf(0.2).length).toBeGreaterThanOrEqual(4);
    expect(woundOf(0.2)[0].points[1]).not.toEqual(woundOf(0.25)[0].points[1]);
  });

  it('leaves a jagged track of colour behind it along the way it has come, and sheds sparks', () => {
    const drawn = drawnOf();
    const track = drawn.ribbons.filter(
      (ribbon) => ribbon.blend === 'color' && ribbon.points[0].x < flightOf().at.x - CELL
    );

    expect(track.length).toBeGreaterThan(0);
    expect(drawn.motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(2);
    expect(drawn.motes.filter((mote) => mote.shape === 'spark').every((mote) => mote.x < flightOf().at.x)).toBe(true);
  });

  it('drops a thread of lightning to the floor it passes over now and then', () => {
    let threads = 0;
    for (let frame = 0; frame < 12; frame++) {
      const drawn = drawnOf(0.5, frame * 0.04 + 0.001);
      if (drawn.ribbons.some((ribbon) => ribbon.blend === 'light' && ribbon.points.at(-1)!.z < CELL * 0.1)) threads++;
    }

    expect(threads).toBeGreaterThanOrEqual(3);
    expect(threads).toBeLessThan(12);
  });

  it('sheds nothing behind where it was thrown from, and throws one light', () => {
    const drawn = drawnOf(0.01);

    expect(drawn.motes.filter((mote) => mote.shape === 'spark')).toHaveLength(0);
    expect(drawn.lights).toHaveLength(1);
  });
});

describe('a shot that lands in a bolt of lightning', () => {
  const target = { x: 400, y: 300 };

  it('flies as a shot of lightning, not as a ball of light with a tail', () => {
    const shot = thunderPresetOf('projectile', 2, { impactKind: 'bolt', tagName: '射撃', durationMs: 850 });
    const flying = stagedAt(shot, castOn([target]), 0.2);

    expect(flying.ribbons.filter((ribbon) => ribbon.blend === 'light').length).toBeGreaterThanOrEqual(4);
    expect(flying.motes.some((mote) => mote.shape === 'star' && mote.z > CELL * 0.2)).toBe(false);
    expect(flying.ribbons.every((ribbon) => ribbon.points[0].x >= HAND.x - CELL)).toBe(true);
  });

  it('flies as a bolt of magic, wound with no lightning, where it is of another element', () => {
    const other = thunderPresetOf('projectile', 2, { impactKind: 'bolt', tagName: '氷', durationMs: 850 });
    const flying = stagedAt(other, castOn([target]), 0.2);

    expect(flying.ribbons).toHaveLength(5);
    expect(flying.motes.some((mote) => mote.shape === 'star')).toBe(true);
  });
});

function shotOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.impactKind = 'bolt';
  preset.tagName = '射撃';
  Object.assign(preset, fields);
  return preset;
}

describe('isThunderShot()', () => {
  it('takes a bolt that lands in a bolt of lightning for a shot of lightning, as the bundled one is written', () => {
    const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.name === '雷弾')!;

    expect([seed.kind, seed.impactKind, seed.projectileStyle ?? 'bolt']).toEqual(['projectile', 'bolt', 'bolt']);
    expect(isThunderShot(shotOf({ tagName: seed.tagName, moteStyle: seed.moteStyle ?? '' }))).toBe(true);
    expect(isThunderShot(shotOf({ tagName: '雷' }))).toBe(true);
    expect(isThunderShot(shotOf({ tagName: '' }))).toBe(true);
  });

  it('leaves a shot of another element, of another look or with another landing as it was', () => {
    expect(isThunderShot(shotOf({ tagName: '炎' }))).toBe(false);
    expect(isThunderShot(shotOf({ tagName: '氷' }))).toBe(false);
    expect(isThunderShot(shotOf({ moteStyle: 'frost' }))).toBe(false);
    expect(isThunderShot(shotOf({ projectileStyle: 'arrow' }))).toBe(false);
    expect(isThunderShot(shotOf({ impactKind: 'burst' }))).toBe(false);
    expect(isThunderShot(shotOf({ kind: 'bolt' }))).toBe(false);
  });

  it('lets the particle a shot names say first, over its family', () => {
    expect(isThunderShot(shotOf({ tagName: '炎', moteStyle: 'arc' }))).toBe(true);
    expect(isThunderShot(shotOf({ tagName: '雷', moteStyle: 'leaf' }))).toBe(false);
  });
});
