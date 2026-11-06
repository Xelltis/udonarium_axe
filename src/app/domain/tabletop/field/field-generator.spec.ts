import {
  FIELD_ATMOSPHERE_IDS,
  FIELD_ATMOSPHERES,
  FIELD_PROP_SHAPES,
  fieldAtmosphereById,
  MAX_FIELD_SIZE,
} from '@axe/domain/tabletop/field/field-atmosphere';
import { fieldBoardSize, planField } from '@axe/domain/tabletop/field/field-generator';
import { propAt } from '@axe/domain/tabletop/field/field-layout';
import { FIELD_MODEL_IDS, fieldModelDrawnSize, type FieldModelId } from '@axe/domain/tabletop/field/field-models';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { MAP_MAX_TERRAINS } from '@axe/domain/tabletop/map-blocks';
import { boardExtentPx } from '@axe/domain/tabletop/map-grid';

const SEEDS = [1, 7, 42, 1234, 999];

describe('fieldBoardSize()', () => {
  it('lays a board three deep for every four across', () => {
    expect(fieldBoardSize(40)).toEqual({ width: 40, height: 30 });
    expect(fieldBoardSize(60)).toEqual({ width: 60, height: 45 });
  });

  it('holds to the sizes the panel offers', () => {
    expect(fieldBoardSize(2).width).toBe(20);
    expect(fieldBoardSize(500).width).toBe(MAX_FIELD_SIZE);
  });
});

