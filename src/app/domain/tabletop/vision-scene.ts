import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { computeLitCells } from '@axe/domain/tabletop/lit-cells';
import {
  Point,
  Segment,
  segmentClear,
  segmentClearBetween,
  segmentsAbove,
  TallSegment,
} from '@axe/domain/tabletop/los/segments';
import { computeVisibilityPolygon } from '@axe/domain/tabletop/los/visibility-polygon';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { maxLobeScale, VisionLobe, visionLobeScale } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

const LIGHT_SAMPLE_COUNT = 64;
const VISION_SAMPLE_COUNT = 64;
const GM_DIM_FACTOR = 0.4;
const THERMAL_COLOR = '#ff5a1e';

export interface SceneLight {
  x: number;
  y: number;
  z: number;
  brightPx: number;
  dimPx: number;
  color: string;
  angle: number;
  direction: number;
  pitch: number;
  revealToAll: boolean;
  castShadows: boolean;
  ignoreOcclusion: boolean;
  animation: string;
  sourceId: string;
  surface: TableSurface;
}

export interface SceneVisionSource {
  x: number;
  y: number;
  /**
   * How high the eye is, which is how high the ground under it is plus the eye's own height.
   *
   * Standing on a tower and being written down as high up are the same thing to an eye, so
   * they are the same number here, and it is the number the light already carries.
   */
  z: number;
  type: VisionType;
  rangePx: number;
  owner: string;
  /**
   * Whether the piece is the game master's to run rather than somebody's to play.
   *
   * A piece nobody has claimed is the party's eyes, since user ids change between
   * connections. One marked as the game master's is not: a monster set out on the board
   * would otherwise clear the fog for the very people it is hiding from.
   */
  isNpc?: boolean;
  partyId?: string;
  sourceId: string;
  /** Where the piece faces, in degrees, with the lobes measured from it. */
  direction: number;
  lobes: readonly VisionLobe[];
}

/** How far above whatever it stands on an eye, or the lamp it carries, sits. */
export const EYE_HEIGHT_CELLS = 0.5;

/**
 * How high a thing on the table is.
 *
 * Being written down as high up and having climbed onto something are two ways of arriving at
 * the same place, and the table already keeps them apart: the first is a number of cells the
 * reader set, the second is where gravity came to rest. Nothing above the table cares which
 * of the two got it there, so both are added up here, once, for everything that looks or
 * shines from a height.
 */
export function eyeHeightPx(altitudeCells: number, posZ: number, gridSize: number): number {
  return (altitudeCells + EYE_HEIGHT_CELLS) * gridSize + posZ;
}

export interface SceneViewer {
  userId: string;
  isGameMaster: boolean;
  visionOwnerIds?: readonly string[];
  partyIds?: readonly string[];
}

export interface ShadowCaster {
  ownerId: string;
  x: number;
  y: number;
  radiusPx: number;
  segments: Segment[];
  imageUrl: string;
}

export interface ShadowShape {
  x: number;
  y: number;
  fx: number;
  fy: number;
  width: number;
  points: Point[];
  color: string;
  imageUrl: string;
  clipPolygon?: Point[];
}

export type LightSegment = TallSegment;

export interface WallFace {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
  heightPx: number;
}

export interface WallSilhouette {
  localX: number;
  width: number;
  height: number;
  alpha: number;
  imageUrl: string;
}

export interface WallLight {
  localX: number;
  localY: number;
  radiusX: number;
  radiusY: number;
  color: string;
  intensity: number;
  /** Where what stands in the way cuts the pool: the foot of the lit part, along the face. */
  shadow?: Point[];
}

export interface VisionScene {
  darknessEnabled: boolean;
  fogEnabled: boolean;
  darknessLevel: number;
  ambientColor: string;
  globalIllumination: number;
  gridSize: number;
  gridType?: GridType;
  snapLightToGrid?: boolean;
  widthPx: number;
  heightPx: number;
  lights: SceneLight[];
  visionSources: SceneVisionSource[];
  sightSegments: TallSegment[];
  lightSegments: LightSegment[];
  shadowCasters: ShadowCaster[];
}

export interface OverlayShape {
  x: number;
  y: number;
  brightPx: number;
  dimPx: number;
  angle: number;
  direction: number;
  color: string;
  full: boolean;
  clipPolygon?: Point[];
  animation?: string;
}

/**
 * What the reader can see and what they remember, in cells.
 *
 * `visible` is what their own eyes reach right now and cuts the light back to it, so a lamp
 * shut in a room stays in that room. `explored` is what the party has been shown, which is
 * everything on an easy table and only what is in sight on a hard one.
 */
