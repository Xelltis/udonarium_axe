import {
  clipBillboardToEye,
  clipPolygonToEye,
  depthOf,
  EyeFrame,
  eyeFrameOf,
  FirstPersonCamera,
  viewDepthOf,
} from '@axe/domain/tabletop/first-person/first-person-clip';
import { headingVector } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { FirstPersonPlaneQuad } from '@axe/domain/tabletop/first-person/first-person-scene';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellIndexAt, CellPoint, cellPolygonOf, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { RangeArea } from '@axe/domain/tabletop/range';
import { type LightBeam } from '@axe/domain/tabletop/vision-scene';
import { WaterCell } from '@axe/domain/tabletop/water/water-cells';
import { depthShadeAlpha, murkShade } from '@axe/domain/tabletop/water/water-depth';
import {
  deepWaterColor,
  dirtyWaterColor,
  rgbTripletOf,
  scumColorOf,
  scumOpacity,
  waterMurkLayer,
  waterSurfaceWash,
} from '@axe/domain/tabletop/water/water-look';
import {
  glowStyle,
  lyingSamples,
  propClip,
  PropShape,
  propStyle,
} from '@axe/features/first-person/first-person-prop-style';
import { FirstPersonGlow, FirstPersonProp } from '@axe/features/first-person/first-person-props.service';
import {
  BLACK_VEIL,
  blurFilter,
  farBlurPx,
  planeQuadStyle,
  QuadStyle,
} from '@axe/features/first-person/first-person-style';
import { FogAirLayer, fogAirLayers } from '@axe/infrastructure/tabletop/fog/fog-air-layers';
import { FOG_AIR_SHEET_MARGIN } from '@axe/infrastructure/tabletop/fog/fog-air-sheet';
import { rangeQuadrantCells } from '@axe/infrastructure/tabletop/range/range-paint';
import { lotusTileUrl } from '@axe/infrastructure/tabletop/water/lotus-texture';

/** How close in front of the eye the view is cut, in cells; nothing nearer is drawn. */
export const NEAR_CELLS = 0.05;
/** How far a board standing on its edge is read back from its face, for whether it is in sight, in cells. */
const BOARD_STEP_CELLS = 0.25;
/** How much of the scum on dirty water shows as a film over it, seen across the water from the eye. */
const SCUM_TINT = 0.35;
/** How many cells one repeat of the floating leaves spans, as on the table. */
const LEAF_CELLS = 3.6;
/** How far a surface standing no higher than its floor is drawn over it, clear of the floor's own face. */
const WET_FLOOR_LIFT_PX = 0.5;
/** How much of a water surface still shows at the far end of the view. */
const FAR_WATER_OPACITY = 0.4;
/** How far over the floor a range area is laid, clear of the floor and of anything lying on it. */
const RANGE_LIFT_PX = 0.75;

/** What the view can show: the board's cells, those in sight, how large a cell is and how far the view reaches. */
export interface FirstPersonSight {
  readonly grid: CellGrid | null;
  /** The cells in sight, or null where everything is. */
  readonly seen: CellBits | null;
  readonly gridSize: number;
  readonly reachPx: number;
}

/** One cell of a water surface in sight, ready to draw. */
export interface WaterQuadView {
  readonly id: string;
  readonly style: QuadStyle;
}

/** A prop in sight, ready to draw, and whether it is drawn filled. */
export interface PropView extends FirstPersonProp {
  fill: boolean;
  style: QuadStyle;
}

/** A glow in sight, ready to draw. */
export interface GlowView {
  id: string;
  style: QuadStyle;
}

/** A range area reaching ground in sight, laid on the floor. */
export interface RangeView {
  id: string;
  range: RangeArea;
  style: QuadStyle;
}

/** A beam a cone light throws, as it is stood in the view. */
export interface BeamView {
  id: string;
  width: number;
  height: number;
  clip: string;
  background: string;
  fins: string[];
}

/** A sheet of fog hanging over ground nobody has walked to. */
export interface FogAirView {
  id: number;
  layer: FogAirLayer;
  style: QuadStyle;
}

