import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { greatSwordTimingOf } from '@axe/domain/effect/great-sword-looks';
import { bladePresetOf, castOnTarget, CELL } from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();
const sword = bladePresetOf('skyblade', 3000, 3);
const releases = effectBlowsOf(sword)[0].atMs / 1000;
const timing = greatSwordTimingOf(3, releases);

describe('the beats of a great sword', () => {
  it('gathers for most of the time before its blow, hangs a beat, and swings in a quarter of a second', () => {
    expect(timing.gatheredAt).toBeGreaterThan(releases * 0.6);
    expect(timing.swingsAt - timing.gatheredAt).toBeGreaterThan(0.15);
    expect(releases - timing.swingsAt).toBeGreaterThan(0.15);
    expect(releases - timing.swingsAt).toBeLessThan(0.3);
  });

  it('lets its torrent flow on after the blow and pass before the playback ends', () => {
    expect(timing.thinsAt).toBeGreaterThan(releases + 0.4);
    expect(timing.spentAt).toBeGreaterThan(timing.thinsAt);
    expect(timing.spentAt).toBeLessThan(3);
  });

  it('keeps its beats in order however short it is', () => {
    const short = greatSwordTimingOf(0.6);

    expect(short.gatheredAt).toBeGreaterThan(0);
    expect(short.gatheredAt).toBeLessThan(short.swingsAt);
    expect(short.swingsAt).toBeLessThan(short.releasesAt);
    expect(short.releasesAt).toBeLessThan(short.thinsAt);
  });
});

describe('what a great sword moves', () => {
  it('throws the piece it strikes along the torrent, away from its wielder, and holds it there', () => {
    const joltAt = (ms: number) => effectJoltsOf(sword, cast, releases * 1000 + ms, CELL).get('t0');
    const thrown = joltAt(60)!;
    const held = joltAt(500)!;

    expect(joltAt(-10)).toBeUndefined();
    expect(thrown.x).toBeLessThan(-CELL * 0.15);
    expect(thrown.z).toBe(0);
    expect(held.x).toBeLessThan(-CELL * 0.08);
    expect(held.x).toBeGreaterThan(thrown.x);
    expect(joltAt((timing.thinsAt - releases) * 1000 + 400)).toBeUndefined();
  });

  it('draws its wielder back before the swing and carries them forward as the blade comes down', () => {
    const leanAt = (seconds: number) => effectJoltsOf(sword, cast, seconds * 1000, CELL).get('caster')?.x ?? 0;

    expect(leanAt(0.5)).toBe(0);
    expect(leanAt(timing.swingsAt - 0.01)).toBeGreaterThan(CELL * 0.05);
    expect(leanAt(releases + 0.1)).toBeLessThan(-CELL * 0.1);
    expect(leanAt(timing.thinsAt + 0.5)).toBe(0);
  });

  it('throws a piece along the line it is swung on when no one wields it', () => {
    const jolt = effectJoltsOf(sword, castOnTarget(false), releases * 1000 + 60, CELL).get('t0')!;

    expect(jolt.x).toBeGreaterThan(CELL * 0.1);
    expect(jolt.y).toBeLessThan(-CELL * 0.1);
  });
});