export interface OverlayVision {
  grid: CellGrid;
  visible: CellBits;
  explored: CellBits;
  clipReveals: boolean;
  fogEnabled: boolean;
  fogColor: string;
  /** What ground that has been cleared but cannot be seen now is shaded with. */
  veilColor: string;
  veilAlpha: number;
  unexploredAlpha: number;
  blurPx: number;
  /** Whether ground once cleared keeps showing what stands on it. */
  rememberSeen: boolean;
  /**
   * Whether ground once cleared is held lit, so the dark never closes over it again.
   *
   * The lamps that cleared it are gone the moment the party walks on, and what they lit is a
   * room the party has taken. Left to the lamps, it would go black behind them.
   */
  clearedStaysLit: boolean;
}

export interface OverlayPlan {
  darknessAlpha: number;
  darknessColor: string;
  baseRevealAlpha: number;
  reveals: OverlayShape[];
  revealCells?: Point[][];
  glows: OverlayShape[];
  shadows: ShadowShape[];
  vision?: OverlayVision;
}

export interface LightBeam {
  width: number;
  height: number;
  clip: string;
  color: string;
  fins: string[];
}

export interface LightGlow {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  transform: string | null;
}

const BEAM_FIN_COUNT = 3;
const GLOW_MAX_RADIUS_PX = 450;

const SHADOW_SPREAD = 2.2;

const WALL_FACE_OFFSET_PX = 0.5;
const WALL_LIGHT_SAMPLE_STEP_PX = 12;
const WALL_LIGHT_MIN_SAMPLES = 9;
const WALL_LIGHT_MAX_SAMPLES = 49;
const WALL_LIGHT_EDGE_STEPS = 5;
const WALL_LIGHT_EDGE_JUMP_PX = 2;
const WALL_LIGHT_FLAT_PX = 0.5;

const TWO_PI = Math.PI * 2;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function lightAxis(light: SceneLight): { x: number; y: number; z: number } {
  const dir = (light.direction * Math.PI) / 180;
  const pit = (light.pitch * Math.PI) / 180;
  const cp = Math.cos(pit);
  return { x: Math.cos(dir) * cp, y: Math.sin(dir) * cp, z: Math.sin(pit) };
}

/**
 * How far a light carries across a level surface, once the climb down to it is paid for.
 *
 * `planeZ` is the height of the surface being lit, which is the ground for most of a table and
 * the top of a wall for whatever has climbed onto one. A lamp hung level with a walkway reaches
 * along it, and reading that walkway against the pool on the ground far below said otherwise.
 */
export function floorRadii(light: SceneLight, planeZ = 0): { brightFloor: number; dimFloor: number } {
  const drop = light.z - planeZ;
  const z2 = drop * drop;
  return {
    brightFloor: Math.sqrt(Math.max(0, light.brightPx * light.brightPx - z2)),
    dimFloor: Math.sqrt(Math.max(0, light.dimPx * light.dimPx - z2)),
  };
}

/**
 * Where a light lands on the floor, and how far it carries once it is there.
 *
 * The floor and the things standing on it used to be told apart by different geometry: the
 * floor by this projection, a block by the plain distance through the air. A lamp hung on a
 * wall is nearer to the block beside it than to the floor below, so the block came out lit
 * over a floor that was left dark. Both now read the pool from here.
 */
export function lightFloorPool(
  light: SceneLight,
  planeZ = 0
): { cx: number; cy: number; brightPx: number; dimPx: number } | null {
  const { brightFloor, dimFloor } = floorRadii(light, planeZ);
  if (dimFloor < 1) return null;
  if (light.angle >= 360) return { cx: light.x, cy: light.y, brightPx: brightFloor, dimPx: dimFloor };

  // A wide cone reaches a surface whichever way its axis is turned: what settles it is the ray
  // on that side of the spread. The floor below is reached by the lowest ray, which is the axis
  // tilted down by half of it; a roof above by the highest, tilted up by the same.
  const above = planeZ > light.z;
  if (above ? light.pitch + light.angle / 2 <= 0 : light.pitch >= light.angle / 2) return null;
  const axis = lightAxis(light);
  // Where the axis meets the surface, when it meets it in front of the light; otherwise the
  // pool lies about the spot below the lamp, which is where a sconce throws it.
  const towards = above ? axis.z > 0.05 : axis.z < -0.05;
  const t = towards ? -(light.z - planeZ) / axis.z : 0;
  const ratio = light.dimPx > 0 ? light.brightPx / light.dimPx : 1;
  return {
    cx: light.x + axis.x * t,
    cy: light.y + axis.y * t,
    brightPx: dimFloor * ratio,
    dimPx: dimFloor,
  };
}