/**
 * Whether a point stands where the view can show it: over ground in sight, clear of the camera's
 * near plane at the height given (or at the eye's), and no further off than the view reaches.
 */
export function pointInSight(sight: FirstPersonSight, eye: EyeFrame, centre: CellPoint, zPx?: number): boolean {
  const { grid, seen } = sight;
  if (!grid) return false;
  const cell = cellIndexAt(grid, centre.x, centre.y);
  if (seen && (cell < 0 || !seen.get(cell))) return false;
  const depth = depthOf(eye, centre);
  const ahead = zPx === undefined ? depth : viewDepthOf(eye, centre, zPx);
  return ahead > sight.gridSize * NEAR_CELLS * 4 && depth <= sight.reachPx;
}

/**
 * Whether a piece stands where the view can show it: the cell under its middle is in sight, or any
 * cell whose middle its footing covers, so a great piece half behind a pillar still shows; and the
 * face it stands up on lies ahead of the eye, its near side no further off than the view reaches.
 */
export function pieceInSight(
  sight: FirstPersonSight,
  eye: EyeFrame,
  at: CellPoint,
  groundPx: number,
  centre: CellPoint
): boolean {
  const { grid, seen } = sight;
  if (!grid) return false;
  const depth = depthOf(eye, centre);
  if (depth <= sight.gridSize * NEAR_CELLS * 4 || depth - groundPx / 2 > sight.reachPx) return false;
  if (!seen) return true;
  const middle = cellIndexAt(grid, centre.x, centre.y);
  if (middle >= 0 && seen.get(middle)) return true;
  const edge = Math.min(1, groundPx / 4);
  let shown = false;
  forEachCellInBox(grid, at.x + edge, at.y + edge, at.x + groundPx - edge, at.y + groundPx - edge, (cell) => {
    if (!shown && seen.get(cell)) shown = true;
  });
  return shown;
}

/** Whether a prop stands where the view can show it, read where each kind of prop is seen from. */
export function propInSight(sight: FirstPersonSight, eye: EyeFrame, prop: PropShape): boolean {
  if (prop.kind === 'lie') {
    return lyingSamples(prop, sight.gridSize).some((point) => pointInSight(sight, eye, point, prop.z));
  }
  if (prop.kind === 'board') {
    const heading = headingVector(prop.rotate);
    const step = sight.gridSize * BOARD_STEP_CELLS;
    return pointInSight(sight, eye, { x: prop.x - heading.x * step, y: prop.y - heading.y * step });
  }
  return pointInSight(sight, eye, prop);
}

/**
 * The surface of the water in sight, cell by cell: seen from above where the eye stands over it,
 * from below where the eye is under it. Each cell is cut to the near plane as the floor is, and fades
 * with the distance as the water would, and more in murky water the eye is in.
 *
 * The cells are numbered on the grid the water is laid on, which reaches past the board where water
 * lies off it; what has been seen is read on the board's own grid, by the middle of each cell.
 */
