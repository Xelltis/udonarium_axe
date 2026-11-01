import { ImageFile } from '@axe/core/storage/image-file';
import { ambienceDensityOf } from '@axe/domain/effect/ambience/ambience-kind';
import { parseCutInIdentifiers } from '@axe/domain/media/table-cut-in';
import type { BoardScene } from '@axe/domain/scene/board-scene';
import { FilterType, type GameTable } from '@axe/domain/tabletop/game-table';
import { foregroundFitOf, foregroundOpacityOf } from '@axe/domain/tabletop/table-foreground';

/** What a scene writes in a picture's place to take the picture away. */
export const SCENE_NO_PICTURE = 'none';

export const SCENE_WALL_SIDES = ['north', 'east', 'south', 'west'] as const;
export type SceneWallSide = (typeof SCENE_WALL_SIDES)[number];

/** The parts a scene may change, in the order they are listed and put on. */
export const BOARD_SCENE_PARTS = [
  'table',
  'floor',
  'background',
  'walls',
  'foreground',
  'weather',
  'darkness',
  'fog',
  'bgm',
  'bgs',
  'cutIn',
  'clock',
  'text',
  'fade',
] as const;
export type BoardScenePart = (typeof BOARD_SCENE_PARTS)[number];

/** Every field a scene holds of its own, which a copy of it takes over. */
export const BOARD_SCENE_FIELDS = [
  'name',
  'folderName',
  'order',
  'tableIdentifier',
  'tableName',
  'floorImageIdentifier',
  'backgroundImageIdentifier',
  'backgroundFilter',
  'northWallImageIdentifier',
  'eastWallImageIdentifier',
  'southWallImageIdentifier',
  'westWallImageIdentifier',
  'wallsShown',
  'foregroundImageIdentifier',
  'foregroundOpacity',
  'foregroundFit',
  'weather',
  'darkness',
  'fog',
  'bgm',
  'bgmIdentifier',
  'bgmPlaylistIdentifier',
  'bgmPlaylistName',
  'bgs',
  'bgsIdentifiers',
  'cutInIdentifiers',
  'clockPeriod',
  'text',
  'textTab',
  'fade',
] as const satisfies readonly (keyof BoardScene)[];
export type BoardSceneFields = Pick<BoardScene, (typeof BOARD_SCENE_FIELDS)[number]>;

/** The fields of a scene that say how the table looks, which the look of a table is caught in. */
export type BoardSceneLookFields = Pick<
  BoardSceneFields,
  | 'floorImageIdentifier'
  | 'backgroundImageIdentifier'
  | 'backgroundFilter'
  | 'northWallImageIdentifier'
  | 'eastWallImageIdentifier'
  | 'southWallImageIdentifier'
  | 'westWallImageIdentifier'
  | 'wallsShown'
  | 'foregroundImageIdentifier'
  | 'foregroundOpacity'
  | 'foregroundFit'
  | 'weather'
  | 'darkness'
  | 'fog'
>;

/** The fields of a table a scene writes. */
export type SceneTableFields = Pick<
  GameTable,
  | 'imageIdentifier'
  | 'backgroundImageIdentifier'
  | 'backgroundFilterType'
  | 'northWallImageIdentifier'
  | 'eastWallImageIdentifier'
  | 'southWallImageIdentifier'
  | 'westWallImageIdentifier'
  | 'showNorthWall'
  | 'showEastWall'
  | 'showSouthWall'
  | 'showWestWall'
  | 'foregroundImageIdentifier'
  | 'foregroundOpacity'
  | 'foregroundFit'
  | 'weatherKind'
  | 'weatherColor'
  | 'weatherDensity'
  | 'darknessEnabled'
  | 'fogEnabled'
>;

const WALL_IMAGE_FIELD = {
  north: 'northWallImageIdentifier',
  east: 'eastWallImageIdentifier',
  south: 'southWallImageIdentifier',
  west: 'westWallImageIdentifier',
} as const satisfies Record<SceneWallSide, keyof BoardSceneFields & keyof SceneTableFields>;

const WALL_SHOWN_FIELD = {
  north: 'showNorthWall',
  east: 'showEastWall',
  south: 'showSouthWall',
  west: 'showWestWall',
} as const satisfies Record<SceneWallSide, keyof SceneTableFields>;

/** The music a scene puts on: none, a track, or a playlist from its first track. */
export type SceneBgm =
  | { readonly mode: 'stop' }
  | { readonly mode: 'track'; readonly identifier: string }
  | { readonly mode: 'playlist'; readonly identifier: string; readonly name: string };

/** The background sounds a scene leaves playing: just those it names, or none at all. */
export type SceneBgs =
  { readonly mode: 'replace'; readonly identifiers: readonly string[] } | { readonly mode: 'stop' };

/** The weather a scene lays: its kind, empty for a clear sky, its colour and how thick it is. */
export interface SceneWeather {
  readonly kind: string;
  readonly color: string;
  readonly density: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : `${value ?? ''}`.trim();
}

