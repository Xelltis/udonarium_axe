import { seededRandom } from '@axe/core/util/seeded-random';
import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import {
  FIELD_PROP_IDS,
  FIELD_PROP_SHAPES,
  FieldAtmosphere,
  FieldPropId,
} from '@axe/domain/tabletop/field/field-atmosphere';
import { FieldLayout } from '@axe/domain/tabletop/field/field-layout';
import { MapBlock, MapBlocks, MapLight, MapLightKind, MapPaint } from '@axe/domain/tabletop/map-blocks';

/**
 * How wide a clump of the same thing is allowed to grow before it is broken in two.
 *
 * A wood merged without limit becomes one canopy the size of the board, which reads as a
 * plateau rather than trees. Three cells is a stand of trees.
 */
export const FIELD_MERGE_SPAN = 4;

const OPEN_FIRES: readonly MapLightKind[] = ['campfire', 'stand', 'brazier'];

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

/** Somewhere out in the open, well away from anything already lit. */
function findFires(layout: FieldLayout, atmosphere: FieldAtmosphere, seed: number): MapLight[] {
  const lights: MapLight[] = [];
  if (atmosphere.torches < 1) return lights;
  const rng = seededRandom(seed + 3301);
  const apart = Math.max(6, Math.round(Math.min(layout.width, layout.height) / 3));

  for (let tries = 0; tries < 400 && lights.length < atmosphere.torches; tries++) {
    const x = 1 + Math.floor(rng() * (layout.width - 2));
    const y = 1 + Math.floor(rng() * (layout.height - 2));
    const index = y * layout.width + x;
    if (layout.props[index]) continue;
    if (atmosphere.bands[layout.ground[index]].bare) continue;
    if (lights.some((light) => Math.abs(light.x - x) < apart && Math.abs(light.y - y) < apart)) continue;
    lights.push({ x, y, kind: OPEN_FIRES[lights.length % OPEN_FIRES.length], facing: 0, room: lights.length });
  }

  return lights;
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
      });
    }
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
      });
    }

    // Layer on layer, each narrower than the one under it and each sitting a little off it.
    // They share the one turn: a layer turned past the one below makes a screw, not a rock.
    // Only what hangs is lifted. A rock or a hill starts on the earth: carrying its own
    // variation upward left it floating a fraction of a cell above the ground it sits on.
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