export function computeLightBeam(light: SceneLight): LightBeam | null {
  if (light.angle >= 360) return null;
  const axis = lightAxis(light);
  const half = (light.angle * Math.PI) / 360;
  const tanHalf = Math.tan(half);
  // A beam turned down is cut off where it meets the floor. Turned up or held level it meets
  // nothing, and runs the length the light carries.
  const toFloor = axis.z < -0.05 ? -light.z / axis.z : Number.POSITIVE_INFINITY;
  const slant = Math.min(toFloor, light.dimPx);
  if (slant < 1) return null;
  const height = slant;
  const width = Math.max(2 * slant * tanHalf, 1);
  let ux = axis.y;
  let uy = -axis.x;
  let uz = 0;
  let ulen = Math.hypot(ux, uy, uz);
  if (ulen < 1e-6) {
    ux = 1;
    uy = 0;
    uz = 0;
    ulen = 1;
  }
  ux /= ulen;
  uy /= ulen;
  uz /= ulen;
  const vx = axis.y * uz - axis.z * uy;
  const vy = axis.z * ux - axis.x * uz;
  const vz = axis.x * uy - axis.y * ux;
  const fins: string[] = [];
  for (let k = 0; k < BEAM_FIN_COUNT; k++) {
    const beta = (k / BEAM_FIN_COUNT) * Math.PI;
    const cb = Math.cos(beta);
    const sb = Math.sin(beta);
    const px = ux * cb + vx * sb;
    const py = uy * cb + vy * sb;
    const pz = uz * cb + vz * sb;
    const nx = py * axis.z - pz * axis.y;
    const ny = pz * axis.x - px * axis.z;
    const nz = px * axis.y - py * axis.x;
    const tx = light.x - px * (width / 2);
    const ty = light.y - py * (width / 2);
    const tz = light.z - pz * (width / 2);
    fins.push(`matrix3d(${px},${py},${pz},0,${axis.x},${axis.y},${axis.z},0,${nx},${ny},${nz},0,${tx},${ty},${tz},1)`);
  }
  return { width, height, clip: 'polygon(50% 0%, 0% 100%, 100% 100%)', color: light.color, fins };
}

export function computeLightGlow(light: SceneLight, gridSize: number): LightGlow | null {
  if (light.angle < 360 || light.dimPx < 1 || light.brightPx > GLOW_MAX_RADIUS_PX) return null;
  const r = Math.min(gridSize, Math.max(0.4 * gridSize, light.brightPx * 0.3));
  const size = 2 * r;
  if (light.surface === 'floor') {
    return { x: light.x, y: light.y, z: light.z, size, color: light.color, transform: null };
  }
  const f = surfaceFrame(light.surface, { widthPx: 0, depthPx: 0, wallHeightPx: 0 });
  const tx = light.x - f.u.x * r - f.v.x * r;
  const ty = light.y - f.u.y * r - f.v.y * r;
  const tz = light.z - f.u.z * r - f.v.z * r;
  const transform =
    `matrix3d(${f.u.x},${f.u.y},${f.u.z},0,${f.v.x},${f.v.y},${f.v.z},0,` +
    `${f.normal.x},${f.normal.y},${f.normal.z},0,${tx},${ty},${tz},1)`;
  return { x: light.x, y: light.y, z: light.z, size, color: light.color, transform };
}

export function withinCone(light: SceneLight, x: number, y: number, pz = 0): boolean {
  if (light.angle >= 360) return true;
  const vx = x - light.x;
  const vy = y - light.y;
  const vz = pz - light.z;
  const len = Math.hypot(vx, vy, vz);
  if (len < 1e-9) return true;
  const axis = lightAxis(light);
  const dot = (vx * axis.x + vy * axis.y + vz * axis.z) / len;
  return dot >= Math.cos((light.angle * Math.PI) / 360);
}

export function seesInDark(type: VisionType): boolean {
  return type === VisionType.DARKVISION || type === VisionType.TRUESIGHT || type === VisionType.THERMAL;
}

/**
 * What stands in a light's way, worked out once for that light.
 *
 * It used to be gathered afresh on every question asked about the light, building a new
 * array out of every wall on the table each time. A cone light asks a thousand times over
 * while it feels for the edge of its own pool, and every piece on the board asks once per
 * light per repaint, so the gathering cost more than the answering did.
 *
 * It is remembered against the scene and the light together, so it needs no clearing: a
 * new scene brings a new answer, and when the old scene goes what was remembered of it
 * goes with it. Against the light alone it would be wrong the moment the same light were
 * asked about under two scenes.
 */
interface LightOccluders {
  /**
   * Everything, for a caller that culls in its own way and reckons with heights itself.
   *
   * Shading a wall face works out how far up the shadow of each thing climbs, so it wants
   * everything, including what the lamp is hung above.
   */
  all: readonly TallSegment[];
  /**
   * What still stands in this lamp's way, given how high the lamp is hung.
   *
   * A lamp carried to the top of a tower is above the tower, and above most of what stood in
   * its way on the ground. The flat reckoning of whether a spot is lit cannot tell, so what
   * the lamp is over is taken out before it is asked.
   */
  overhead: readonly TallSegment[];
  /** Only what falls within the light's own reach, and still stands in its way. */
  near: readonly TallSegment[];
}

