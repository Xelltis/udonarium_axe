import { seededRandom } from '@axe/core/util/seeded-random';
import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import {
  FIELD_PROP_IDS,
  FIELD_PROP_SHAPES,
  FieldAtmosphere,
  FieldPropId,
  TownPlan,
} from '@axe/domain/tabletop/field/field-atmosphere';
import { FieldLayout } from '@axe/domain/tabletop/field/field-layout';
import {
  FIELD_PROP_MODELS,
  fieldModelAt,
  fieldModelDrawnSize,
  type FieldModelId,
  type FieldSeason,
} from '@axe/domain/tabletop/field/field-models';
import { settlementBlocks } from '@axe/domain/tabletop/field/settlement-blocks';
import { FieldBuilding } from '@axe/domain/tabletop/field/town-layout';
import { roofUnitModelOf, TOWN_KITS } from '@axe/domain/tabletop/field/town-models';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import {
  MapAmbience,
  MapBlock,
  MapBlocks,
  MapLight,
  MapLightKind,
  MapPaint,
  MapRect,
} from '@axe/domain/tabletop/map-blocks';

/**
 * How wide a clump of the same thing is allowed to grow before it is broken in two.
 *
 * A wood merged without limit becomes one canopy the size of the board, which reads as a
 * plateau rather than trees. Three cells is a stand of trees.
 */
export const FIELD_MERGE_SPAN = 4;

const OPEN_FIRES: readonly MapLightKind[] = ['campfire', 'stand', 'brazier'];

/** What a town is built of, besides what grows in it: the buildings and what stands on their roofs. */
export const TOWN_PIECE_IDS = ['building', 'roofUnit'] as const;

/**
 * A tank or a plant room on a roof, which is most of what tells a roof from a car park seen
 * from above. Dressed in steel off the ground shelf, so a building material chosen for the
 * town leaves it alone.
 */
const ROOF_PLANT = { side: 'metal_grate', top: 'metal_grate', height: 0.5, fill: 0.7 } as const;

/**
 * A standing thing drawn as a bundled 3D model: one block as wide and as tall as the model is drawn
 * standing as large as it may within the cells the thing spreads over and the height it reaches from
 * the ground to its crown, in the middle of those cells. It stops sight, takes a piece put on it and
 * stands in the way where the model does, rather than over all the ground its crown would cover; the
 * model is drawn in place of it.
 */
function modelledThing(
  object: {
    readonly x: number;
    readonly y: number;
    readonly span: number;
    readonly lift: number;
    readonly spin: number;
    readonly prop: FieldPropId;
  },
  shape: (typeof FIELD_PROP_SHAPES)[FieldPropId],
  skin: { side: string; top: string },
  rect: { x: number; y: number; w: number; h: number },
  model: FieldModelId
): MapBlock {
  const layers = shape.layers ?? [{ spread: object.span, height: shape.height }];
  const crown = (shape.altitude ?? 0) + object.lift + layers.reduce((total, layer) => total + layer.height, 0);
  const height = Math.max(crown, shape.trunk ? shape.trunk.height + object.lift : 0, shape.height);
  const drawn = fieldModelDrawnSize(model, Math.min(rect.w, rect.h), height);
  return {
    kind: 'prop',
    rect,
    blocksSight: shape.blocksSight,
    locked: false,
    rooms: [],
    skin: { side: { kind: 'texture', id: skin.side }, top: { kind: 'texture', id: skin.top } },
    height: drawn.tall,
    footprint: { w: drawn.across, d: drawn.across },
    rotate: object.spin,
    thing: object.prop,
    model,
  };
}

function maskOfBand(layout: FieldLayout, band: number): Uint8Array {
  const mask = new Uint8Array(layout.width * layout.height);
  for (let i = 0; i < mask.length; i++) mask[i] = layout.ground[i] === band ? 1 : 0;
  return mask;
}

function maskOfProp(layout: FieldLayout, prop: FieldPropId): Uint8Array {
  const mask = new Uint8Array(layout.width * layout.height);
  for (let i = 0; i < mask.length; i++) mask[i] = layout.props[i] === prop ? 1 : 0;
  return mask;
}

/**
 * Somewhere out in the open, well away from anything already lit.
 *
 * A place that says what it is lit by and where - street lamps on the pavement, drums in the
 * lanes - gets those; anywhere else gets fires wherever there is open ground.
 */