describe('planField()', () => {
  it('stands each tree, bush and rock as one block drawn as a bundled model when asked, the rest as ever', () => {
    const built = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 });
    const modelled = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7, models: true });

    expect(built.blocks.blocks.some((block) => block.model)).toBe(false);
    const dressed = modelled.blocks.blocks.filter((block) => block.model);
    expect(dressed.length).toBeGreaterThan(0);
    expect(dressed.every((block) => FIELD_MODEL_IDS.includes(block.model as FieldModelId))).toBe(true);
    const trees = modelled.layout.objects.filter((object) => object.prop === 'tree');
    expect(dressed.filter((block) => block.thing === 'tree')).toHaveLength(trees.length);
    expect(modelled.blocks.blocks.length).toBeLessThan(built.blocks.blocks.length);
    expect(modelled.blocks.blocks.filter((block) => block.thing === 'tree').every((block) => block.model)).toBe(true);
  });

  it('stands a thing drawn as a model in a block as large as the model is drawn, not over all its crown spreads to', () => {
    const modelled = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7, models: true });

    const trees = modelled.blocks.blocks.filter((block) => block.thing === 'tree');
    for (const tree of trees) {
      const drawn = fieldModelDrawnSize(tree.model as FieldModelId, Math.min(tree.rect.w, tree.rect.h), 99);
      expect(tree.footprint!.w, JSON.stringify(tree)).toBeLessThan(tree.rect.w);
      expect(tree.footprint!.w / tree.height!).toBeCloseTo(drawn.across / drawn.tall, 6);
    }
  });

  it('grows a giant tree now and then, on raised ground too, with nothing else standing in its shade', () => {
    const plans = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
      planField({ atmosphere: 'woodland', size: 60, density: 70, seed, relief: 2, models: true })
    );
    const giants = plans.flatMap((plan) =>
      plan.layout.objects.filter((object) => object.prop === 'giantTree').map((giant) => ({ giant, plan }))
    );

    expect(giants.length).toBeGreaterThan(0);
    for (const { giant, plan } of giants) {
      const reach = (giant.span - 1) / 2;
      const shaded = plan.layout.objects.filter(
        (other) => other !== giant && Math.abs(other.x - giant.x) <= reach && Math.abs(other.y - giant.y) <= reach
      );
      expect(shaded).toEqual([]);
      const others = plan.layout.objects.filter((other) => other !== giant && other.prop === 'giantTree');
      expect(others.every((other) => Math.max(Math.abs(other.x - giant.x), Math.abs(other.y - giant.y)) >= 14)).toBe(
        true
      );
    }
    const stood = plans.flatMap((plan) => plan.blocks.blocks.filter((block) => block.thing === 'giantTree'));
    expect(stood.length).toBe(giants.length);
    expect(stood.every((block) => block.model === 'tree_giant' && block.footprint!.w < block.rect.w)).toBe(true);
  });

  it('stands each bush as a model of its own, as wide as it is drawn, where models are asked for', () => {
    const built = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 });
    const modelled = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7, models: true });

    const bushes = modelled.blocks.blocks.filter((block) => block.thing === 'bush');
    expect(bushes.length).toBeGreaterThan(0);
    expect(bushes.every((bush) => bush.model && bush.rect.w === 1 && bush.footprint!.w < 1)).toBe(true);
    expect(built.blocks.blocks.filter((block) => block.thing === 'bush').some((bush) => bush.model)).toBe(false);
  });

  it('lays out the same field twice for one seed, and another for another', () => {
    const first = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 });
    const again = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 });
    const other = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 8 });

    expect([...again.layout.ground]).toEqual([...first.layout.ground]);
    expect(again.layout.props).toEqual(first.layout.props);
    expect([...other.layout.ground]).not.toEqual([...first.layout.ground]);
  });

  it('paints every cell of the board and no more', () => {
    for (const id of FIELD_ATMOSPHERE_IDS) {
      const plan = planField({ atmosphere: id, size: 30, density: 50, seed: 7 });
      const covered = new Set<number>();
      for (const patch of plan.blocks.paint) {
        for (let dy = 0; dy < patch.rect.h; dy++) {
          for (let dx = 0; dx < patch.rect.w; dx++) {
            covered.add((patch.rect.y + dy) * plan.layout.width + patch.rect.x + dx);
          }
        }
      }

      // Every cell is painted once, and a pool is painted again over the band it lies in.
      expect(covered.size).toBe(plan.layout.width * plan.layout.height);
      expect(plan.blocks.paint.every((patch) => patch.material)).toBe(true);
    }
  });

  it('grows every band of ground it was given, on a board big enough to hold them', () => {
    for (const id of FIELD_ATMOSPHERE_IDS) {
      const plan = planField({ atmosphere: id, size: 50, density: 50, seed: 7 });
      const found = new Set(plan.layout.ground);

      expect(found.size).toBe(fieldAtmosphereById(id).bands.length);
    }
  });

  it('turns every standing thing off the grid and out of square, each by its own amount', () => {
    const plan = planField({ atmosphere: 'wasteland', size: 40, density: 100, seed: 7 });
    const rocks = plan.layout.objects.filter((object) => object.prop !== 'tree');

    expect(rocks.length).toBeGreaterThan(3);
    expect(new Set(rocks.map((rock) => rock.spin)).size).toBeGreaterThan(1);
    expect(rocks.some((rock) => rock.spin !== 0)).toBe(true);
    expect(rocks.some((rock) => rock.squash !== 0)).toBe(true);
  });

  it('undercuts a rock so it leans out over its foot rather than stepping up like a stair', () => {
    const plan = planField({ atmosphere: 'wasteland', size: 40, density: 100, seed: 7 });
    const stacked = plan.blocks.blocks.filter((block) => block.rotate !== undefined && block.altitude !== undefined);

    expect(stacked.length).toBeGreaterThan(0);
    for (const prop of ['boulder', 'outcrop'] as const) {
      const layers = FIELD_PROP_SHAPES[prop].layers!;
      const widest = layers.reduce((best, layer, at) => (layer.spread > layers[best].spread ? at : best), 0);

      // A course that only ever narrows is a staircase, which is what a grid makes on its own.
      expect(layers.length).toBeGreaterThan(2);
      expect(widest).toBeGreaterThan(0);
      expect(layers[widest].spread).toBeGreaterThan(layers[0].spread);
      expect(layers[layers.length - 1].spread).toBeLessThan(layers[widest].spread);
    }
  });

  it('cuts a rock from stone rather than from a built wall', () => {
    // Coursed masonry has mortar lines running through it, and a boulder wearing one reads
    // as a ruin. The ground textures are unworked stone.
    for (const prop of ['boulder', 'outcrop'] as const) {
      expect(FIELD_PROP_SHAPES[prop].side).not.toMatch(/^wall_/);
      expect(FIELD_PROP_SHAPES[prop].top).not.toMatch(/^wall_/);
    }
  });

  it('stands what belongs on the earth on the earth, and hangs only what hangs', () => {
    const plan = planField({ atmosphere: 'meadow', size: 40, density: 100, seed: 7 });
    const grounded = plan.layout.objects.filter((object) => FIELD_PROP_SHAPES[object.prop].altitude == null);

    expect(grounded.length).toBeGreaterThan(0);
    for (const object of grounded) {
      const reach = (object.span - 1) / 2;
      const layers = plan.blocks.blocks.filter(
        (block) => block.rect.x === object.x - reach && block.rect.y === object.y - reach
      );

      expect(layers.length).toBeGreaterThan(0);
      // Its own variation in height must not carry it off the ground it is standing on.
      expect(Math.min(...layers.map((layer) => layer.altitude ?? 0))).toBe(0);
    }
  });

  it('leaves a tree square to the board, since a trunk has no reason to be turned', () => {
    expect(FIELD_PROP_SHAPES.tree.spin).toBeUndefined();
    expect(FIELD_PROP_SHAPES.boulder.spin).toBeGreaterThan(0);
  });

  it('turns a rock as one thing, and sits its layers off the middle rather than on it', () => {
    const plan = planField({ atmosphere: 'wasteland', size: 40, density: 100, seed: 7 });
    const rock = plan.layout.objects.find((object) => object.prop === 'boulder')!;
    const layers = plan.blocks.blocks.filter(
      (block) => block.rect.x === rock.x && block.rect.y === rock.y && block.altitude !== undefined
    );

    // A layer turned past the one below it makes a screw. They share the one turn.
    expect(layers.length).toBeGreaterThan(1);
    expect(new Set(layers.map((layer) => layer.rotate)).size).toBe(1);
    expect(layers.some((layer) => layer.offset!.x !== 0 || layer.offset!.y !== 0)).toBe(true);
  });

  it('sets everything that grows out of the ground on the ground', () => {
    for (const id of ['wasteland', 'meadow'] as const) {
      const plan = planField({ atmosphere: id, size: 40, density: 100, seed: 7 });
      const standing = plan.layout.objects.filter((object) => !FIELD_PROP_SHAPES[object.prop].trunk);

      expect(standing.length).toBeGreaterThan(0);
      for (const object of standing) {
        const reach = (object.span - 1) / 2;
        const mine = plan.blocks.blocks.filter(
          (block) => block.rect.x === object.x - reach && block.rect.y === object.y - reach
        );

        // A rock that starts above the ground is a rock hovering over it.
        expect(Math.min(...mine.map((block) => block.altitude ?? 0))).toBe(0);
      }
    }
  });

  it('pours a poisoned pool into a marsh now and then, with something in the air over it', () => {
    const found = [1, 7, 42, 1234, 999].map((seed) => planField({ atmosphere: 'marsh', size: 40, density: 50, seed }));
    const withPools = found.filter((plan) => plan.layout.pools.length > 0);

    // Now and then, not on every board and not a dozen to a board.
    expect(withPools.length).toBeGreaterThan(0);
    expect(withPools.length).toBeLessThan(found.length);
    for (const plan of withPools) {
      for (const pool of plan.blocks.ambiences) {
        expect(pool.kind).toBe('miasma');
        expect(pool.density).toBeGreaterThan(0);
        // The bed of it is painted, so the ground reads as water rather than as marsh.
        expect(plan.blocks.paint.some((patch) => patch.rect.x === pool.rect.x && patch.kind === 'hazard')).toBe(true);
      }
    }
  });

  it('grows cacti in the wasteland, with arms out on their flanks', () => {
    const plan = planField({ atmosphere: 'wasteland', size: 40, density: 50, seed: 7 });
    const cacti = plan.layout.objects.filter((object) => object.prop === 'cactus');
    const arms = plan.blocks.blocks.filter((block) => block.offset && block.offset.x !== 0);

    expect(cacti.length).toBeGreaterThan(0);
    // What tells a cactus from a post is the pair of stubs on its flanks.
    expect(FIELD_PROP_SHAPES.cactus.arms!.length).toBe(2);
    expect(arms.length).toBeGreaterThanOrEqual(cacti.length);
  });

  it('leaves nothing standing in the middle of a pool', () => {
    const plan = planField({ atmosphere: 'marsh', size: 40, density: 100, seed: 42 });

    for (const pool of plan.layout.pools) {
      for (const object of plan.layout.objects) {
        const insideX = pool.x <= object.x && object.x < pool.x + pool.w;
        const insideY = pool.y <= object.y && object.y < pool.y + pool.h;
        expect(insideX && insideY).toBe(false);
      }
    }
  });

  it('leaves open water bare', () => {
    const plan = planField({ atmosphere: 'coast', size: 50, density: 100, seed: 7 });
    const atmosphere = fieldAtmosphereById('coast');

    for (let y = 0; y < plan.layout.height; y++) {
      for (let x = 0; x < plan.layout.width; x++) {
        const band = atmosphere.bands[plan.layout.ground[y * plan.layout.width + x]];
        if (band.bare) expect(propAt(plan.layout, x, y)).toBe('');
      }
    }
  });

  it('puts nothing over the edge of the board', () => {
    for (const id of FIELD_ATMOSPHERE_IDS) {
      const plan = planField({ atmosphere: id, size: 40, density: 100, seed: 42 });

      for (const block of plan.blocks.blocks) {
        expect(block.rect.x + block.rect.w).toBeLessThanOrEqual(plan.layout.width);
        expect(block.rect.y + block.rect.h).toBeLessThanOrEqual(plan.layout.height);
      }
    }
  });

  it('leaves open country open enough to walk over', () => {
    for (const id of FIELD_ATMOSPHERE_IDS.filter((each) => !FIELD_ATMOSPHERES[each].town)) {
      for (const seed of SEEDS) {
        const plan = planField({ atmosphere: id, size: 40, density: 100, seed });
        const taken = plan.layout.props.filter((prop) => prop !== '').length;

        expect(taken / plan.layout.props.length).toBeLessThan(0.5);
      }
    }
  });

  it('builds each thing that stands out of its own stuff', () => {
    const plan = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 });
    const shapes = Object.values(FIELD_PROP_SHAPES);
    const pairs = [
      ...shapes.map((shape) => `${shape.side}/${shape.top}`),
      ...shapes.filter((shape) => shape.trunk).map((shape) => `${shape.trunk!.side}/${shape.trunk!.top}`),
    ];

    expect(plan.blocks.blocks.length).toBeGreaterThan(0);
    for (const block of plan.blocks.blocks) {
      expect(block.kind).toBe('prop');
      const side = block.skin?.side;
      const top = block.skin?.top;
      const named = side?.kind === 'texture' && top?.kind === 'texture';
      expect(named && pairs.includes(`${side.id}/${top.id}`)).toBe(true);
      expect(block.height).toBeGreaterThan(0);
    }
  });

  it('grows a crown several cells across over a trunk a third of one wide', () => {
    const canopy = FIELD_PROP_SHAPES.tree;

    // Minecraft's are a trunk of one block under a crown five to seven across, and the width
    // between the two is the whole silhouette. Fewer, wider trees also cost less than many.
    expect(canopy.span).toBeGreaterThanOrEqual(5);
    expect(canopy.trunk!.width).toBeLessThan(0.5);
    expect(canopy.layers!.length).toBeGreaterThan(1);
  });

  it('stands a tree on a post and hangs its crown clear of the ground', () => {
    const plan = planField({ atmosphere: 'woodland', size: 40, density: 100, seed: 7 });
    const canopy = FIELD_PROP_SHAPES.tree;
    const trees = plan.layout.objects.filter((object) => object.prop === 'tree');
    const posts = plan.blocks.blocks.filter((block) => block.footprint?.w === canopy.trunk!.width);
    const crowns = plan.blocks.blocks.filter(
      (block) => block.thing === 'tree' && block.altitude !== undefined && block.rect.w === canopy.span
    );

    expect(trees.length).toBeGreaterThan(0);
    expect(posts.length).toBe(trees.length);
    expect(crowns.length).toBeGreaterThan(0);
    for (const crown of crowns) {
      // What walks under a wood has to fit under it, so the crown starts above head height.
      expect(crown.altitude!).toBeGreaterThanOrEqual(canopy.altitude!);
      expect(crown.rect.w % 2).toBe(1);
    }

    // A crown that narrows as it rises is what tells a tree from a table on a leg.
    const layers = crowns.filter((crown) => crown.rect.w === canopy.span).slice(0, canopy.layers!.length);
    expect(layers.length).toBe(canopy.layers!.length);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].footprint!.w).toBeLessThan(layers[i - 1].footprint!.w);
      expect(layers[i].altitude!).toBeGreaterThan(layers[i - 1].altitude!);
    }
    for (const post of posts) {
      expect(post.footprint!.w).toBeLessThan(0.5);
      expect(post.rect.w).toBe(1);
      // The post has to reach into the crown it holds up, or the crown hangs in the air.
      expect(post.height!).toBeGreaterThan(canopy.altitude!);
    }
  });

  it('stands its fires apart, out in the open', () => {
    for (const id of FIELD_ATMOSPHERE_IDS) {
      const plan = planField({ atmosphere: id, size: 40, density: 50, seed: 7 });
      const atmosphere = fieldAtmosphereById(id);

      expect(plan.blocks.lights.length).toBeGreaterThan(0);
      expect(plan.blocks.lights.length).toBeLessThanOrEqual(atmosphere.torches);
      for (const light of plan.blocks.lights) {
        expect(propAt(plan.layout, light.x, light.y)).toBe('');
        expect(atmosphere.bands[plan.layout.ground[light.y * plan.layout.width + light.x]].bare).toBeFalsy();
      }
    }
  });

  it('thins out when the panel asks for less, and thickens when it asks for more', () => {
    const bare = planField({ atmosphere: 'woodland', size: 40, density: 0, seed: 7 });
    const some = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 });
    const many = planField({ atmosphere: 'woodland', size: 40, density: 100, seed: 7 });

    expect(bare.blocks.blocks.length).toBe(0);
    expect(some.blocks.blocks.length).toBeGreaterThan(0);
    expect(many.blocks.blocks.length).toBeGreaterThan(some.blocks.blocks.length);
  });

  it('stays inside the budget at the size and thickness it starts on', () => {
    for (const id of FIELD_ATMOSPHERE_IDS) {
      for (const seed of SEEDS) {
        const plan = planField({ atmosphere: id, size: 40, density: 50, seed });

        expect(plan.blocks.blocks.length).toBeLessThanOrEqual(MAP_MAX_TERRAINS);
      }
    }
  });
});