type OccluderSlots = { yes?: LightOccluders; no?: LightOccluders };

const occluderMemo = new WeakMap<VisionScene, WeakMap<SceneLight, OccluderSlots>>();

function occludersOf(scene: VisionScene, light: SceneLight, ignoreShadowCasters: boolean): LightOccluders {
  let byLight = occluderMemo.get(scene);
  if (!byLight) {
    byLight = new WeakMap();
    occluderMemo.set(scene, byLight);
  }
  let held = byLight.get(light);
  if (!held) {
    held = {};
    byLight.set(light, held);
  }
  const slot = ignoreShadowCasters ? 'yes' : 'no';
  const known = held[slot];
  if (known) return known;

  const walls: TallSegment[] = light.ignoreOcclusion ? [] : scene.lightSegments;
  let all: TallSegment[] = walls;
  if (!ignoreShadowCasters && light.castShadows) {
    const shadowSegments: TallSegment[] = [];
    for (const caster of scene.shadowCasters) {
      if (caster.ownerId === light.sourceId) continue;
      shadowSegments.push(...caster.segments);
    }
    if (shadowSegments.length > 0) all = [...walls, ...shadowSegments];
  }

  const overhead = segmentsAbove(all, light.z);
  const built: LightOccluders = {
    all,
    overhead,
    near: cullSegments(
      overhead,
      light.x - light.dimPx,
      light.y - light.dimPx,
      light.x + light.dimPx,
      light.y + light.dimPx
    ),
  };
  held[slot] = built;
  return built;
}

/** The segments that could possibly cross a box, which is most of them thrown away. */
function cullSegments(
  segments: readonly TallSegment[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): TallSegment[] {
  const kept: TallSegment[] = [];
  for (const seg of segments) {
    if (Math.min(seg.x1, seg.x2) > maxX) continue;
    if (Math.max(seg.x1, seg.x2) < minX) continue;
    if (Math.min(seg.y1, seg.y2) > maxY) continue;
    if (Math.max(seg.y1, seg.y2) < minY) continue;
    kept.push(seg);
  }
  return kept;
}

function occludersFor(scene: VisionScene, light: SceneLight, ignoreShadowCasters = false): readonly TallSegment[] {
  return occludersOf(scene, light, ignoreShadowCasters).all;
}

export function lightReaches(
  scene: VisionScene,
  light: SceneLight,
  x: number,
  y: number,
  ignoreShadowCasters = false,
  pz = 0
): boolean {
  if (Math.hypot(x - light.x, y - light.y, pz - light.z) > light.dimPx) return false;
  if (!withinCone(light, x, y, pz)) return false;
  // The point is inside the light's reach, so nothing outside that reach can stand between.
  const occluders = occludersOf(scene, light, ignoreShadowCasters).near;
  if (occluders.length === 0) return true;
  return segmentClearBetween(light.x, light.y, light.z, x, y, pz, occluders);
}

export function lightLevelAt(scene: VisionScene, x: number, y: number, ignoreShadowCasters = false, pz = 0): number {
  let level = clamp01(scene.globalIllumination);
  for (const light of scene.lights) {
    if (!lightReaches(scene, light, x, y, ignoreShadowCasters, pz)) continue;
    const contribution = Math.hypot(x - light.x, y - light.y, pz - light.z) <= light.brightPx ? 1 : 0.5;
    if (contribution > level) level = contribution;
  }
  return level;
}

export function isLit(scene: VisionScene, x: number, y: number, ignoreShadowCasters = false, pz = 0): boolean {
  return lightLevelAt(scene, x, y, ignoreShadowCasters, pz) > 0;
}

export function viewerOwns(viewer: SceneViewer, ownerId: string): boolean {
  if (!ownerId) return false;
  return viewer.visionOwnerIds ? viewer.visionOwnerIds.includes(ownerId) : ownerId === viewer.userId;
}

export function viewerShares(viewer: SceneViewer, ownerId: string, partyId: string | undefined): boolean {
  if (viewerOwns(viewer, ownerId)) return true;
  if (!partyId || !viewer.partyIds) return false;
  return viewer.partyIds.includes(partyId);
}

function ownedSources(scene: VisionScene, viewer: SceneViewer): SceneVisionSource[] {
  return scene.visionSources.filter(
    (source) => viewerShares(viewer, source.owner, source.partyId) && source.type !== VisionType.BLIND
  );
}

export function computeWallSilhouettes(scene: VisionScene, face: WallFace, casterHeightPx: number): WallSilhouette[] {
  const result: WallSilhouette[] = [];
  const dax = face.bx - face.ax;
  const day = face.by - face.ay;
  const len = Math.hypot(dax, day);
  if (len < 1) return result;
  const ux = dax / len;
  const uy = day / len;

  for (const light of scene.lights) {
    if ((light.x - face.ax) * face.nx + (light.y - face.ay) * face.ny <= 0) continue;
    let occluders: LightSegment[] | null = null;
    for (const caster of scene.shadowCasters) {
      if (caster.ownerId === light.sourceId) continue;
      if ((caster.x - face.ax) * face.nx + (caster.y - face.ay) * face.ny <= 0) continue;
      const toLight = Math.hypot(light.x - caster.x, light.y - caster.y);
      let lx = caster.x;
      let ly = caster.y;
      if (toLight > caster.radiusPx) {
        const u = caster.radiusPx / toLight;
        lx = caster.x + (light.x - caster.x) * u;
        ly = caster.y + (light.y - caster.y) * u;
      }
      if (!lightReaches(scene, light, lx, ly, true)) continue;

      const dx = caster.x - light.x;
      const dy = caster.y - light.y;
      const denom = dx * day - dy * dax;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((face.ax - light.x) * day - (face.ay - light.y) * dax) / denom;
      const s = ((face.ax - light.x) * dy - (face.ay - light.y) * dx) / denom;
      if (t <= 1) continue;

      const width = caster.radiusPx * 2 * t;
      const center = s * len;
      if (center + width / 2 <= 0 || center - width / 2 >= len) continue;
      const height = Math.min(casterHeightPx * t, face.heightPx);
      occluders ??= nearbyOccluders(occludersFor(scene, light, true), light, face);
      const at = Math.min(Math.max(center, 0), len);
      if (shadeHeightAt(light, face, occluders, ux, uy, at) >= height) continue;
      result.push({ localX: center, width, height, alpha: 0.75, imageUrl: caster.imageUrl });
    }
  }
  return result;
}

function crossingParam(ax: number, ay: number, bx: number, by: number, seg: Segment): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const sdx = seg.x2 - seg.x1;
  const sdy = seg.y2 - seg.y1;
  const denom = dx * sdy - dy * sdx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((seg.x1 - ax) * sdy - (seg.y1 - ay) * sdx) / denom;
  const u = ((seg.x1 - ax) * dy - (seg.y1 - ay) * dx) / denom;
  if (t <= 1e-9 || t >= 1 || u < 0 || u > 1) return null;
  return t;
}