function findFires(layout: FieldLayout, atmosphere: FieldAtmosphere, seed: number): MapLight[] {
  const lights: MapLight[] = [];
  if (atmosphere.torches < 1) return lights;
  const kinds = atmosphere.fires?.kinds ?? OPEN_FIRES;
  const bands = atmosphere.fires?.bands;
  const rng = seededRandom(seed + 3301);
  const apart = Math.max(6, Math.round(Math.min(layout.width, layout.height) / 3));

  for (let tries = 0; tries < 400 && lights.length < atmosphere.torches; tries++) {
    const x = 1 + Math.floor(rng() * (layout.width - 2));
    const y = 1 + Math.floor(rng() * (layout.height - 2));
    const index = y * layout.width + x;
    if (layout.props[index]) continue;
    if (atmosphere.bands[layout.ground[index]].bare) continue;
    if (bands && !bands.includes(layout.ground[index])) continue;
    if (lights.some((light) => Math.abs(light.x - x) < apart && Math.abs(light.y - y) < apart)) continue;
    const color = atmosphere.fires?.colors?.[lights.length % atmosphere.fires.colors.length];
    const light: MapLight = { x, y, kind: kinds[lights.length % kinds.length], facing: 0, room: lights.length };
    lights.push(color ? { ...light, color } : light);
  }

  return lights;
}

/** How thick the water over a band is laid: as the settings of water lay a pond. */
const FIELD_WATER_DENSITY = 0.6;

/**
 * The water lying over the bands that have any, as few areas as cover each band: the surface at the
 * board, which on raised ground is dug down under it.
 */
function watersOf(layout: FieldLayout, atmosphere: FieldAtmosphere, gridType: GridType): MapAmbience[] {
  const waters: MapAmbience[] = [];
  atmosphere.bands.forEach((band, index) => {
    if (!band.water) return;
    const { color, turbidity, dirt, leaves, ice } = band.water;
    for (const rect of areasOver(maskOfBand(layout, index), layout.width, layout.height, gridType)) {
      waters.push({
        rect,
        kind: 'water',
        density: FIELD_WATER_DENSITY,
        name: 'water',
        water: { surface: 0, color, turbidity, dirt, leaves, ice },
      });
    }
  });
  return waters;
}

/**
 * The fewest areas that cover the cells of a mask and no others, on a board of the grid given. An
 * area is laid a cell's width to each cell along both ways, which on squares fits any rectangle; hexes
 * line up a cell apart only one way, along rows of pointy-topped ones and columns of flat-topped
 * ones, so there an area is one run of cells along that way.
 */
function areasOver(mask: Uint8Array, width: number, height: number, gridType: GridType): MapRect[] {
  if (!isHexGrid(gridType)) return mergeMaskToRects(mask, width, height, Math.max(width, height));
  const down = isFlatTopGrid(gridType);
  const runs: MapRect[] = [];
  const lines = down ? width : height;
  const length = down ? height : width;
  for (let line = 0; line < lines; line++) {
    let start = -1;
    for (let at = 0; at <= length; at++) {
      const wet = at < length && mask[down ? at * width + line : line * width + at] === 1;
      if (wet && start < 0) start = at;
      if (wet || start < 0) continue;
      const run = at - start;
      runs.push(down ? { x: line, y: start, w: 1, h: run } : { x: start, y: line, w: run, h: 1 });
      start = -1;
    }
  }
  return runs;
}

/**
 * The blocks one building is built of.
 *
 * On squares it is one block to the lot, or a podium the size of the lot with the tower set a
 * cell in from its edge on top of it. On a board whose cells will not gather into rectangles it
 * is a column to a cell, those round the edge of a podium standing only as tall as the podium.
 */