/** Whether a table holds no picture in a place: none chosen, or the empty one picked. */
export function isNoTablePicture(identifier: unknown): boolean {
  const held = text(identifier);
  return held.length < 1 || held === 'imageIdentifier' || held === ImageFile.Empty.identifier;
}

/** How a scene writes a table's picture: the picture, or `none` for a table that has none. */
function scenePictureOf(identifier: unknown): string {
  return isNoTablePicture(identifier) ? SCENE_NO_PICTURE : text(identifier);
}

/**
 * The picture a scene puts in a place: undefined where it leaves the place alone, null where it
 * takes the picture away, and the picture's identifier otherwise.
 */
export function scenePictureIn(value: unknown): string | null | undefined {
  const held = text(value);
  if (held.length < 1) return undefined;
  return held === SCENE_NO_PICTURE ? null : held;
}

/** A scene's on-or-off part: undefined where it leaves it alone. */
export function sceneToggleOf(value: unknown): boolean | undefined {
  const held = text(value);
  return held === 'on' ? true : held === 'off' ? false : undefined;
}

/** The tint a scene lays over the background, or undefined where it leaves it alone. */
export function sceneBackgroundFilterOf(value: unknown): FilterType | undefined {
  const held = text(value);
  if (held === 'none') return FilterType.NONE;
  if (held === FilterType.WHITE || held === FilterType.BLACK) return held;
  return undefined;
}

/** Which walls a scene stands or takes down, by side, the sides it leaves alone left out. */
export function sceneWallsShownOf(value: unknown): Partial<Record<SceneWallSide, boolean>> {
  const parsed = parseJsonObject(value);
  const shown: Partial<Record<SceneWallSide, boolean>> = {};
  for (const side of SCENE_WALL_SIDES) {
    if (typeof parsed?.[side] === 'boolean') shown[side] = parsed[side];
  }
  return shown;
}

/** The weather a scene lays, or null where it leaves the sky alone. */
export function sceneWeatherOf(value: unknown): SceneWeather | null {
  const parsed = parseJsonObject(value);
  if (!parsed) return null;
  return {
    kind: typeof parsed['kind'] === 'string' ? parsed['kind'] : '',
    color: typeof parsed['color'] === 'string' ? parsed['color'] : '',
    density: ambienceDensityOf(parsed['density'] as number),
  };
}

/** The music a scene puts on, or null where it leaves the music alone or names nothing to play. */
export function sceneBgmOf(
  scene: Pick<BoardSceneFields, 'bgm' | 'bgmIdentifier' | 'bgmPlaylistIdentifier' | 'bgmPlaylistName'>
): SceneBgm | null {
  const mode = text(scene.bgm);
  if (mode === 'stop') return { mode };
  if (mode === 'track') {
    const identifier = text(scene.bgmIdentifier);
    return identifier ? { mode, identifier } : null;
  }
  if (mode === 'playlist') {
    const identifier = text(scene.bgmPlaylistIdentifier);
    const name = text(scene.bgmPlaylistName);
    return identifier || name ? { mode, identifier, name } : null;
  }
  return null;
}

/** The background sounds a scene leaves playing, or null where it leaves them alone. */
export function sceneBgsOf(scene: Pick<BoardSceneFields, 'bgs' | 'bgsIdentifiers'>): SceneBgs | null {
  const mode = text(scene.bgs);
  if (mode === 'stop') return { mode };
  if (mode === 'replace') return { mode, identifiers: parseCutInIdentifiers(text(scene.bgsIdentifiers)) };
  return null;
}

/** Which part of the day a scene puts the story's clock at, or null where it leaves the clock alone. */
export function scenePeriodOf(value: unknown): number | null {
  const held = text(value);
  return /^\d{1,2}$/.test(held) ? Number(held) : null;
}

/** The parts a scene changes, in the order they are listed. */
export function scenePartsOf(scene: BoardSceneFields): BoardScenePart[] {
  const changes: Record<BoardScenePart, boolean> = {
    table: text(scene.tableIdentifier).length > 0 || text(scene.tableName).length > 0,
    floor: scenePictureIn(scene.floorImageIdentifier) !== undefined,
    background:
      scenePictureIn(scene.backgroundImageIdentifier) !== undefined ||
      sceneBackgroundFilterOf(scene.backgroundFilter) !== undefined,
    walls:
      SCENE_WALL_SIDES.some((side) => scenePictureIn(scene[WALL_IMAGE_FIELD[side]]) !== undefined) ||
      Object.keys(sceneWallsShownOf(scene.wallsShown)).length > 0,
    foreground: scenePictureIn(scene.foregroundImageIdentifier) !== undefined,
    weather: sceneWeatherOf(scene.weather) !== null,
    darkness: sceneToggleOf(scene.darkness) !== undefined,
    fog: sceneToggleOf(scene.fog) !== undefined,
    bgm: sceneBgmOf(scene) !== null,
    bgs: sceneBgsOf(scene) !== null,
    cutIn: parseCutInIdentifiers(text(scene.cutInIdentifiers)).length > 0,
    clock: scenePeriodOf(scene.clockPeriod) !== null,
    text: text(scene.text).length > 0,
    fade: text(scene.fade) === 'true',
  };
  return BOARD_SCENE_PARTS.filter((part) => changes[part]);
}