/**
 * How high the shade reaches on the face, where the light stands at `along`.
 *
 * A ray from the light to a point on the face climbs as the point does, so what it clears
 * is a matter of how tall the thing in the way is: a low wall shades only the foot of a
 * tall one behind it.
 */
function shadeHeightAt(
  light: SceneLight,
  face: WallFace,
  occluders: readonly LightSegment[],
  ux: number,
  uy: number,
  along: number
): number {
  const x = face.ax + ux * along + face.nx * WALL_FACE_OFFSET_PX;
  const y = face.ay + uy * along + face.ny * WALL_FACE_OFFSET_PX;
  if (Math.hypot(x - light.x, y - light.y, light.z) > light.dimPx) return Infinity;
  if (!withinCone(light, x, y)) return Infinity;
  let shade = 0;
  for (const seg of occluders) {
    const t = crossingParam(light.x, light.y, x, y, seg);
    if (t === null) continue;
    if (seg.heightPx === undefined) return Infinity;
    const reached = light.z + (seg.heightPx - light.z) / t;
    if (reached > shade) shade = reached;
  }
  return shade;
}

function nearbyOccluders(occluders: readonly LightSegment[], light: SceneLight, face: WallFace): LightSegment[] {
  const minX = Math.min(light.x, face.ax, face.bx);
  const maxX = Math.max(light.x, face.ax, face.bx);
  const minY = Math.min(light.y, face.ay, face.by);
  const maxY = Math.max(light.y, face.ay, face.by);
  return occluders.filter(
    (s) =>
      Math.min(s.x1, s.x2) <= maxX &&
      Math.max(s.x1, s.x2) >= minX &&
      Math.min(s.y1, s.y2) <= maxY &&
      Math.max(s.y1, s.y2) >= minY
  );
}

function litFootAt(
  light: SceneLight,
  face: WallFace,
  occluders: readonly LightSegment[],
  ux: number,
  uy: number,
  along: number
): number {
  const shade = shadeHeightAt(light, face, occluders, ux, uy, along);
  if (!(shade > 0)) return face.heightPx;
  if (!(shade < face.heightPx)) return 0;
  return face.heightPx - shade;
}

