import {
  asCutInMultiDirectionMode,
  CutInMultiDirectionMode,
  DEFAULT_CUT_IN_MULTI_DIRECTION_MODE,
} from '@axe/domain/tabletop/cut-in-multi-direction';
import {
  asHoverDetailPlacement,
  DEFAULT_HOVER_DETAIL_PLACEMENT,
  HoverDetailPlacement,
} from '@axe/domain/tabletop/hover-detail-placement';
import {
  DEFAULT_MULTI_ANGLE_PAUSE_SECONDS,
  DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
  DEFAULT_MULTI_ANGLE_REVOLUTION_SECONDS,
  DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  MultiAngleMotionMode,
} from '@axe/domain/tabletop/multi-angle';
import {
  asMultiAngleFontScale,
  DEFAULT_MULTI_ANGLE_FONT_SCALE,
  MultiAngleFontScale,
} from '@axe/domain/tabletop/multi-angle-font-scale';
import { clampCellMm, DEFAULT_CELL_MM } from '@axe/domain/tabletop/physical-scale';
import {
  DEFAULT_RADIAL_MENU_ROTATION_SPEED,
  MAX_RADIAL_MENU_ROTATION_SPEED,
  MIN_RADIAL_MENU_ROTATION_SPEED,
} from '@axe/domain/tabletop/radial-menu';

/**
 * How a table laid flat is drawn and reached, for the reader looking straight down on it.
 *
 * None of it has anything to say until the table is seen from above, and all of it describes the
 * screen in front of one reader. A group sitting around a screen sets it on that screen; the
 * people joining the same session from elsewhere are left with the table as they had it.
 */
export interface TabletopDisplaySettings {
  /** Whether the flat table is drawn without perspective, the way a board seen from above has none. */
  orthographicProjection: boolean;
  /** How wide one square is meant to measure on the glass, for a screen laid flat under miniatures. */
  cellMm: number;
  /** Whether the four-way menus turn, rather than standing in four straight lists. */
  radialMenuEnabled: boolean;
  radialMenuRotationSpeed: number;
  hoverDetailPlacement: HoverDetailPlacement;
  multiAngleEnabled: boolean;
  multiAngleResourceBuffEnabled: boolean;
  multiAngleMotionMode: MultiAngleMotionMode;
  multiAngleRevolutionSeconds: number;
  multiAnglePauseSeconds: number;
  multiAnglePieceRevolutionSeconds: number;
  /** Text size shared by the 2D menus, the piece labels and the edge ticker. */
  multiAngleFontScale: MultiAngleFontScale;
  multiAngleTickerEnabled: boolean;
  multiAngleTickerPixelsPerSecond: number;
  cutInMultiDirectionMode: CutInMultiDirectionMode;
  /** Whether a window carries the button that turns it a quarter at a time. */
  panelRotationEnabled: boolean;
}

export type TabletopDisplayKey = keyof TabletopDisplaySettings;

/** What this screen has been told. A key left out is a key the table still answers. */
export type TabletopDisplayOwn = Partial<TabletopDisplaySettings>;

export const DEFAULT_TABLETOP_DISPLAY_SETTINGS: TabletopDisplaySettings = {
  orthographicProjection: false,
  cellMm: DEFAULT_CELL_MM,
  radialMenuEnabled: false,
  radialMenuRotationSpeed: DEFAULT_RADIAL_MENU_ROTATION_SPEED,
  hoverDetailPlacement: DEFAULT_HOVER_DETAIL_PLACEMENT,
  multiAngleEnabled: false,
  multiAngleResourceBuffEnabled: false,
  multiAngleMotionMode: 'continuous',
  multiAngleRevolutionSeconds: DEFAULT_MULTI_ANGLE_REVOLUTION_SECONDS,
  multiAnglePauseSeconds: DEFAULT_MULTI_ANGLE_PAUSE_SECONDS,
  multiAnglePieceRevolutionSeconds: DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
  multiAngleFontScale: DEFAULT_MULTI_ANGLE_FONT_SCALE,
  multiAngleTickerEnabled: false,
  multiAngleTickerPixelsPerSecond: DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  cutInMultiDirectionMode: DEFAULT_CUT_IN_MULTI_DIRECTION_MODE,
  panelRotationEnabled: false,
};

export const MIN_MULTI_ANGLE_REVOLUTION_SECONDS = 1;
export const MAX_MULTI_ANGLE_REVOLUTION_SECONDS = 120;
export const MIN_MULTI_ANGLE_PAUSE_SECONDS = 0;
export const MAX_MULTI_ANGLE_PAUSE_SECONDS = 30;
export const MIN_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS = 5;
export const MAX_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS = 300;