function buildingBlocks(building: FieldBuilding, plan: TownPlan, span: number, models: boolean): MapBlock[] {
  const skin = plan.skins[building.skin] ?? plan.skins[0];
  // A building built of a block a cell, as on a board of hexes, is built of its blocks all the same.
  const kit = models && span > 1 ? TOWN_KITS[skin.side] : undefined;
  const standing = (): Omit<MapBlock, 'rect'> => ({
    kind: 'prop',
    blocksSight: true,
    locked: false,
    rooms: [],
    skin: { side: { kind: 'texture', id: skin.side }, top: { kind: 'texture', id: skin.top } },
    thing: 'building',
    ...(kit ? { model: kit } : {}),
  });
  const { x, y, w, h, podium } = building;
  const blocks: MapBlock[] = [];

  if (span > 1) {
    const rotate = building.spin || undefined;
    const inset = plan.inset ?? 0;
    const footprint = inset > 0 ? { w: w - inset * 2, d: h - inset * 2 } : undefined;
    blocks.push({ ...standing(), rect: { x, y, w, h }, height: podium || building.height, footprint, rotate });
    if (podium > 0) {
      blocks.push({
        ...standing(),
        rect: { x: x + 1, y: y + 1, w: w - 2, h: h - 2 },
        height: building.height - podium,
        altitude: podium,
        rotate,
      });
    }
  } else {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        const height = podium > 0 && edge ? podium : building.height;
        blocks.push({ ...standing(), rect: { x: x + dx, y: y + dy, w: 1, h: 1 }, height });
      }
    }
  }

  if (building.plant) {
    blocks.push({
      kind: 'prop',
      rect: { x: building.plant.x, y: building.plant.y, w: 1, h: 1 },
      blocksSight: false,
      locked: false,
      rooms: [],
      skin: {
        side: { kind: 'texture', id: plan.plantSkin?.side ?? ROOF_PLANT.side },
        top: { kind: 'texture', id: plan.plantSkin?.top ?? ROOF_PLANT.top },
      },
      height: ROOF_PLANT.height,
      footprint: { w: ROOF_PLANT.fill, d: ROOF_PLANT.fill },
      altitude: building.height,
      thing: 'roofUnit',
      ...(models ? { model: roofUnitModelOf(plan) } : {}),
    });
  }
  return blocks;
}

/**
 * Turns a laid-out field into the map blocks, paint, ambiences and lights a table is built from.
 *
 * Each band of ground is painted as merged rectangles of its texture, cell-marked props become
 * merged blocks, pools become hazard paint with an ambience over each, and standing things become
 * layered props with any trunk and arms. Open fires go on open ground well apart, as many as the
 * mood asks for. `mergeSpan` caps how wide a merged rectangle grows.
 */
