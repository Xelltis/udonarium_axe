import { existsSync, readdirSync } from 'node:fs';

import {
  doorModelTurn,
  FURNISHING_MODEL_IDS,
  FURNISHING_MODELS,
  furnishingModelUrl,
  isFurnishingModel,
} from '@axe/domain/tabletop/dungeon/furnishing-models';

describe('the bundled models of the furniture of a dungeon', () => {
  it('has every model it names bundled, and nothing bundled it does not name', () => {
    const folder = 'src/assets/models/props';
    expect(existsSync(folder)).toBe(true);
    expect(readdirSync(folder).sort()).toEqual(FURNISHING_MODEL_IDS.map((id) => `${id}.glb`).sort());
  });

  it('stands each piece only as a model it has', () => {
    for (const model of Object.values(FURNISHING_MODELS)) expect(FURNISHING_MODEL_IDS).toContain(model);
  });

  it('turns a door’s model along its leaf, its hinge at the end the door turns on', () => {
    expect([doorModelTurn('y', false), doorModelTurn('y', true)]).toEqual([0, 180]);
    expect([doorModelTurn('x', false), doorModelTurn('x', true)]).toEqual([90, 270]);
  });

  it('tells its own models from those of open country, and serves them from beside the page', () => {
    expect(isFurnishingModel('prop_crate')).toBe(true);
    expect(isFurnishingModel('tree_oak')).toBe(false);
    expect(furnishingModelUrl('prop_crate')).toBe('assets/models/props/prop_crate.glb');
  });
});