export function asMultiAngleMotionMode(value: unknown): MultiAngleMotionMode {
  return value === 'quarter-turn' || value === 'piece-quarter-turn' ? value : 'continuous';
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function finiteInRange(value: unknown, fallback: number, min: number, max: number, round = false): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(max, Math.max(min, numeric));
  return round ? Math.round(clamped) : clamped;
}

/** Reads whatever a table or a stored record carries, and answers with settings that hold together. */
export function normalizeTabletopDisplaySettings(value: unknown): TabletopDisplaySettings {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const defaults = DEFAULT_TABLETOP_DISPLAY_SETTINGS;
  return {
    orthographicProjection: booleanOr(source['orthographicProjection'], defaults.orthographicProjection),
    cellMm:
      source['cellMm'] === '' || source['cellMm'] === null || source['cellMm'] === undefined
        ? defaults.cellMm
        : clampCellMm(Number(source['cellMm'])),
    radialMenuEnabled: booleanOr(source['radialMenuEnabled'], defaults.radialMenuEnabled),
    radialMenuRotationSpeed: finiteInRange(
      source['radialMenuRotationSpeed'],
      defaults.radialMenuRotationSpeed,
      MIN_RADIAL_MENU_ROTATION_SPEED,
      MAX_RADIAL_MENU_ROTATION_SPEED,
      true
    ),
    hoverDetailPlacement: asHoverDetailPlacement(source['hoverDetailPlacement']),
    multiAngleEnabled: booleanOr(source['multiAngleEnabled'], defaults.multiAngleEnabled),
    multiAngleResourceBuffEnabled: booleanOr(
      source['multiAngleResourceBuffEnabled'],
      defaults.multiAngleResourceBuffEnabled
    ),
    multiAngleMotionMode: asMultiAngleMotionMode(source['multiAngleMotionMode']),
    multiAngleRevolutionSeconds: finiteInRange(
      source['multiAngleRevolutionSeconds'],
      defaults.multiAngleRevolutionSeconds,
      MIN_MULTI_ANGLE_REVOLUTION_SECONDS,
      MAX_MULTI_ANGLE_REVOLUTION_SECONDS
    ),
    multiAnglePauseSeconds: finiteInRange(
      source['multiAnglePauseSeconds'],
      defaults.multiAnglePauseSeconds,
      MIN_MULTI_ANGLE_PAUSE_SECONDS,
      MAX_MULTI_ANGLE_PAUSE_SECONDS
    ),
    multiAnglePieceRevolutionSeconds: finiteInRange(
      source['multiAnglePieceRevolutionSeconds'],
      defaults.multiAnglePieceRevolutionSeconds,
      MIN_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
      MAX_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS
    ),
    multiAngleFontScale: asMultiAngleFontScale(source['multiAngleFontScale']),
    multiAngleTickerEnabled: booleanOr(source['multiAngleTickerEnabled'], defaults.multiAngleTickerEnabled),
    multiAngleTickerPixelsPerSecond: finiteInRange(
      source['multiAngleTickerPixelsPerSecond'],
      defaults.multiAngleTickerPixelsPerSecond,
      MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
      MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND
    ),
    cutInMultiDirectionMode: asCutInMultiDirectionMode(source['cutInMultiDirectionMode']),
    panelRotationEnabled: booleanOr(source['panelRotationEnabled'], defaults.panelRotationEnabled),
  };
}

/** Keeps the settings this screen has been told, and drops anything that is not one. */
export function normalizeTabletopDisplayOwn(value: unknown): TabletopDisplayOwn {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const held = normalizeTabletopDisplaySettings(source);
  const own: TabletopDisplayOwn = {};
  for (const key of Object.keys(DEFAULT_TABLETOP_DISPLAY_SETTINGS) as TabletopDisplayKey[]) {
    if (!(key in source)) continue;
    Object.assign(own, { [key]: held[key] });
  }
  return own;
}

/**
 * What is in force on this screen: what it has been told, over what the table used to carry.
 *
 * The table is read first so that a room saved while these were still the table's own keeps
 * looking the way it did until this screen says otherwise.
 */
export function resolveTabletopDisplay(table: unknown, own: TabletopDisplayOwn): TabletopDisplaySettings {
  return normalizeTabletopDisplaySettings({ ...normalizeTabletopDisplaySettings(table), ...own });
}
