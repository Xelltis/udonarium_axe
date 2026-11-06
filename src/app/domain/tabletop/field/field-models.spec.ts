import { existsSync, readdirSync, readFileSync } from 'node:fs';

import {
  FIELD_MODEL_IDS,
  FIELD_MODEL_SIZES,
  FIELD_MOOD_PROP_MODELS,
  FIELD_PROP_MODELS,
  FIELD_SEASONS,
  fieldModelAt,
  fieldModelDrawnSize,
  fieldModelUrl,
} from '@axe/domain/tabletop/field/field-models';

/** The box round the meshes of a glb file as it stands, across the wider of its sides and tall, read off its accessors. */
function boxOfGlb(path: string): { across: number; tall: number } {
  const bytes = readFileSync(path);
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  const walk = (index: number, scale: number[], offset: number[]) => {
    const node = gltf.nodes[index];
    const s = node.scale ?? [1, 1, 1];
    const t = node.translation ?? [0, 0, 0];
    const here = scale.map((value, axis) => value * s[axis]);
    const moved = offset.map((value, axis) => value + t[axis] * scale[axis]);
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        for (let axis = 0; axis < 3; axis++) {
          const ends = [accessor.min[axis], accessor.max[axis]].map((value) => moved[axis] + value * here[axis]);
          low[axis] = Math.min(low[axis], ...ends);
          high[axis] = Math.max(high[axis], ...ends);
        }
      }
    }
    for (const child of node.children ?? []) walk(child, here, moved);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root, [1, 1, 1], [0, 0, 0]);
  return { across: Math.max(high[0] - low[0], high[2] - low[2]), tall: high[1] - low[1] };
}

describe('the bundled models of open country', () => {
  /** The models stood over a square of cells so many across, row by row. */
  const square = (size: number, mood?: Parameters<typeof fieldModelAt>[4]) =>
    Array.from({ length: size * size }, (_, index) =>
      fieldModelAt('tree', index % size, Math.floor(index / size), 7, mood)
    );

  it('stands the same model at the same cell of the same field, and spreads them over a wood', () => {
    expect(fieldModelAt('tree', 3, 4, 7)).toBe(fieldModelAt('tree', 3, 4, 7));
    expect(new Set(square(30)).size).toBe(FIELD_PROP_MODELS.tree!.length);
  });

  it('grows trees of a kind together, a cell more often of the kind of the one beside it than not', () => {
    const size = 30;
    const trees = square(size);
    let alike = 0;
    for (let index = 0; index < trees.length; index++) {
      if (index % size < size - 1 && trees[index] === trees[index + 1]) alike++;
    }
    expect(alike / (size * (size - 1))).toBeGreaterThan(0.5);
  });

  it('grows the trees of its mood where it has its own, and those of a wood where it has none', () => {
    expect(new Set(square(30, 'marsh'))).toEqual(new Set(FIELD_MOOD_PROP_MODELS.marsh!.tree));
    expect(new Set(square(30, 'snowfield'))).toEqual(new Set(FIELD_MOOD_PROP_MODELS.snowfield!.tree));
    expect(square(30, 'woodland')).toEqual(square(30));
    expect(fieldModelAt('bush', 4, 4, 7, 'marsh')).toBe(fieldModelAt('bush', 4, 4, 7));
  });

  it('grows trees as in summer in no season in particular, and turns them with the season chosen', () => {
    const grown = (season: (typeof FIELD_SEASONS)[number], mood?: Parameters<typeof fieldModelAt>[4]) =>
      new Set(
        Array.from({ length: 900 }, (_, index) =>
          fieldModelAt('tree', index % 30, Math.floor(index / 30), 7, mood, season)
        )
      );
    expect(grown('')).toEqual(grown('summer'));
    expect(grown('spring')).toContain('tree_cherry');
    expect([...grown('autumn')]).toEqual(expect.arrayContaining(['tree_oakAutumn', 'tree_maple', 'tree_ginkgo']));
    expect(grown('autumn')).not.toContain('tree_oak');
    expect([...grown('winter')]).toEqual(expect.arrayContaining(['tree_oakBare', 'tree_birchBare', 'tree_snowFir']));
    expect(grown('winter')).not.toContain('tree_fir');
    expect(grown('spring', 'snowfield')).toEqual(grown('', 'snowfield'));
    expect(grown('autumn', 'snowfield')).not.toContain('tree_maple');
  });

  it('stands none for a thing with no model of its own, and its own for a cactus or a heap of junk', () => {
    expect(fieldModelAt('hill', 1, 1, 1)).toBeNull();
    expect(FIELD_PROP_MODELS.junk).toContain(fieldModelAt('junk', 1, 1, 1));
    expect(FIELD_PROP_MODELS.cactus).toContain(fieldModelAt('cactus', 1, 1, 1));
  });

  it('knows how large each model is as it was made, as its file has it', () => {
    for (const id of FIELD_MODEL_IDS) {
      const box = boxOfGlb(`src/assets/models/nature/${id}.glb`);
      expect(FIELD_MODEL_SIZES[id].across, id).toBeCloseTo(box.across, 3);
      expect(FIELD_MODEL_SIZES[id].tall, id).toBeCloseTo(box.tall, 3);
    }
  });

  it('draws a model as large as it may within a box, the narrower measure of the box setting how large', () => {
    const tall = fieldModelDrawnSize('tree_oak', 5, 3.3);
    expect(tall.tall).toBeCloseTo(3.3, 6);
    expect(tall.across).toBeCloseTo((3.3 * 11.1336) / 15.1729, 6);
    const flat = fieldModelDrawnSize('rock_slab', 1, 3);
    expect(flat.across).toBeCloseTo(1, 6);
  });

  it('serves each from beside the page', () => {
    expect(fieldModelUrl('tree_fir')).toBe('assets/models/nature/tree_fir.glb');
  });

  it('has every model it names bundled, and nothing bundled it does not name', () => {
    const folder = 'src/assets/models/nature';
    expect(existsSync(folder)).toBe(true);
    expect(readdirSync(folder).sort()).toEqual(FIELD_MODEL_IDS.map((id) => `${id}.glb`).sort());
  });
});