function pruneFlat(line: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of line) {
    while (kept.length >= 2) {
      const a = kept[kept.length - 2];
      const b = kept[kept.length - 1];
      const span = point.x - a.x;
      const between = span > 1e-9 ? a.y + ((point.y - a.y) * (b.x - a.x)) / span : b.y;
      if (Math.abs(between - b.y) > WALL_LIGHT_FLAT_PX) break;
      kept.pop();
    }
    kept.push(point);
  }
  return kept;
}

/**
 * The foot of the lit part of the face, followed across the stretch the pool covers.
 *
 * Asking only where the light stands square to the face answers for a point that can sit off
 * the end of it, so a wall around the corner would be lit through whatever hides it.
 */
function faceShadowLine(
  light: SceneLight,
  face: WallFace,
  occluders: readonly LightSegment[],
  ux: number,
  uy: number,
  from: number,
  to: number
): Point[] {
  const count = Math.min(
    WALL_LIGHT_MAX_SAMPLES,
    Math.max(WALL_LIGHT_MIN_SAMPLES, Math.ceil((to - from) / WALL_LIGHT_SAMPLE_STEP_PX) + 1)
  );
  const line: Point[] = [];
  let previous = { x: from, y: 0 };
  for (let i = 0; i < count; i++) {
    const at = from + ((to - from) * i) / (count - 1);
    const point = { x: at, y: litFootAt(light, face, occluders, ux, uy, at) };
    if (i > 0 && Math.abs(point.y - previous.y) > WALL_LIGHT_EDGE_JUMP_PX) {
      let low = previous;
      let high = point;
      for (let step = 0; step < WALL_LIGHT_EDGE_STEPS; step++) {
        const mid = (low.x + high.x) / 2;
        const y = litFootAt(light, face, occluders, ux, uy, mid);
        if (Math.abs(y - low.y) < Math.abs(y - high.y)) low = { x: mid, y };
        else high = { x: mid, y };
      }
      line.push(low, high);
    }
    line.push(point);
    previous = point;
  }
  return pruneFlat(line);
}

export function computeWallLights(scene: VisionScene, face: WallFace): WallLight[] {
  const result: WallLight[] = [];
  const dax = face.bx - face.ax;
  const day = face.by - face.ay;
  const len = Math.hypot(dax, day);
  if (len < 1) return result;
  const ux = dax / len;
  const uy = day / len;

  for (const light of scene.lights) {
    const rel = (light.x - face.ax) * face.nx + (light.y - face.ay) * face.ny;
    if (rel <= 0 || rel > light.dimPx) continue;
    const half = Math.sqrt(Math.max(0, light.dimPx * light.dimPx - rel * rel));
    if (half < 1) continue;
    const along = (light.x - face.ax) * ux + (light.y - face.ay) * uy;
    const from = Math.max(0, along - half);
    const to = Math.min(len, along + half);
    if (to - from < 1) continue;

    const occluders = nearbyOccluders(occludersFor(scene, light, true), light, face);
    const line = faceShadowLine(light, face, occluders, ux, uy, from, to);
    if (line.every((point) => point.y <= 0)) continue;
    const pool: WallLight = {
      localX: along,
      localY: face.heightPx - light.z,
      radiusX: half,
      radiusY: half,
      color: light.color,
      intensity: rel <= light.brightPx ? 1 : 0.6,
    };
    result.push(line.every((point) => point.y >= face.heightPx) ? pool : { ...pool, shadow: line });
  }
  return result;
}

export function darknessAlphaFor(scene: VisionScene, viewer: SceneViewer): number {
  if (!scene.darknessEnabled) return 0;
  const global = clamp01(scene.globalIllumination);
  const base = clamp01(scene.darknessLevel) * (1 - global);
  return viewer.isGameMaster ? base * GM_DIM_FACTOR : base;
}

export function isPointVisible(scene: VisionScene, x: number, y: number, viewer: SceneViewer, z = 0): boolean {
  if (viewer.isGameMaster) return true;
  return isPointVisibleFrom(scene, x, y, ownedSources(scene, viewer), z);
}

/**
 * A table with the dark switched off has nothing to be lit by, so everything counts as lit and
 * what is left to settle a look is the walls in the way and which way the piece is facing.
 */
export function isPointVisibleFrom(
  scene: VisionScene,
  x: number,
  y: number,
  sources: readonly SceneVisionSource[],
  z = 0
): boolean {
  const lit = !scene.darknessEnabled || isLit(scene, x, y, true, z);
  if (sources.length === 0) return lit;

  for (const source of sources) {
    const scale = visionLobeScale(source.lobes, source.direction, source.x, source.y, x, y);
    if (scale <= 0) continue;
    // The range on a piece is how far it sees with nothing to see by. Ground a lamp reaches
    // is seen as far as the lamp carries, so a torch-bearer with two cells of night sight
    // still sees the whole of the room its torch lights. With no dark on the table there is
    // nothing to see by or without, and the range is the whole of the limit.
    const withinRange = source.rangePx > 0 && distance(x, y, source.x, source.y) <= source.rangePx * scale;
    if (!scene.darknessEnabled && source.rangePx > 0 && !withinRange) continue;
    if (source.type === VisionType.TRUESIGHT && withinRange) return true;
    const between = segmentsAbove(scene.sightSegments, source.z);
    if (!segmentClearBetween(source.x, source.y, source.z, x, y, z, between)) continue;
    if (lit) return true;
    if (seesInDark(source.type) && withinRange) return true;
  }
  return false;
}

