import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { perimeterSegments, rectangleSegments, TallSegment } from '@axe/domain/tabletop/los/segments';
import { type SurfaceDims, surfaceInwardDirection, surfacePointTo3D } from '@axe/domain/tabletop/surface-space';
import { lightSourcesOn } from '@axe/domain/tabletop/table-lights';
import { surfaceOf, TableSurface, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { terrainBasePx, terrainTopPx } from '@axe/domain/tabletop/terrain-height';
import {
  eyeHeightPx,
  type LightSegment,
  type SceneLight,
  type SceneVisionSource,
  type ShadowCaster,
  type VisionScene,
} from '@axe/domain/tabletop/vision-scene';
import { visionLobesOf } from '@axe/domain/tabletop/vision-shape';
import { LightSpec, VisionType } from '@axe/domain/tabletop/vision-types';

const WALL_LIGHT_INSET_CELLS = 0.4;

export interface StandingSegments {
  sight: TallSegment[];
  light: LightSegment[];
}

export function collectSegments(
  table: GameTable,
  gridSize: number,
  widthPx: number,
  heightPx: number
): StandingSegments {
  const sight: TallSegment[] = [...perimeterSegments(widthPx, heightPx)];
  const light: LightSegment[] = [];
  const wallHeightPx = table.wallHeight * gridSize;
  const north: LightSegment = { x1: 0, y1: 0, x2: widthPx, y2: 0, heightPx: wallHeightPx };
  const south: LightSegment = { x1: 0, y1: heightPx, x2: widthPx, y2: heightPx, heightPx: wallHeightPx };
  const west: LightSegment = { x1: 0, y1: 0, x2: 0, y2: heightPx, heightPx: wallHeightPx };
  const east: LightSegment = { x1: widthPx, y1: 0, x2: widthPx, y2: heightPx, heightPx: wallHeightPx };
  if (table.showNorthWall) light.push(north);
  if (table.showSouthWall) light.push(south);
  if (table.showWestWall) light.push(west);
  if (table.showEastWall) light.push(east);

  for (const terrain of table.terrains) {
    if (!terrain.hasWall || surfaceOf(terrain) !== 'floor') continue;
    const edges = rectangleSegments(
      terrain.location.x,
      terrain.location.y,
      terrain.width * gridSize,
      terrain.depth * gridSize,
      terrain.rotate
    );
    const top = terrainTopPx(terrain, gridSize);
    const base = terrainBasePx(terrain, gridSize);
    if (terrain.blocksSightNow) for (const edge of edges) sight.push({ ...edge, heightPx: top, basePx: base });
    if (terrain.blocksLightNow && !terrain.lightEnabled) {
      for (const edge of edges) light.push({ ...edge, heightPx: top, basePx: base });
    }
  }
  return { sight, light };
}

export function toSceneLight(
  spec: LightSpec,
  x: number,
  y: number,
  z: number,
  gridSize: number,
  sourceId: string,
  dirOverride: number | null = null,
  surface: TableSurface = 'floor'
): SceneLight {
  const dim = Math.max(spec.brightRadius, spec.dimRadius);
  return {
    x,
    y,
    z,
    brightPx: spec.brightRadius * gridSize,
    dimPx: dim * gridSize,
    color: spec.color,
    angle: spec.angle,
    direction: dirOverride ?? spec.direction,
    pitch: spec.pitch,
    revealToAll: spec.revealToAll,
    castShadows: spec.castShadows,
    ignoreOcclusion: spec.ignoreOcclusion,
    animation: spec.animation,
    sourceId,
    surface,
  };
}

function placeLight(obj: TabletopObject, centerX: number, centerY: number, gridSize: number, dims: SurfaceDims) {
  const surface = surfaceOf(obj);
  if (surface === 'floor') {
    const h = eyeHeightPx(obj.altitude, obj.posZ, gridSize);
    return {
      pos: surfacePointTo3D('floor', obj.location.x + centerX, obj.location.y + centerY, dims, h),
      dir: null,
      surface,
    };
  }
  return {
    pos: surfacePointTo3D(
      surface,
      obj.location.x + centerX,
      obj.location.y + centerY,
      dims,
      WALL_LIGHT_INSET_CELLS * gridSize
    ),
    dir: surfaceInwardDirection(surface),
    surface,
  };
}

export function collectLights(
  table: GameTable,
  characters: readonly GameCharacter[],
  gridSize: number,
  characterOf: (identifier: string) => GameCharacter | null
): SceneLight[] {
  const lights: SceneLight[] = [];
  const half = gridSize / 2;
  const dims: SurfaceDims = {
    widthPx: table.width * gridSize,
    depthPx: table.height * gridSize,
    wallHeightPx: table.wallHeight * gridSize,
  };

  for (const source of lightSourcesOn(table)) {
    if (!source.lightEnabled) continue;
    const followed = source.followingCharacterIdentifier ? characterOf(source.followingCharacterIdentifier) : null;
    const anchor = followed && followed.isVisibleOnTable ? followed : source;
    const center = followed && followed.isVisibleOnTable ? (gridSize * (followed.size || 1)) / 2 : half;
    const p = placeLight(anchor, center, center, gridSize, dims);
    lights.push(
      toSceneLight(source.lightSpec, p.pos.x, p.pos.y, p.pos.z, gridSize, source.identifier, p.dir, p.surface)
    );
  }

  for (const character of characters) {
    if (!character.isVisibleOnTable || !character.lightEnabled) continue;
    const center = (gridSize * (character.size || 1)) / 2;
    const p = placeLight(character, center, center, gridSize, dims);
    lights.push(
      toSceneLight(character.lightSpec, p.pos.x, p.pos.y, p.pos.z, gridSize, character.identifier, p.dir, p.surface)
    );
  }

  for (const terrain of table.terrains) {
    if (!terrain.lightEnabled) continue;
    const cx = (terrain.width * gridSize) / 2;
    const cy = (terrain.depth * gridSize) / 2;
    const p = placeLight(terrain, cx, cy, gridSize, dims);
    lights.push(
      toSceneLight(terrain.lightSpec, p.pos.x, p.pos.y, p.pos.z, gridSize, terrain.identifier, p.dir, p.surface)
    );
  }
  return lights;
}

export function collectShadowCasters(characters: readonly GameCharacter[], gridSize: number): ShadowCaster[] {
  const casters: ShadowCaster[] = [];
  for (const character of characters) {
    if (!character.isVisibleOnTable || !character.castsShadow) continue;
    if (surfaceOf(character) !== 'floor') continue;
    const size = (character.size || 1) * gridSize;
    const half = size / 2;
    casters.push({
      ownerId: character.identifier,
      x: character.location.x + half,
      y: character.location.y + half,
      radiusPx: half,
      segments: rectangleSegments(character.location.x, character.location.y, size, size, 0),
      imageUrl: character.imageFile?.url ?? '',
    });
  }
  return casters;
}

export function collectVisionSources(characters: readonly GameCharacter[], gridSize: number): SceneVisionSource[] {
  const sources: SceneVisionSource[] = [];
  for (const character of characters) {
    if (!character.isVisibleOnTable) continue;
    if (surfaceOf(character) !== 'floor') continue;
    const center = (gridSize * (character.size || 1)) / 2;
    const spec = character.visionSpec;
    sources.push({
      x: character.location.x + center,
      y: character.location.y + center,
      z: eyeHeightPx(character.altitude, character.posZ, gridSize),
      type: character.visionType as VisionType,
      rangePx: character.visionRange * gridSize,
      owner: character.owner,
      isNpc: character.isNpc,
      partyId: character.partyIdentifier,
      sourceId: character.identifier,
      direction: spec.direction,
      lobes: visionLobesOf(spec),
    });
  }
  return sources;
}

export function assembleScene(
  table: GameTable,
  characters: readonly GameCharacter[],
  standing: StandingSegments,
  characterOf: (identifier: string) => GameCharacter | null
): VisionScene {
  const gridSize = table.gridSize;
  return {
    darknessEnabled: table.darknessEnabled,
    fogEnabled: table.fogEnabled,
    darknessLevel: table.darknessLevel,
    ambientColor: table.ambientColor,
    globalIllumination: table.globalIllumination,
    gridSize,
    gridType: table.gridType,
    snapLightToGrid: table.lightSnapToGrid,
    widthPx: table.width * gridSize,
    heightPx: table.height * gridSize,
    lights: collectLights(table, characters, gridSize, characterOf),
    visionSources: collectVisionSources(characters, gridSize),
    sightSegments: standing.sight,
    lightSegments: standing.light,
    shadowCasters: collectShadowCasters(characters, gridSize),
  };
}
