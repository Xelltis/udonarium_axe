import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import { castOn, CELL, stagedAt } from '@axe/testing/holy-effect-stage';

function darkPresetOf(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 4000;
  preset.colorPrimary = '#e3b3ff';
  preset.colorSecondary = '#6a1fc2';
  Object.assign(preset, fields);
  return preset;
}

const AT = { x: 400, y: 300 };
const BLACK = '#000000';

function strikesOf(preset: EffectPreset): number[] {
  return effectBlowsOf(preset).map((blow) => blow.atMs / 1000);
}

function blackMotes(drawn: Staged) {
  return drawn.motes.filter((mote) => mote.color === BLACK && mote.blend === 'color');
}

function clearedAt(preset: EffectPreset, cast: EffectCast): number {
  return (preset.totalDuration(cast.targets.length) + sceneLingerMsOf(preset)) / 1000 + 0.01;
}

function isEmpty(drawn: Staged): boolean {
  return drawn.motes.length + drawn.ribbons.length + drawn.floor.length + drawn.lights.length === 0;
}

describe('a draining', () => {
  const preset = darkPresetOf('drain', 2, { durationMs: 3239, colorPrimary: '#ffc2d4', colorSecondary: '#c8143c' });
  const cast = castOn([AT]);
  const [hooks, snaps] = strikesOf(preset);
  const reach = (drawn: Staged) =>
    Math.max(
      0,
      ...drawn.ribbons.flatMap((ribbon) => ribbon.points).map((point) => Math.hypot(point.x - 50, point.y - 300))
    );
  const span = Math.hypot(AT.x - 50, AT.y - 300);

  it('whips its strands out from the caster and hooks them into the target at the blow', () => {
    expect(reach(stagedAt(preset, cast, hooks * 0.4))).toBeLessThan(span * 0.9);
    expect(reach(stagedAt(preset, cast, hooks + 0.1))).toBeGreaterThan(span * 0.9);
  });

  it('pulls on three strands, each a body over a dark sheath with a thread of light down it, a swelling running down them', () => {
    const drawn = stagedAt(preset, cast, hooks + 0.75);
    const bodies = drawn.ribbons.filter((ribbon) => ribbon.core !== undefined && ribbon.torn !== undefined);
    const sheaths = drawn.ribbons.filter((ribbon) => ribbon.core === undefined && ribbon.torn !== undefined);
    const threads = drawn.ribbons.filter((ribbon) => ribbon.alphas !== undefined);
    const widths = bodies[0].widths as readonly number[];

    expect(bodies).toHaveLength(3);
    expect(sheaths).toHaveLength(3);
    expect(threads).toHaveLength(3);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.8);
  });

  it('carries drops of white light down the strands, laid over them, from the target towards the one who drains', () => {
    const drops = (seconds: number) =>
      stagedAt(preset, cast, seconds).ribbons.filter(
        (ribbon) => ribbon.core === '#ffffff' && ribbon.points.length === 6
      );
    const now = drops(hooks + 0.6);
    const head = (drop: (typeof now)[number]) => Math.hypot(drop.points[0].x - 50, drop.points[0].y - 300);
    const tail = (drop: (typeof now)[number]) => Math.hypot(drop.points[5].x - 50, drop.points[5].y - 300);

    expect(drops(hooks * 0.5)).toEqual([]);
    expect(now.length).toBeGreaterThanOrEqual(9);
    for (const drop of now) expect(head(drop)).toBeLessThan(tail(drop));
  });

  it('throws no white light on the table, only the colours of the theft', () => {
    for (let seconds = 0; seconds < snaps + 1; seconds += 0.05) {
      const lights = stagedAt(preset, cast, seconds).lights;

      expect(lights.filter((light) => light.color === '#ffffff')).toEqual([]);
    }
  });

  it('dims the target and takes the light out of the floor under it while it is held', () => {
    const drawn = stagedAt(preset, cast, (hooks + snaps) / 2);

    expect(drawn.floor.some((mark) => mark.color === BLACK && mark.x === AT.x && mark.y === AT.y)).toBe(true);
    expect(blackMotes(drawn).some((mote) => mote.shape === 'glow' && mote.x === AT.x)).toBe(true);
  });

  it('wreathes the one who drains in flame, taller the more it has drunk, and no one where it is cast from nowhere', () => {
    const wreath = (drawn: Staged) =>
      drawn.motes.filter((mote) => mote.shape === 'lick' && Math.hypot(mote.x - 50, mote.y - 300) < CELL);
    const tall = (seconds: number) => Math.max(...wreath(stagedAt(preset, cast, seconds)).map((mote) => mote.z));

    expect(wreath(stagedAt(preset, cast, hooks * 0.5))).toEqual([]);
    expect(tall(snaps - 0.05)).toBeGreaterThan(tall(hooks + 0.1));
    expect(
      stagedAt(preset, castOn([AT], false), (hooks + snaps) / 2).motes.filter((mote) => mote.shape === 'lick')
    ).toEqual([]);
  });

  it('draws the one who drains once, however many it drains', () => {
    const two = castOn([AT, { x: AT.x, y: AT.y + 100 }]);
    const licks = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'lick').length;
    const fields = { staggerMs: 0 };

    expect(licks(stagedAt(Object.assign(preset, fields), two, hooks + 0.5))).toBe(
      licks(stagedAt(preset, cast, hooks + 0.5))
    );
  });

  it('snaps the strands back into the caster and leaves nothing once it has cleared', () => {
    expect(stagedAt(preset, cast, snaps + 0.3).ribbons).toEqual([]);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});