/** What a thing is worth to the eye before any light falls on it. */
const SEEN_BRIGHTNESS = 0.4;

/**
 * How much of a light is left at a distance from it.
 *
 * Full out to the bright radius, then away to nothing at the edge of the dim one. The middle
 * of that fall is a half, which is what the whole ring used to be worth.
 */
function lightFalloff(reach: number, brightPx: number, dimPx: number): number {
  if (reach <= brightPx) return 1;
  const ring = dimPx - brightPx;
  if (ring <= 0) return 0;
  return clamp01(1 - (reach - brightPx) / ring);
}

export function objectLightLevel(
  scene: VisionScene,
  x: number,
  y: number,
  radiusPx: number,
  ignoreShadowCasters = false,
  pz = 0
): number {
  let level = clamp01(scene.globalIllumination);
  for (const light of scene.lights) {
    // The surface the thing is standing on, which is what the light has to reach across.
    const pool = lightFloorPool(light, pz);
    if (!pool) continue;
    const dx = pool.cx - x;
    const dy = pool.cy - y;
    const dist = Math.hypot(dx, dy);
    if (dist - radiusPx > pool.dimPx) continue;
    let sx = x;
    let sy = y;
    if (radiusPx > 0 && dist > radiusPx) {
      const u = radiusPx / dist;
      sx = x + dx * u;
      sy = y + dy * u;
    }
    if (!lightReaches(scene, light, sx, sy, ignoreShadowCasters, pz)) continue;
    const contribution = lightFalloff(Math.hypot(pool.cx - sx, pool.cy - sy), pool.brightPx, pool.dimPx);
    if (contribution > level) level = contribution;
  }
  return level;
}

export function objectBrightnessFor(
  scene: VisionScene,
  viewer: SceneViewer,
  x: number,
  y: number,
  radiusPx: number,
  ignoreShadowCasters = false,
  pz = 0
): number {
  const base = 1 - darknessAlphaFor(scene, viewer);
  // Nothing below can come out under the base, so a table with no dark in it is at full
  // brightness wherever the light and the sight lines happen to fall.
  if (base >= 1) return 1;
  const level = objectLightLevel(scene, x, y, radiusPx, ignoreShadowCasters, pz);
  if (level >= 1) return 1;
  // Lit or merely in sight, a thing is worth four tenths before any light is added to it, and
  // the light carries it the rest of the way. Nothing in between is a step.
  const lit = level > 0 || isPointVisible(scene, x, y, viewer, pz);
  const floor = lit ? SEEN_BRIGHTNESS : base;
  return Math.max(base, floor + (1 - floor) * level);
}

function lightClipPolygon(scene: VisionScene, light: SceneLight, radius: number = light.dimPx): Point[] | undefined {
  const occluders = occludersOf(scene, light, true).overhead;
  if (occluders.length === 0) return undefined;
  return computeVisibilityPolygon(light.x, light.y, occluders, radius, LIGHT_SAMPLE_COUNT);
}

function coneFloorFootprint(
  scene: VisionScene,
  light: SceneLight
): { cx: number; cy: number; maxR: number; points: Point[] } | null {
  const pool = lightFloorPool(light);
  if (!pool) return null;
  const { cx, cy } = pool;
  // The pool can sit off to one side of the light, so the box has to hold both.
  const occluders = cullSegments(
    occludersOf(scene, light, true).overhead,
    Math.min(light.x, cx - light.dimPx),
    Math.min(light.y, cy - light.dimPx),
    Math.max(light.x, cx + light.dimPx),
    Math.max(light.y, cy + light.dimPx)
  );
  const points: Point[] = [];
  let maxR = 0;
  for (let i = 0; i < LIGHT_SAMPLE_COUNT; i++) {
    const a = (i / LIGHT_SAMPLE_COUNT) * TWO_PI;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let lo = 0;
    let hi = light.dimPx;
    for (let it = 0; it < 16; it++) {
      const mid = (lo + hi) / 2;
      const px = cx + dx * mid;
      const py = cy + dy * mid;
      const inCone = withinCone(light, px, py, 0);
      const inReach = Math.hypot(px - light.x, py - light.y, light.z) <= light.dimPx;
      const clear = occluders.length === 0 || segmentClear(light.x, light.y, px, py, occluders);
      if (inCone && inReach && clear) lo = mid;
      else hi = mid;
    }
    points.push({ x: cx + dx * lo, y: cy + dy * lo });
    if (lo > maxR) maxR = lo;
  }
  if (maxR < 1) return null;
  return { cx, cy, maxR, points };
}