export function waterQuadViews(
  cells: Iterable<WaterCell>,
  waterGrid: CellGrid,
  camera: FirstPersonCamera,
  sight: FirstPersonSight & { readonly grid: CellGrid },
  look: { readonly scale: number; readonly murk: number | null }
): WaterQuadView[] {
  const { grid, gridSize, seen, reachPx: reach } = sight;
  const { scale, murk } = look;
  const eye = eyeFrameOf(camera);
  const nearPx = gridSize * NEAR_CELLS;
  const views: WaterQuadView[] = [];
  for (const cell of cells) {
    if (seen) {
      const seenAt = cellIndexAt(grid, cell.cx, cell.cy);
      if (seenAt < 0 || !seen.get(seenAt)) continue;
    }
    const depth = depthOf(eye, { x: cell.cx, y: cell.cy });
    if (depth > reach + gridSize) continue;
    const zPx = cell.surfacePx > cell.floorPx ? cell.surfacePx : cell.floorPx + WET_FLOOR_LIFT_PX;
    const polygon = clipPolygonToEye(eye, cellPolygonOf(waterGrid, cell.index), nearPx, zPx);
    if (polygon.length < 3) continue;
    const quad = waterQuadOf(cell.index, polygon, zPx, camera.z >= zPx ? 'up' : 'down', depth);
    const far = 1 - (1 - FAR_WATER_OPACITY) * Math.min(Math.max(depth / Math.max(reach, 1), 0), 1);
    const fade = murk === null ? far : Math.min(far, 1 - murkShade(depth / gridSize, murk));
    const tone = dirtyWaterColor(cell.color, cell.dirt);
    const deepRgb = rgbTripletOf(deepWaterColor(tone)) ?? BLACK_VEIL;
    const deepAlpha = depthShadeAlpha((cell.surfacePx - cell.floorPx) / gridSize, cell.turbidity);
    const scumRgb = rgbTripletOf(scumColorOf(cell.color)) ?? BLACK_VEIL;
    const scumAlpha = Math.round(scumOpacity(cell.dirt) * SCUM_TINT * 1000) / 1000;
    // Scum is a patch here and there on the table; seen across the water from the eye it runs together into a film.
    const layers = [
      scumAlpha > 0 ? `linear-gradient(rgba(${scumRgb}, ${scumAlpha}), rgba(${scumRgb}, ${scumAlpha}))` : '',
      waterSurfaceWash(tone, cell.density),
      waterMurkLayer(tone, cell.turbidity),
      `linear-gradient(rgba(${deepRgb}, ${deepAlpha}), rgba(${deepRgb}, ${deepAlpha}))`,
    ].filter((layer) => layer.length > 0);
    const sizes = layers.map(() => '100% 100%');
    const positions = layers.map(() => '0 0');
    // The leaves lie on top of the water, so they show only from above it; from below the surface hides them.
    const leaves = quad.facing === 'up' ? lotusTileUrl(cell.leaves) : '';
    if (leaves) {
      const tile = gridSize * LEAF_CELLS;
      const along = (offset: number) => -((((offset % tile) + tile) % tile) * scale);
      layers.unshift(`url(${leaves})`);
      sizes.unshift(`${tile * scale}px ${tile * scale}px`);
      positions.unshift(`${along(quad.minX)}px ${along(quad.minY)}px`);
    }
    views.push({
      id: `water:${cell.index}`,
      style: {
        ...planeQuadStyle(quad, scale, '', 0),
        backgroundImage: layers.join(', '),
        backgroundSize: sizes.join(', '),
        backgroundPosition: positions.join(', '),
        opacity: `${Math.round(fade * 1000) / 1000}`,
      },
    });
  }
  return views;
}

/** The props in sight, each cut at the eye where it runs under it and blurred with the distance. */
export function propViewsOf(
  props: readonly FirstPersonProp[],
  pose: FirstPersonCamera,
  sight: FirstPersonSight,
  look: { readonly scale: number; readonly clearPx: number }
): PropView[] {
  const eye = eyeFrameOf(pose);
  const views: PropView[] = [];
  for (const prop of props) {
    const clip = propClip(prop, eye, sight.gridSize * NEAR_CELLS, look.scale);
    if (clip === null || !propInSight(sight, eye, prop)) continue;
    const placed = propStyle(prop, pose.yaw, look.scale);
    const blur = blurFilter(farBlurPx(depthOf(eye, prop), look.clearPx, sight.reachPx));
    const style = blur ? { ...placed, filter: blur } : placed;
    views.push({
      ...prop,
      fill: prop.what === 'mask' || prop.what === 'board' || prop.what === 'trigger',
      style: clip ? { ...style, clipPath: clip } : style,
    });
  }
  return views;
}

