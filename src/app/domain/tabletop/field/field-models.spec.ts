import { existsSync, readdirSync } from 'node:fs';

import {
  FIELD_MODEL_IDS,
  FIELD_PROP_MODELS,
  fieldModelAt,
  fieldModelUrl,
} from '@axe/domain/tabletop/field/field-models';

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

  it('serves each from beside the page', () => {
    expect(fieldModelUrl('tree_oak')).toBe('assets/models/nature/tree_oak.glb');
  });

  it('has every model it names bundled, and nothing bundled it does not name', () => {
    const folder = 'src/assets/models/nature';
    expect(existsSync(folder)).toBe(true);
    expect(readdirSync(folder).sort()).toEqual(FIELD_MODEL_IDS.map((id) => `${id}.glb`).sort());
  });
});
