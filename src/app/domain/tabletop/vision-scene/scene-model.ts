import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { Point, Segment, TallSegment } from '@axe/domain/tabletop/los/segments';
import type { TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { VisionLobe } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

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
  /** The patches of the board lit or put out on their own account. Left out, there are none. */
  brightAreas?: SceneBrightness[];
}

/**
 * A patch of the board held at a brightness of its own, whatever the rest of the table is lit by.
 *
 * A floor under the light where it brightens and a ceiling over it where it darkens, so a pool
 * of magical darkness stays dark under a lamp while a shaft of daylight lights a cellar.
 */
export interface SceneBrightness {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  level: number;
  /** Whether it puts light out rather than adding to it. */
  snuffs: boolean;
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
  /** Where the light hangs that throws the beam, in table pixels. */
  origin: { x: number; y: number; z: number };
}

export interface LightGlow {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  transform: string | null;
}
