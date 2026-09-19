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
import { FieldBuilding } from '@axe/domain/tabletop/field/town-layout';
import { MapBlock, MapBlocks, MapLight, MapLightKind, MapPaint } from '@axe/domain/tabletop/map-blocks';

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

/**
 * The blocks one building is built of.
 *
 * On squares it is one block to the lot, or a podium the size of the lot with the tower set a
 * cell in from its edge on top of it. On a board whose cells will not gather into rectangles it
 * is a column to a cell, those round the edge of a podium standing only as tall as the podium.
 */
function buildingBlocks(building: FieldBuilding, plan: TownPlan, span: number): MapBlock[] {
  const skin = plan.skins[building.skin] ?? plan.skins[0];
  const standing = (): Omit<MapBlock, 'rect'> => ({
    kind: 'prop',
    blocksSight: true,
    locked: false,
    rooms: [],
    skin: { side: { kind: 'texture', id: skin.side }, top: { kind: 'texture', id: skin.top } },
    thing: 'building',
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
  mergeSpan: number = FIELD_MERGE_SPAN
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
    for (const building of layout.buildings) blocks.push(...buildingBlocks(building, atmosphere.town, span));
  }

  // Last laid wins where two patches cover one cell, so a pool goes down over the band it lies in.
  for (const pool of layout.pools) {
    paint.push({
      kind: 'hazard',
      rect: { x: pool.x, y: pool.y, w: pool.w, h: pool.h },
      material: { kind: 'texture', id: pool.texture },
    });
  }

  for (const object of layout.objects) {
    const shape = FIELD_PROP_SHAPES[object.prop];
    const skin = object.skin ?? { side: shape.side, top: shape.top };
    const reach = (object.span - 1) / 2;
    const rect = { x: object.x - reach, y: object.y - reach, w: object.span, h: object.span };

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

  const lights = findFires(layout, atmosphere, seed);

  return {
    blocks,
    paint,
    ambiences: layout.pools.map((pool) => ({
      rect: { x: pool.x, y: pool.y, w: pool.w, h: pool.h },
      kind: pool.kind,
      density: pool.density,
      name: pool.name,
    })),
    torchRooms: lights.map((light) => light.room),
    torchSpots: lights.map((light) => ({ x: light.x, y: light.y })),
    lights,
  };
}
