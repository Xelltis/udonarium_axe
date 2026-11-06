import { existsSync, readdirSync, readFileSync } from 'node:fs';

import {
  FIELD_MODEL_IDS,
  FIELD_MODEL_SIZES,
  FIELD_PROP_MODELS,
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
  it('stands the same model at the same cell of the same field, and spreads them over a wood', () => {
    expect(fieldModelAt('tree', 3, 4, 7)).toBe(fieldModelAt('tree', 3, 4, 7));
    const chosen = new Set(Array.from({ length: 40 }, (_, x) => fieldModelAt('tree', x, 2, 7)));
    expect(chosen.size).toBe(FIELD_PROP_MODELS.tree!.length);
  });

  it('stands none for a thing with no model of its own', () => {
    expect(fieldModelAt('hill', 1, 1, 1)).toBeNull();
    expect(fieldModelAt('junk', 1, 1, 1)).toBeNull();
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
    expect(tall.across).toBeCloseTo((3.3 * 0.7396) / 1.2262, 6);
    const flat = fieldModelDrawnSize('rock_largeA', 1, 3);
    expect(flat.across).toBeCloseTo(1, 6);
  });

  it('serves each from beside the page', () => {
    expect(fieldModelUrl('tree_oak')).toBe('assets/models/nature/tree_oak.glb');
  });

  it('has every model it names bundled, and nothing bundled it does not name', () => {
    const folder = 'src/assets/models/nature';
    expect(existsSync(folder)).toBe(true);
    expect(readdirSync(folder).sort()).toEqual(FIELD_MODEL_IDS.map((id) => `${id}.glb`).sort());
  });
});