export function fieldToBlocks(
  layout: FieldLayout,
  atmosphere: FieldAtmosphere,
  seed: number,
  mergeSpan: number = FIELD_MERGE_SPAN,
  models = false,
  season: FieldSeason = '',
  gridType: GridType = GridType.SQUARE
): MapBlocks {
  const blocks: MapBlock[] = [];
  const paint: MapPaint[] = [];
  const span = mergeSpan;

  atmosphere.bands.forEach((band, index) => {
    const mask = maskOfBand(layout, index);
    for (const rect of mergeMaskToRects(mask, layout.width, layout.height, span)) {
      paint.push({ kind: 'floor', rect, material: { kind: 'texture', id: band.texture } });
    }
  });

  for (const prop of FIELD_PROP_IDS) {
    if (FIELD_PROP_SHAPES[prop].layers) continue;
    const shape = FIELD_PROP_SHAPES[prop];
    // A thing laid flat on the ground is kept as a bare mark per cell, with no room on it for
    // what it is made of, so what the mood asked for is looked up here instead of being lost.
    const asked = atmosphere.props.find((plan) => plan.prop === prop && plan.skin)?.skin;
    const side = asked?.side ?? shape.side;
    const top = asked?.top ?? shape.top;
    const mask = maskOfProp(layout, prop);
    if (models && FIELD_PROP_MODELS[prop]?.length) {
      for (let index = 0; index < mask.length; index++) {
        if (!mask[index]) continue;
        const x = index % layout.width;
        const y = Math.floor(index / layout.width);
        const model = fieldModelAt(prop, x, y, seed, atmosphere.id, season)!;
        const cell = { x, y, span: 1, lift: 0, spin: 0, prop };
        blocks.push(modelledThing(cell, shape, { side, top }, { x, y, w: 1, h: 1 }, model));
      }
      continue;
    }
    for (const rect of mergeMaskToRects(mask, layout.width, layout.height, span)) {
      blocks.push({
        kind: 'prop',
        rect,
        blocksSight: shape.blocksSight,
        locked: false,
        rooms: [],
        skin: { side: { kind: 'texture', id: side }, top: { kind: 'texture', id: top } },
        height: shape.height,
        thing: prop,
      });
    }
  }

  if (atmosphere.town) {
    for (const building of layout.buildings) blocks.push(...buildingBlocks(building, atmosphere.town, span, models));
  }

  const settled = layout.settlement
    ? settlementBlocks(layout.settlement, layout.width, layout.height, span, models, gridType)
    : null;
  if (settled) {
    blocks.push(...settled.blocks);
    paint.push(...settled.paint);
  }

  // Last laid wins where two patches cover one cell, so a pool goes down over the band it lies in.
  for (const pool of layout.pools) {
    paint.push({
      kind: 'hazard',
      rect: { x: pool.x, y: pool.y, w: pool.w, h: pool.h },
      material: { kind: 'texture', id: pool.texture },
      hazard: pool.hazard,
    });
  }

  for (const object of layout.objects) {
    const shape = FIELD_PROP_SHAPES[object.prop];
    const skin = object.skin ?? { side: shape.side, top: shape.top };
    const reach = (object.span - 1) / 2;
    const rect = { x: object.x - reach, y: object.y - reach, w: object.span, h: object.span };
    const model = models ? fieldModelAt(object.prop, object.x, object.y, seed, atmosphere.id, season) : null;

    if (model) {
      blocks.push(modelledThing(object, shape, skin, rect, model));
      continue;
    }

    if (shape.trunk) {
      const trunk = shape.trunk;
      blocks.push({
        kind: 'prop',
        rect: { x: object.x, y: object.y, w: 1, h: 1 },
        blocksSight: false,
        locked: false,
        rooms: [],
        skin: { side: { kind: 'texture', id: trunk.side }, top: { kind: 'texture', id: trunk.top } },
        height: trunk.height + object.lift,
        footprint: { w: trunk.width, d: trunk.width },
        rotate: object.spin,
        thing: object.prop,
      });
    }

    // Layer on layer, each narrower than the one under it and each sitting a little off it.
    // They share the one turn: a layer turned past the one below makes a screw, not a rock.
    // Only what hangs is lifted. A rock or a hill starts on the earth: carrying its own
    // variation upward would leave it floating a fraction of a cell above the ground it sits on.
    let standing = shape.altitude != null ? shape.altitude + object.lift : 0;
    const layers = shape.layers ?? [{ spread: object.span, height: shape.height }];
    layers.forEach((layer, index) => {
      const spread = Math.min(layer.spread, object.span);
      const squash = 1 + object.squash * (index % 2 === 0 ? 1 : -1);
      blocks.push({
        kind: 'prop',
        rect,
        blocksSight: shape.blocksSight && spread > 1,
        locked: false,
        rooms: [],
        skin: { side: { kind: 'texture', id: skin.side }, top: { kind: 'texture', id: skin.top } },
        height: layer.height,
        footprint: { w: spread * squash, d: spread / squash },
        altitude: standing,
        rotate: object.spin,
        offset: object.drift[index],
        thing: object.prop,
      });
      standing += layer.height;
    });

    for (const arm of shape.arms ?? []) {
      blocks.push({
        kind: 'prop',
        rect: { x: object.x, y: object.y, w: 1, h: 1 },
        blocksSight: false,
        locked: false,
        rooms: [],
        skin: { side: { kind: 'texture', id: skin.side }, top: { kind: 'texture', id: skin.top } },
        height: arm.height,
        footprint: { w: arm.size, d: arm.size },
        altitude: (shape.altitude ?? 0) + object.lift + arm.at,
        rotate: object.spin,
        offset: { x: arm.reach, y: 0 },
        thing: object.prop,
      });
    }
  }

  const lights = [...findFires(layout, atmosphere, seed), ...(settled?.lights ?? [])].map((light, room) => ({
    ...light,
    room,
  }));

  return {
    blocks,
    paint,
    ambiences: [
      ...watersOf(layout, atmosphere, gridType),
      ...layout.pools.map((pool) => ({
        rect: { x: pool.x, y: pool.y, w: pool.w, h: pool.h },
        kind: pool.kind,
        density: pool.density,
        name: pool.name,
      })),
      ...(settled?.ambiences ?? []),
    ],
    ...(settled && settled.slows.length > 0 ? { slows: settled.slows } : {}),
    traps: [],
    torchRooms: lights.map((light) => light.room),
    torchSpots: lights.map((light) => ({ x: light.x, y: light.y })),
    lights,
  };
}