/** A range area laid on the floor in a square as wide as its canvases, or null where none of it is in sight. */
export function rangeViewOf(
  range: RangeArea,
  pose: FirstPersonCamera,
  sight: FirstPersonSight,
  scale: number
): RangeView | null {
  const gridSize = sight.gridSize;
  const eye = eyeFrameOf(pose);
  const side = rangeQuadrantCells(range) * gridSize * 2;
  const footprint: PropShape = {
    kind: 'lie',
    x: range.location.x,
    y: range.location.y,
    z: range.posZ + range.altitude * gridSize + RANGE_LIFT_PX,
    width: side,
    height: side,
    rotate: 0,
  };
  const clip = propClip(footprint, eye, gridSize * NEAR_CELLS, scale);
  if (clip === null || !propInSight(sight, eye, footprint)) return null;
  const style = propStyle(footprint, pose.yaw, scale);
  return { id: range.identifier, range, style: clip ? { ...style, clipPath: clip } : style };
}

/**
 * The beams the table's cone lights throw, for the lights hanging in front of the eye and no further
 * off than the view reaches. One hung over the eye itself would stand through it, which a flat sheet
 * cannot be drawn doing, so it is left out.
 */
export function beamViewsOf(
  beams: readonly LightBeam[],
  pose: FirstPersonCamera,
  gridSize: number,
  reachPx: number
): BeamView[] {
  const eye = eyeFrameOf(pose);
  return beams.flatMap((beam, index) => {
    const depth = depthOf(eye, beam.origin);
    const hung = viewDepthOf(eye, beam.origin, beam.origin.z);
    const foot = viewDepthOf(eye, beam.origin, beam.origin.z - beam.height);
    if (depth < gridSize || hung < gridSize || foot < gridSize || depth > reachPx + beam.height) return [];
    return [
      {
        id: `${index}:${beam.origin.x}:${beam.origin.y}`,
        width: beam.width,
        height: beam.height,
        clip: beam.clip,
        background: `linear-gradient(to bottom, ${beam.color} 0%, transparent 88%)`,
        fins: beam.fins,
      },
    ];
  });
}

/** The sheets of fog hanging over a board of the size given, each laid across it at its height and cut at the eye. */
export function fogAirViewsOf(
  board: { readonly widthPx: number; readonly heightPx: number },
  pose: FirstPersonCamera,
  gridSize: number,
  scale: number
): FogAirView[] {
  const eye = eyeFrameOf(pose);
  return fogAirLayers(gridSize).flatMap((layer, index) => {
    const footprint: PropShape = {
      kind: 'lie',
      x: board.widthPx / 2,
      y: board.heightPx / 2,
      z: layer.heightPx,
      width: board.widthPx * (1 + FOG_AIR_SHEET_MARGIN * 2),
      height: board.heightPx * (1 + FOG_AIR_SHEET_MARGIN * 2),
      rotate: 0,
    };
    const clip = propClip(footprint, eye, gridSize * NEAR_CELLS, scale);
    if (clip === null) return [];
    const style = propStyle(footprint, pose.yaw, scale);
    return [{ id: index, layer, style: clip ? { ...style, clipPath: clip } : style }];
  });
}

/** The glows in sight whole, none of them cut by the eye. */
export function glowViewsOf(
  glows: readonly FirstPersonGlow[],
  pose: FirstPersonCamera,
  sight: FirstPersonSight,
  scale: number
): GlowView[] {
  const eye = eyeFrameOf(pose);
  const nearPx = sight.gridSize * NEAR_CELLS;
  return glows
    .filter((glow) => {
      if (!pointInSight(sight, eye, glow, glow.z)) return false;
      const kept = clipBillboardToEye(eye, glow, glow.z - glow.radius, glow.z + glow.radius, nearPx);
      return kept !== null && kept.highPx - kept.lowPx >= glow.radius * 2 - 1e-6;
    })
    .map((glow) => ({ id: glow.id, style: glowStyle(glow, pose.yaw, scale) }));
}

/** One cell of a water surface as a level face the view can draw, lying at a height and facing up or down. */
function waterQuadOf(
  index: number,
  polygon: CellPoint[],
  zPx: number,
  facing: 'up' | 'down',
  depth: number
): FirstPersonPlaneQuad {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    kind: 'cap',
    id: `water:${index}`,
    terrain: '',
    zPx,
    facing,
    minX,
    minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    polygon,
    image: '',
    frame: null,
    tilePx: 0,
    glass: false,
    depth,
    cell: index,
  };
}
