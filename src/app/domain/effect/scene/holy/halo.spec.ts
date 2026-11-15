import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import { castOn, CELL, holyPresetOf, liesLevel, stagedAt } from '@axe/testing/holy-effect-stage';

const TARGET = { x: 400, y: 300 };
const halo = holyPresetOf('halo', 2, { durationMs: 2560 });
const cast = castOn([TARGET]);
const bursts = effectBlowsOf(halo)[0].atMs / 1000;

/** How far from the target the level ring about it is, and how high, or null once there is none. */
function ringOf(drawn: Staged): { readonly radius: number; readonly z: number } | null {
  const ring = drawn.ribbons.find((ribbon) => ribbon.points.length === 37 && liesLevel(ribbon));
  if (!ring) return null;
  const [point] = ring.points;
  return { radius: Math.hypot(point.x - TARGET.x, point.y - TARGET.y), z: point.z };
}

/** The pieces the ring breaks into: short arcs of four points. */
function piecesOf(drawn: Staged): number[] {
  return drawn.ribbons
    .filter((ribbon) => ribbon.points.length === 4 && ribbon.blend === 'light')
    .map((ribbon) => Math.hypot(ribbon.points[1].x - TARGET.x, ribbon.points[1].y - TARGET.y));
}

describe('a halo', () => {
  it('appears wide about the middle of the target, at half its height', () => {
    const ring = ringOf(stagedAt(halo, cast, 0.1))!;

    expect(ring.radius).toBeGreaterThan(CELL * 1.5);
    expect(ring.z).toBeCloseTo(CELL * 0.5);
  });

  it('closes on the target, slowly and then fast, until it is tight about it', () => {
    const radiusAt = (share: number) => ringOf(stagedAt(halo, cast, bursts * share))!.radius;

    expect(radiusAt(0.5)).toBeLessThan(radiusAt(0.1));
    expect(radiusAt(0.1) - radiusAt(0.5)).toBeLessThan(radiusAt(0.5) - radiusAt(0.99));
    expect(radiusAt(0.99)).toBeLessThan(CELL * 0.6);
  });

  it('turns two lesser rings through it, tilted, and throws the shadow of the ring on the floor under it', () => {
    const drawn = stagedAt(halo, cast, bursts * 0.5);
    const tilted = drawn.ribbons.filter((ribbon) => ribbon.points.length === 37 && !liesLevel(ribbon));
    const shadow = drawn.floor.filter((mark) => mark.shape === 'ring' && mark.blend === 'color');

    expect(tilted.filter((ribbon) => ribbon.blend === 'light').length).toBe(2);
    expect(shadow.length).toBe(1);
    expect(shadow[0].radius).toBeCloseTo(ringOf(drawn)!.radius, 0);
  });

  it('lands no light on the floor and throws nothing out before it bursts', () => {
    const drawn = stagedAt(halo, cast, bursts - 0.05);

    expect(piecesOf(drawn)).toEqual([]);
    expect(drawn.floor.filter((mark) => mark.shape === 'scorch')).toEqual([]);
    expect(drawn.motes.filter((mote) => mote.shape === 'spark')).toEqual([]);
  });

  it('bursts as its blow lands: its pieces fly out as arcs of light, further with time, and are gone', () => {
    const near = piecesOf(stagedAt(halo, cast, bursts + 0.05));
    const far = piecesOf(stagedAt(halo, cast, bursts + 0.3));

    expect(near.length).toBe(12);
    expect(Math.min(...near)).toBeGreaterThan(CELL * 0.45);
    expect(Math.min(...far)).toBeGreaterThan(Math.max(...near) * 0.9);
    expect(far.reduce((sum, out) => sum + out, 0)).toBeGreaterThan(near.reduce((sum, out) => sum + out, 0) * 1.5);
    expect(piecesOf(stagedAt(halo, cast, bursts + 0.6))).toEqual([]);
  });

  it('sends motes of light up where it was, and leaves a stain of light on the floor', () => {
    const highest = (seconds: number) =>
      Math.max(
        0,
        ...stagedAt(halo, cast, seconds)
          .motes.filter((mote) => mote.shape === 'star')
          .map((mote) => mote.z)
      );
    const stain = stagedAt(halo, cast, bursts + 0.8).floor;

    expect(highest(bursts + 1.2)).toBeGreaterThan(highest(bursts + 0.4));
    expect(highest(bursts + 1.2)).toBeGreaterThan(CELL);
    expect(stain.some((mark) => mark.shape === 'scorch' && mark.blend === 'color')).toBe(true);
    expect(stain.some((mark) => mark.shape === 'crest')).toBe(true);
  });

  it('draws nothing once it has cleared', () => {
    const ends = (halo.duration + sceneLingerMsOf(halo)) / 1000;

    expect(stagedAt(halo, cast, ends - 0.05).floor.length).toBeGreaterThan(0);
    expect(stagedAt(halo, cast, ends + 0.001)).toEqual({ motes: [], ribbons: [], floor: [], lights: [] });
  });
});
