import {
  dabRelief,
  groundChangeOf,
  IMPORTED_RELIEF_LAYER_NAME,
  reliefChunksOf,
  reliefLayerOf,
  sceneReliefChunks,
  sceneSpeaksForRelief,
} from '@axe/domain/map-editor/relief';
import { createLayer, createScene, MapScene, ReliefLayer, rememberPaintedRoles } from '@axe/domain/map-editor/scene';
import { deserializeScene, serializeScene } from '@axe/domain/map-editor/serialize';
import { planFunctionPaint, sceneSpeaksFor } from '@axe/domain/map-editor/table-apply';
import { sceneFromTable } from '@axe/domain/map-editor/table-import';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  encodeGroundHeights,
  encodeGroundPaint,
  GROUND_CHUNK_SAMPLE_COUNT,
  GROUND_CHUNK_SAMPLES,
  GroundChunkData,
} from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';

function snapshot(over: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    cols: 20,
    rows: 20,
    cellPx: 50,
    gridType: GridType.SQUARE,
    floorImageIdentifier: '',
    blockedCells: [],
    terrainBlocks: [],
    maskBlocks: [],
    moveCostBlocks: [],
    ambienceBlocks: [],
    triggerBlocks: [],
    ...over,
  };
}

/** A chunk raised a number of steps at one sample, and painted where asked. */
function chunk(cx: number, cy: number, steps: number, paint: Uint8Array | null = null): GroundChunkData {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  heights[3 * GROUND_CHUNK_SAMPLES + 3] = steps;
  return { cx, cy, heights, paint };
}

/** Paint laying one kind of ground in full on every sample of a chunk, the kinds counted from grass. */
function paintOf(kind: number): Uint8Array {
  const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * 4);
  for (let sample = 0; sample < GROUND_CHUNK_SAMPLE_COUNT; sample++) paint[sample * 4 + kind] = 15;
  return paint;
}

/** The shares of paint a chunk lays on its sample a number of half cells across and down. */
function sharesAt(chunk: GroundChunkData | undefined, i: number, j: number): number[] | null {
  const at = (j * GROUND_CHUNK_SAMPLES + i) * 4;
  return chunk?.paint ? [...chunk.paint.subarray(at, at + 4)] : null;
}

function reliefLayer(): ReliefLayer {
  return createLayer('relief', 'relief') as ReliefLayer;
}

function sceneWith(...layers: MapScene['layers']): MapScene {
  const scene = createScene(20, 20, 50);
  scene.layers.push(...layers);
  return scene;
}