/**
 * What putting a scene on writes to a table: the fields of the parts the scene changes, and of
 * those only the ones that differ, so that a table already looking the part is left untouched.
 */
export function sceneTableWrites(scene: BoardSceneLookFields, table: SceneTableFields): Partial<SceneTableFields> {
  const writes: Partial<Record<keyof SceneTableFields, unknown>> = {};
  const put = <K extends keyof SceneTableFields>(key: K, value: SceneTableFields[K]) => {
    if (table[key] !== value) writes[key] = value;
  };
  const putPicture = (key: keyof SceneTableFields, value: unknown, none: string) => {
    const picture = scenePictureIn(value);
    if (picture === undefined) return;
    const held = picture ?? none;
    if (picture === null ? !isNoTablePicture(table[key]) : table[key] !== held) writes[key] = held;
  };

  putPicture('imageIdentifier', scene.floorImageIdentifier, ImageFile.Empty.identifier);
  putPicture('backgroundImageIdentifier', scene.backgroundImageIdentifier, ImageFile.Empty.identifier);
  const filter = sceneBackgroundFilterOf(scene.backgroundFilter);
  if (filter !== undefined) put('backgroundFilterType', filter);
  for (const side of SCENE_WALL_SIDES) {
    putPicture(WALL_IMAGE_FIELD[side], scene[WALL_IMAGE_FIELD[side]], ImageFile.Empty.identifier);
  }
  const shown = sceneWallsShownOf(scene.wallsShown);
  for (const side of SCENE_WALL_SIDES) {
    const stands = shown[side];
    if (stands !== undefined) put(WALL_SHOWN_FIELD[side], stands);
  }
  const foreground = scenePictureIn(scene.foregroundImageIdentifier);
  if (foreground !== undefined) {
    putPicture('foregroundImageIdentifier', scene.foregroundImageIdentifier, '');
    if (foreground !== null) {
      if (text(scene.foregroundOpacity).length > 0) {
        const opacity = foregroundOpacityOf(scene.foregroundOpacity);
        if (foregroundOpacityOf(table.foregroundOpacity) !== opacity) writes.foregroundOpacity = opacity;
      }
      if (text(scene.foregroundFit).length > 0) {
        const fit = foregroundFitOf(scene.foregroundFit);
        if (foregroundFitOf(table.foregroundFit) !== fit) writes.foregroundFit = fit;
      }
    }
  }
  const weather = sceneWeatherOf(scene.weather);
  if (weather) {
    put('weatherKind', weather.kind);
    put('weatherColor', weather.color);
    if (ambienceDensityOf(table.weatherDensity) !== weather.density) writes.weatherDensity = weather.density;
  }
  const darkness = sceneToggleOf(scene.darkness);
  if (darkness !== undefined) put('darknessEnabled', darkness);
  const fog = sceneToggleOf(scene.fog);
  if (fog !== undefined) put('fogEnabled', fog);
  return writes as Partial<SceneTableFields>;
}

/**
 * How a table looks, as the fields of a scene, every part of it: a picture it lacks is written as
 * taken away, so that the scene puts the table back just so after another scene changed it.
 */
export function captureTableLook(table: SceneTableFields): BoardSceneLookFields {
  const hasForeground = !isNoTablePicture(table.foregroundImageIdentifier);
  return {
    floorImageIdentifier: scenePictureOf(table.imageIdentifier),
    backgroundImageIdentifier: scenePictureOf(table.backgroundImageIdentifier),
    backgroundFilter: text(table.backgroundFilterType) || 'none',
    northWallImageIdentifier: scenePictureOf(table.northWallImageIdentifier),
    eastWallImageIdentifier: scenePictureOf(table.eastWallImageIdentifier),
    southWallImageIdentifier: scenePictureOf(table.southWallImageIdentifier),
    westWallImageIdentifier: scenePictureOf(table.westWallImageIdentifier),
    wallsShown: JSON.stringify({
      north: table.showNorthWall === true,
      east: table.showEastWall === true,
      south: table.showSouthWall === true,
      west: table.showWestWall === true,
    }),
    foregroundImageIdentifier: scenePictureOf(table.foregroundImageIdentifier),
    foregroundOpacity: hasForeground ? `${foregroundOpacityOf(table.foregroundOpacity)}` : '',
    foregroundFit: hasForeground ? foregroundFitOf(table.foregroundFit) : '',
    weather: JSON.stringify({
      kind: text(table.weatherKind),
      color: text(table.weatherColor),
      density: ambienceDensityOf(table.weatherDensity),
    }),
    darkness: table.darknessEnabled === true ? 'on' : 'off',
    fog: table.fogEnabled === true ? 'on' : 'off',
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  const held = text(value);
  if (held.length < 1) return null;
  try {
    const parsed: unknown = JSON.parse(held);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