function lightOverlayShape(scene: VisionScene, light: SceneLight): OverlayShape | null {
  if (light.angle < 360) {
    const fp = coneFloorFootprint(scene, light);
    if (!fp) return null;
    const ratio = light.dimPx > 0 ? light.brightPx / light.dimPx : 1;
    return {
      x: fp.cx,
      y: fp.cy,
      brightPx: fp.maxR * ratio,
      dimPx: fp.maxR,
      angle: 360,
      direction: 0,
      color: light.color,
      full: false,
      clipPolygon: fp.points,
      animation: light.animation,
    };
  }
  const { brightFloor, dimFloor } = floorRadii(light);
  if (dimFloor < 1) return null;
  return {
    x: light.x,
    y: light.y,
    brightPx: brightFloor,
    dimPx: dimFloor,
    angle: 360,
    direction: 0,
    color: light.color,
    full: false,
    clipPolygon: lightClipPolygon(scene, light, dimFloor),
    animation: light.animation,
  };
}

function addLightShadows(
  scene: VisionScene,
  light: SceneLight,
  clipPolygon: Point[] | undefined,
  shadows: ShadowShape[]
): void {
  for (const caster of scene.shadowCasters) {
    if (caster.ownerId === light.sourceId) continue;
    const dx = caster.x - light.x;
    const dy = caster.y - light.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1 || dist - caster.radiusPx > light.dimPx) continue;
    if (!withinCone(light, caster.x, caster.y)) continue;
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy;
    const py = ux;
    const len = Math.max(caster.radiusPx * 2, light.dimPx - dist);
    const nearR = caster.radiusPx;
    const farR = caster.radiusPx * SHADOW_SPREAD;
    const fx = caster.x + ux * len;
    const fy = caster.y + uy * len;
    shadows.push({
      x: caster.x,
      y: caster.y,
      fx,
      fy,
      width: caster.radiusPx * 2,
      color: scene.ambientColor,
      imageUrl: caster.imageUrl,
      points: [
        { x: caster.x + px * nearR, y: caster.y + py * nearR },
        { x: fx + px * farR, y: fy + py * farR },
        { x: fx - px * farR, y: fy - py * farR },
        { x: caster.x - px * nearR, y: caster.y - py * nearR },
      ],
      clipPolygon,
    });
  }
}

export function computeOverlayPlan(scene: VisionScene, viewer: SceneViewer, vision?: OverlayVision): OverlayPlan {
  const glows: OverlayShape[] = [];
  const reveals: OverlayShape[] = [];
  const shadows: ShadowShape[] = [];
  const isGm = viewer.isGameMaster;
  const global = clamp01(scene.globalIllumination);

  for (const light of scene.lights) {
    const shape = lightOverlayShape(scene, light);
    if (!shape) continue;
    reveals.push(shape);
    glows.push(shape);
    if (light.castShadows) addLightShadows(scene, light, shape.clipPolygon, shadows);
  }

  if (!isGm) {
    for (const source of ownedSources(scene, viewer)) {
      if (!seesInDark(source.type) || source.rangePx <= 0) continue;
      const reach = source.rangePx * maxLobeScale(source.lobes);
      if (reach < 1) continue;
      const clipPolygon =
        source.type === VisionType.TRUESIGHT
          ? undefined
          : computeVisibilityPolygon(
              source.x,
              source.y,
              segmentsAbove(scene.sightSegments, source.z),
              reach,
              VISION_SAMPLE_COUNT
            );
      for (const lobe of source.lobes) {
        const radius = source.rangePx * lobe.rangeScale;
        if (radius < 1) continue;
        const shape: OverlayShape = {
          x: source.x,
          y: source.y,
          brightPx: radius,
          dimPx: radius,
          angle: lobe.angle,
          direction: source.direction + lobe.direction,
          color: scene.ambientColor,
          full: true,
          clipPolygon,
        };
        reveals.push(shape);
        if (source.type === VisionType.THERMAL) glows.push({ ...shape, color: THERMAL_COLOR, full: false });
      }
    }
  }

  return {
    darknessAlpha: darknessAlphaFor(scene, viewer),
    darknessColor: scene.ambientColor,
    baseRevealAlpha: global,
    reveals,
    revealCells: scene.snapLightToGrid
      ? computeLitCells(reveals, scene.gridSize, scene.gridType ?? GridType.SQUARE, {
          widthPx: scene.widthPx,
          heightPx: scene.heightPx,
        })
      : [],
    glows,
    shadows,
    vision,
  };
}
