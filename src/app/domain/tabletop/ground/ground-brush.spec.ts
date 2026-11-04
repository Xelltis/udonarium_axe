import { applyGroundDab } from '@axe/domain/tabletop/ground/ground-brush';
import {
  GROUND_CHUNK_SAMPLE_COUNT,
  GROUND_CHUNK_SAMPLES,
  GroundChunkData,
} from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';

function flat(cx: number, cy: number): GroundChunkData {
  return { cx, cy, heights: new Int16Array(GROUND_CHUNK_SAMPLE_COUNT), paint: null };
}

describe('a dab of the brush on the ground', () => {
  it('raises the ground under its middle by its strength, easing to nothing at its edge', () => {
    const [chunk] = applyGroundDab([], { kind: 'raise', x: 4, y: 4, radius: 2, strength: 1 });
    const ground = groundSurfaceOf([chunk]);

    expect(chunk).toMatchObject({ cx: 0, cy: 0, paint: null });
    expect(ground.heightAt(4, 4)).toBe(1);
    expect(ground.heightAt(5, 4)).toBeCloseTo(0.5, 1);
    expect(ground.heightAt(6, 4)).toBe(0);
  });

  it('sinks the ground below the board when lowering, and leaves the chunks it was given as they were', () => {
    const kept = flat(0, 0);
    const [chunk] = applyGroundDab([kept], { kind: 'lower', x: 4, y: 4, radius: 1, strength: 2 });

    expect(groundSurfaceOf([chunk]).heightAt(4, 4)).toBe(-2);
    expect(kept.heights.every((height) => height === 0)).toBe(true);
  });

  it('works on every chunk it reaches, and on those alone', () => {
    const edge = GROUND_CHUNK_SAMPLES / 2;
    const changed = applyGroundDab([], { kind: 'raise', x: edge, y: 4, radius: 1, strength: 1 });

    expect(changed.map((chunk) => `${chunk.cx},${chunk.cy}`).sort()).toEqual(['0,0', '1,0']);
  });

  it('takes the ground the share of the way to the level asked for when flattening', () => {
    const [hill] = applyGroundDab([], { kind: 'raise', x: 4, y: 4, radius: 2, strength: 2 });
    const [flattened] = applyGroundDab([hill], { kind: 'flatten', x: 4, y: 4, radius: 2, strength: 0.5, level: 1 });

    expect(groundSurfaceOf([flattened]).heightAt(4, 4)).toBe(1.5);
  });

  it('brings a spike down towards the ground round it when smoothing', () => {
    const [spike] = applyGroundDab([], { kind: 'raise', x: 4, y: 4, radius: 0.5, strength: 3 });
    const [smoothed] = applyGroundDab([spike], { kind: 'smooth', x: 4, y: 4, radius: 1, strength: 1 });

    const before = groundSurfaceOf([spike]).heightAt(4, 4);
    const after = groundSurfaceOf([smoothed]).heightAt(4, 4);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it('takes the paint off the samples under it when erasing, every kind alike, leaving the heights alone', () => {
    const [painted] = applyGroundDab([], { kind: 'paint', x: 4, y: 4, radius: 1, strength: 1, layer: 'sand' });
    const raised = { ...painted, heights: painted.heights.map(() => 64) };

    const [erased] = applyGroundDab([raised], { kind: 'erase', x: 4, y: 4, radius: 1, strength: 1 });

    const middle = 8 * GROUND_CHUNK_SAMPLES + 8;
    expect([...erased.paint!.subarray(middle * 4, middle * 4 + 4)]).toEqual([0, 0, 0, 0]);
    expect(erased.heights.every((height) => height === 64)).toBe(true);
    expect(groundSurfaceOf([erased]).paintAt(8, 8)).toBeNull();
  });

  it('lays a kind of ground on the samples under it when painting, leaving the heights alone', () => {
    const [painted] = applyGroundDab([], { kind: 'paint', x: 4, y: 4, radius: 1, strength: 1, layer: 'rock' });
    const middle = 8 * GROUND_CHUNK_SAMPLES + 8;

    expect([...painted.paint!.subarray(middle * 4, middle * 4 + 4)]).toEqual([0, 0, 15, 0]);
    expect(painted.heights.every((height) => height === 0)).toBe(true);
  });

  it('leaves the samples off the board alone', () => {
    const changed = applyGroundDab([], { kind: 'raise', x: 0, y: 0, radius: 1, strength: 1 });

    expect(changed.map((chunk) => `${chunk.cx},${chunk.cy}`)).toEqual(['0,0']);
    expect(groundSurfaceOf(changed).heightAt(0, 0)).toBe(1);
  });
});