describe('the relief layer of the map editor', () => {
  it('raises its own ground under a dab of the brush, and keeps no chunk it leaves flat', () => {
    const layer = reliefLayer();

    dabRelief(layer, { kind: 'raise', x: 4, y: 4, radius: 2, strength: 1 });

    expect(Object.keys(layer.chunks)).toEqual(['0,0']);
    expect(groundSurfaceOf(reliefChunksOf(layer)).heightAt(4, 4)).toBe(1);

    dabRelief(layer, { kind: 'lower', x: 4, y: 4, radius: 2, strength: 1 });

    expect(layer.chunks).toEqual({});
  });

  it('adds the relief layers of a scene up, hidden ones as well', () => {
    const hill = reliefLayer();
    const more = reliefLayer();
    more.visible = false;
    hill.chunks['0,0'] = encodeGroundHeights(chunk(0, 0, 64).heights);
    more.chunks['0,0'] = encodeGroundHeights(chunk(0, 0, 32).heights);
    more.chunks['1,0'] = encodeGroundHeights(chunk(1, 0, 16).heights);

    const summed = sceneReliefChunks(sceneWith(hill, more));

    expect(summed.map((one) => [one.cx, one.cy, one.heights[3 * GROUND_CHUNK_SAMPLES + 3]])).toEqual([
      [0, 0, 96],
      [1, 0, 16],
    ]);
  });

  it('writes only the chunks whose heights change, keeps the paint the table wears, and flattens what it no longer raises', () => {
    const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * 4).fill(7);
    const kept = [chunk(0, 0, 64, paint), chunk(1, 0, 64), chunk(2, 0, 64, paint)];
    const wanted = [chunk(0, 0, 128), chunk(1, 0, 64)];

    const written = groundChangeOf(wanted, kept);

    expect(written.map((one) => [one.cx, one.heights[3 * GROUND_CHUNK_SAMPLES + 3], one.paint === paint])).toEqual([
      [0, 128, true],
      [2, 0, true],
    ]);
  });

  it('is brought in from a table that raises its ground, and not from one that keeps it flat', () => {
    const raised = sceneFromTable(snapshot({ groundChunks: [chunk(0, 0, 64)] }));
    const flat = sceneFromTable(snapshot({ groundChunks: [] }));

    const layer = raised.layers.find((one) => one.kind === 'relief') as ReliefLayer;
    expect(layer.name).toBe(IMPORTED_RELIEF_LAYER_NAME);
    expect(reliefChunksOf(layer)[0].heights[3 * GROUND_CHUNK_SAMPLES + 3]).toBe(64);
    expect(flat.layers.some((one) => one.kind === 'relief')).toBe(false);
    expect(reliefLayerOf('id', [chunk(0, 0, 0)])).toBeNull();
  });

  it('lays the ground it holds on the table, and goes back unchanged once brought in again', () => {
    const table = snapshot({ groundChunks: [chunk(0, 0, 64)] });
    const scene = sceneFromTable(table);

    expect(planFunctionPaint(scene, table)!.ground).toEqual([]);

    const layer = scene.layers.find((one) => one.kind === 'relief') as ReliefLayer;
    dabRelief(layer, { kind: 'raise', x: 12, y: 2, radius: 1, strength: 1 });

    const ground = planFunctionPaint(scene, table)!.ground!;
    expect(ground.map((one) => [one.cx, one.cy])).toEqual([[0, 0]]);
    expect(groundSurfaceOf(ground).heightAt(12, 2)).toBe(1);
  });

  it('says nothing of the ground where the scene never held relief, and flattens it once the layer is taken away', () => {
    const table = snapshot({ groundChunks: [chunk(0, 0, 64)] });
    const drawn = sceneWith();

    expect(sceneSpeaksFor(drawn)).toBe(false);
    expect(planFunctionPaint(drawn, table)!.ground).toEqual([]);

    const scene = sceneFromTable(table);
    rememberPaintedRoles(scene);
    scene.layers = scene.layers.filter((one) => one.kind !== 'relief');

    expect(sceneSpeaksForRelief(scene)).toBe(true);
    expect(sceneSpeaksFor(scene)).toBe(true);
    expect(planFunctionPaint(scene, table)!.ground!.map((one) => one.heights.some((height) => height !== 0))).toEqual([
      false,
    ]);
  });

  it('is saved and read back with its chunks, and leaves out a chunk that does not read', () => {
    const layer = reliefLayer();
    dabRelief(layer, { kind: 'raise', x: 4, y: 4, radius: 2, strength: 1 });
    layer.chunks['bad'] = layer.chunks['0,0'];
    layer.chunks['1,0'] = 'not heights';
    const scene = sceneWith(layer);
    scene.paintedRelief = true;

    const read = deserializeScene(serializeScene(scene))!;

    const back = read.layers[0] as ReliefLayer;
    expect(back.kind).toBe('relief');
    expect(Object.keys(back.chunks)).toEqual(['0,0']);
    expect(back.chunks['0,0']).toBe(layer.chunks['0,0']);
    expect(read.paintedRelief).toBe(true);
  });

  it('paints its own ground under a dab of the brush, standing a chunk it only paints flat, and keeps a chunk it erases', () => {
    const layer = reliefLayer();

    dabRelief(layer, { kind: 'paint', x: 4, y: 4, radius: 2, strength: 1, layer: 'rock' });

    expect(layer.chunks).toEqual({});
    expect(Object.keys(layer.paint!)).toEqual(['0,0']);
    const [painted] = reliefChunksOf(layer);
    expect(painted.heights.every((height) => height === 0)).toBe(true);
    expect(sharesAt(painted, 8, 8)).toEqual([0, 0, 15, 0]);

    dabRelief(layer, { kind: 'erase', x: 4, y: 4, radius: 2, strength: 1, layer: 'rock' });

    expect(Object.keys(layer.paint!)).toEqual(['0,0']);
    expect(sharesAt(reliefChunksOf(layer)[0], 8, 8)).toEqual([0, 0, 0, 0]);
  });

  it('lays the paint of a later layer over an earlier one where it paints, and keeps the earlier one elsewhere', () => {
    const under = reliefLayer();
    const over = reliefLayer();
    under.paint = { '0,0': encodeGroundPaint(paintOf(0)) };
    dabRelief(over, { kind: 'paint', x: 4, y: 4, radius: 1, strength: 1, layer: 'sand' });

    const [laid] = sceneReliefChunks(sceneWith(under, over));

    expect(sharesAt(laid, 8, 8)).toEqual([0, 0, 0, 15]);
    expect(sharesAt(laid, 20, 20)).toEqual([15, 0, 0, 0]);
  });

  it('writes the paint of a chunk the scene paints or erases, and leaves the table its own paint where the scene paints nothing', () => {
    const table = snapshot({ groundChunks: [chunk(0, 0, 0, paintOf(0)), chunk(1, 0, 0, paintOf(1))] });
    const layer = reliefLayer();
    dabRelief(layer, { kind: 'erase', x: 4, y: 4, radius: 1, strength: 1, layer: 'grass' });
    dabRelief(layer, { kind: 'paint', x: 40, y: 4, radius: 1, strength: 1, layer: 'rock' });

    const ground = planFunctionPaint(sceneWith(layer), table)!.ground!;

    expect(ground.map((one) => [one.cx, one.cy])).toEqual([
      [0, 0],
      [2, 0],
    ]);
    expect(sharesAt(ground[0], 8, 8)).toEqual([0, 0, 0, 0]);
    expect(sharesAt(ground[1], 16, 8)).toEqual([0, 0, 15, 0]);
  });

  it('is brought in from a table that paints its ground though it raises it nowhere, and goes back unchanged', () => {
    const table = snapshot({ groundChunks: [chunk(0, 0, 0, paintOf(2)), chunk(1, 0, 0, new Uint8Array(4096))] });

    const scene = sceneFromTable(table);

    const layer = scene.layers.find((one) => one.kind === 'relief') as ReliefLayer;
    expect(Object.keys(layer.chunks)).toEqual([]);
    expect(Object.keys(layer.paint!)).toEqual(['0,0']);
    expect(sharesAt(reliefChunksOf(layer)[0], 3, 3)).toEqual([0, 0, 15, 0]);
    expect(planFunctionPaint(scene, table)!.ground).toEqual([]);
  });

  it('reads a layer saved before it kept paint as painting nothing, and paint that does not read as none', () => {
    const layer = reliefLayer();
    dabRelief(layer, { kind: 'raise', x: 4, y: 4, radius: 2, strength: 1 });
    const saved = JSON.parse(serializeScene(sceneWith(layer)));
    delete saved.layers[0].paint;
    const painted = reliefLayer();
    painted.paint = { '0,0': '', '1,0': 'not paint', '2,0': encodeGroundPaint(paintOf(3)) };

    const old = deserializeScene(JSON.stringify(saved))!.layers[0] as ReliefLayer;
    const read = deserializeScene(serializeScene(sceneWith(painted)))!.layers[0] as ReliefLayer;

    expect(reliefChunksOf(old).map((one) => one.paint)).toEqual([null]);
    expect(Object.keys(read.paint!)).toEqual(['2,0']);
    expect(reliefChunksOf(read).map((one) => [one.cx, sharesAt(one, 0, 0)])).toEqual([[2, [0, 0, 0, 15]]]);
  });
});
