import { seededRandom } from '@axe/core/util/seeded-random';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { cutPictureSprites } from '@axe/domain/effect/effect-timeline';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { DISSOLVE_TAKES_OVER_S, dissolveShards, shardPoseAt } from '@axe/domain/effect/timeline/body';

const CELL = 50;
const DURATION_MS = 4493;

function crumbling(): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'dissolve';
  preset.grade = 3;
  preset.durationMs = DURATION_MS;
  preset.colorPrimary = '#e8f6ff';
  preset.colorSecondary = '#5fb8ff';
  return preset;
}

function castOf(): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: '',
    origin: null,
    targets: [{ identifier: 't0', x: 300, y: 300, z: 0 }],
    seed: 9,
  };
}

function staged(elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(crumbling(), castOf(), elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

describe('a piece crumbling', () => {
  it('takes the place of the piece with its picture whole as the piece fades, before any shard peels away', () => {
    const shards = dissolveShards(DURATION_MS / 1000, seededRandom(9));
    const whole = shards.map((shard) => shardPoseAt(shard, DISSOLVE_TAKES_OVER_S[1], CELL));

    expect(shards.map((shard) => shardPoseAt(shard, 0.1, CELL))).toEqual(shards.map(() => null));
    expect(whole.every((pose) => pose && pose.flown < 0 && pose.opacity === 1)).toBe(true);
  });

  it('peels its shards away from its head and the side the wind comes from first, and its feet last', () => {
    const shards = dissolveShards(DURATION_MS / 1000, seededRandom(9));
    const peelOf = (index: number) => shards[index].peelsAt;
    const last = shards.length - 1;

    expect(peelOf(0)).toBeLessThan(peelOf(last));
    expect(Math.max(...shards.map((shard) => shard.peelsAt))).toBeLessThan(DURATION_MS / 1000 - 1);
    const flown = shardPoseAt(shards[0], peelOf(0) + 0.5, CELL)!;
    expect(flown.x).toBeGreaterThan(shardPoseAt(shards[0], 0.5, CELL)!.x);
    expect(flown.y).toBeLessThan(shardPoseAt(shards[0], 0.5, CELL)!.y);
  });

  it('cuts its picture into shards that sit together, and carries those peeled off the way the wind blows', () => {
    const pictured = { baseSize: CELL, resolveImage: () => 'blob:token' };
    const whole = cutPictureSprites(crumbling(), castOf(), 500, pictured);
    const later = cutPictureSprites(crumbling(), castOf(), 2000, pictured);

    expect(whole.length).toBe(35);
    expect(whole.every((shard) => shard.clipPath.startsWith('polygon('))).toBe(true);
    expect(later.length).toBeLessThan(whole.length);
  });

  it('opens cracks between its shards before it lets go, each pushed out and shrunk, the more as its turn nears', () => {
    const shards = dissolveShards(DURATION_MS / 1000, seededRandom(9));
    const corner = shards[shards.length - 1];
    const at = (seconds: number) => shardPoseAt(corner, seconds, CELL)!;
    const letsGo = corner.letsGoAt;

    expect(at(0.3).scale).toBeGreaterThan(at(letsGo).scale);
    expect(at(letsGo).scale).toBeGreaterThan(at(corner.peelsAt - 0.01).scale);
    expect(at(corner.peelsAt - 0.01).scale).toBeLessThan(0.9);
    expect(at(letsGo - 0.05).x).toBeGreaterThan(at(0.3).x);
    expect(at(letsGo + 0.15).x).toBeGreaterThan(at(letsGo - 0.05).x);
  });

  it('blazes a light up behind the picture as the cracks open, and lines its seams with white', () => {
    const cracking = staged(500).motes;
    const seams = cracking.filter((mote) => mote.shape === 'flare' && mote.aside !== undefined);

    expect(seams.length).toBeGreaterThan(40);
    expect(cracking.some((mote) => mote.shape === 'glow' && mote.color === '#ffffff' && mote.size > CELL * 0.8)).toBe(
      true
    );
  });

  it('bursts as it lets go: a flash, a ring thrown out over the floor, splinters flung every way and dust kicked up', () => {
    const [shard] = dissolveShards(DURATION_MS / 1000, seededRandom(9));
    const before = staged(shard.letsGoAt * 1000 - 30);
    const burst = staged(shard.letsGoAt * 1000 + 80);
    const ringsOf = (drawn: Staged) => drawn.floor.filter((mark) => mark.shape === 'ring' && mark.blend === 'color');
    const flakesOf = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'flake').length;

    expect(ringsOf(before)).toEqual([]);
    expect(ringsOf(burst).length).toBeGreaterThan(0);
    expect(flakesOf(burst)).toBeGreaterThan(flakesOf(before) + 12);
    expect(burst.motes.filter((mote) => mote.shape === 'smoke').length).toBeGreaterThanOrEqual(6);
    expect(burst.lights.length).toBeGreaterThan(0);
  });

  it('runs a band of light up the piece from its feet before its picture takes its place', () => {
    const heightOf = (ms: number) => Math.max(...staged(ms).ribbons.map((ribbon) => ribbon.points[0].z));

    expect(heightOf(120)).toBeGreaterThan(0);
    expect(heightOf(350)).toBeGreaterThan(heightOf(120));
    expect(staged(900).ribbons).toEqual([]);
  });

  it('draws light about each shard as it peels, set off across the screen as the shard is so as to move with it', () => {
    const beside = (ms: number) => staged(ms).motes.filter((mote) => mote.aside !== undefined);

    expect(beside(1500).length).toBeGreaterThan(10);
    expect(Math.max(...beside(2400).map((mote) => mote.aside!.right))).toBeGreaterThan(CELL);
  });

  it('closes a ring of light on the floor where it stood at the last, and draws nothing once it has played', () => {
    const ringOf = (ms: number) =>
      staged(ms).floor.find((mark) => mark.shape === 'ring' && mark.blend === 'light')?.radius ?? 0;

    expect(ringOf(DURATION_MS * 0.8)).toBeGreaterThan(ringOf(DURATION_MS * 0.95));
    expect(ringOf(DURATION_MS * 0.95)).toBeGreaterThan(0);
    const after = staged(DURATION_MS + 10);
    expect(after.motes.length + after.floor.length + after.ribbons.length).toBe(0);
  });
});
