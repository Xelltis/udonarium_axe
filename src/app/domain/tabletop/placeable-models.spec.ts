import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { bundledModelUrl } from '@axe/domain/tabletop/bundled-model-url';
import {
  isBundledModelName,
  PLACEABLE_MODEL_GROUPS,
  PLACEABLE_MODELS,
  placeableModelIconUrl,
  placeableModelOf,
  placeableModelTopUrl,
} from '@axe/domain/tabletop/placeable-models';

describe('placeable-models', () => {
  it('names each model once, from a file bundled with the app', () => {
    const ids = PLACEABLE_MODELS.map((model) => model.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const url = bundledModelUrl(id);
      expect(url, id).not.toBeNull();
      expect(existsSync(join(process.cwd(), 'src', url!)), url!).toBe(true);
    }
  });

  it('shows each model by pictures of it from above and aside, bundled beside it', () => {
    for (const model of PLACEABLE_MODELS) {
      for (const url of [placeableModelTopUrl(model.id), placeableModelIconUrl(model.id)]) {
        expect(url, model.id).not.toBeNull();
        expect(existsSync(join(process.cwd(), 'src', url!)), url!).toBe(true);
      }
    }
    expect(placeableModelTopUrl('held-model')).toBeNull();
  });

  it('keeps every model on a shelf it offers, at a size and in proportions that are there', () => {
    for (const model of PLACEABLE_MODELS) {
      expect(PLACEABLE_MODEL_GROUPS).toContain(model.group);
      expect(model.size, model.id).toBeGreaterThan(0);
      expect(Math.min(model.made.wide, model.made.deep, model.made.tall), model.id).toBeGreaterThan(0);
    }
  });

  it('lets nothing hide what is behind it that a piece walks over', () => {
    for (const model of PLACEABLE_MODELS) {
      if (!model.blocksMove) expect(model.blocksSight, model.id).toBe(false);
    }
  });

  it('stands a tree as tall as a field grows one, and leaves the doors and the facades of a town out', () => {
    const oak = placeableModelOf('tree_oak')!;

    expect((oak.size * oak.made.tall) / Math.max(oak.made.wide, oak.made.deep)).toBeCloseTo(3.4, 1);
    expect(placeableModelOf('door_wood')).toBeNull();
    expect(placeableModelOf('town_brick')).toBeNull();
    expect(isBundledModelName('door_wood')).toBe(true);
    expect(isBundledModelName('a1b2c3')).toBe(false);
  });
});