describe('the ground of a field raised as high as asked', () => {
  it('raises nothing where no height is asked for', () => {
    expect(planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 }).layout.relief ?? null).toBeNull();
    expect(
      planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7, relief: 0 }).layout.relief ?? null
    ).toBeNull();
  });

  it('raises the highest ground to the height asked, leaves the lowest on the board, and covers it all', () => {
    const relief = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7, relief: 3 }).layout.relief!;

    expect(relief.columns).toBe(40 * 2 + 1);
    expect(relief.rows).toBe(30 * 2 + 1);
    expect(Math.max(...relief.heights)).toBe(3);
    expect(Math.min(...relief.heights)).toBe(0);
  });

  it('keeps the same ground and the same things standing on it, whatever height it is raised to', () => {
    const flat = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7 });
    const raised = planField({ atmosphere: 'woodland', size: 40, density: 50, seed: 7, relief: 4 });

    expect(raised.layout.ground).toEqual(flat.layout.ground);
    expect(raised.layout.props).toEqual(flat.layout.props);
    expect(raised.blocks).toEqual(flat.blocks);
  });

  it('builds no hills of steps of blocks where the ground itself is raised, as it does on flat ground', () => {
    const flat = planField({ atmosphere: 'meadow', size: 40, density: 50, seed: 7 });
    const raised = planField({ atmosphere: 'meadow', size: 40, density: 50, seed: 7, relief: 2 });

    expect(flat.layout.objects.some((object) => object.prop === 'hill')).toBe(true);
    expect(raised.layout.objects.some((object) => object.prop === 'hill')).toBe(false);
    expect(raised.layout.relief).not.toBeNull();
  });

  it('leaves open water level, at the board', () => {
    const plan = planField({ atmosphere: 'coast', size: 40, density: 50, seed: 7, relief: 3 });
    const relief = plan.layout.relief!;
    const water = plan.atmosphere.bands.map((band) => band.bare === true);

    let wet = 0;
    for (let y = 0; y < plan.layout.height; y++) {
      for (let x = 0; x < plan.layout.width; x++) {
        if (!water[plan.layout.ground[y * plan.layout.width + x]]) continue;
        wet++;
        expect(relief.heights[(y * 2 + 1) * relief.columns + x * 2 + 1]).toBe(0);
      }
    }
    expect(wet).toBeGreaterThan(0);
    expect(Math.max(...relief.heights)).toBe(3);
  });

  it('holds the height asked for between none and six cells, in half cells', () => {
    const asked = (relief: number) =>
      Math.max(
        ...(planField({ atmosphere: 'meadow', size: 20, density: 50, seed: 1, relief }).layout.relief?.heights ?? [0])
      );

    expect(asked(1.3)).toBe(1.5);
    expect(asked(20)).toBe(6);
    expect(asked(-2)).toBe(0);
    expect(asked(Number.NaN)).toBe(0);
  });

  it('raises the ground under the whole of a hex board, as high as asked', () => {
    const plan = planField({
      atmosphere: 'woodland',
      size: 40,
      density: 50,
      seed: 7,
      relief: 3,
      gridType: GridType.HEX_VERTICAL,
    });
    const relief = plan.layout.relief!;
    const extent = boardExtentPx(plan.layout, { type: GridType.HEX_VERTICAL, sizePx: 1 });

    expect(relief.columns).toBeGreaterThanOrEqual(extent.widthPx * 2);
    expect(relief.rows).toBeGreaterThanOrEqual(extent.heightPx * 2);
    expect(Math.max(...relief.heights)).toBeGreaterThan(2.5);
    expect(Math.min(...relief.heights)).toBeLessThan(0.5);
  });
});
