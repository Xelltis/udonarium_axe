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
import {
  DEFAULT_RADIAL_MENU_ROTATION_SPEED,
  MAX_RADIAL_MENU_ROTATION_SPEED,
  MIN_RADIAL_MENU_ROTATION_SPEED,
} from '@axe/domain/tabletop/radial-menu';

/**
 * How a table laid flat is drawn and reached, for the readers who are looking straight down on it.
 *
 * Every one of these only has anything to say while the table is seen in 2D. They are the table's
 * own decisions, so that a screen laid flat in the middle of a group shows the same thing to
 * everyone around it, and any one reader can still ask for something else on their own glass.
 */
export interface TabletopDisplaySettings {
  /** Whether the flat table is drawn without perspective, the way a board seen from above has none. */
  orthographicProjection: boolean;
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
}

export type TabletopDisplayKey = keyof TabletopDisplaySettings;

/**
 * The settings of one feature, which is the unit a reader takes over.
 *
 * Taking over the piece labels leaves the menus and the ticker with what the table asks for.
 */
export const TABLETOP_DISPLAY_SECTIONS = {
  projection: ['orthographicProjection'],
  menus: ['radialMenuEnabled', 'radialMenuRotationSpeed'],
  pieceLabels: [
    'multiAngleEnabled',
    'multiAngleResourceBuffEnabled',
    'multiAngleMotionMode',
    'multiAngleRevolutionSeconds',
    'multiAnglePauseSeconds',
    'multiAnglePieceRevolutionSeconds',
    'multiAngleFontScale',
  ],
  hoverDetail: ['hoverDetailPlacement'],
  ticker: ['multiAngleTickerEnabled', 'multiAngleTickerPixelsPerSecond'],
  cutIn: ['cutInMultiDirectionMode'],
} as const satisfies Record<string, readonly TabletopDisplayKey[]>;

export type TabletopDisplaySection = keyof typeof TABLETOP_DISPLAY_SECTIONS;

export const TABLETOP_DISPLAY_SECTION_NAMES = Object.keys(TABLETOP_DISPLAY_SECTIONS) as TabletopDisplaySection[];

/** What one reader asked for instead. A key left out is a key the table still answers. */
export type TabletopDisplayOverride = Partial<TabletopDisplaySettings>;

export const DEFAULT_TABLETOP_DISPLAY_SETTINGS: TabletopDisplaySettings = {
  orthographicProjection: false,
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
  };
}

/** Keeps the keys a reader has actually taken over, and drops anything that is not a setting. */
export function normalizeTabletopDisplayOverride(value: unknown): TabletopDisplayOverride {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const held = normalizeTabletopDisplaySettings(source);
  const override: TabletopDisplayOverride = {};
  for (const section of TABLETOP_DISPLAY_SECTION_NAMES) {
    if (!TABLETOP_DISPLAY_SECTIONS[section].every((key) => key in source)) continue;
    Object.assign(override, pickSection(held, section));
  }
  return override;
}

export function pickSection(
  settings: TabletopDisplaySettings,
  section: TabletopDisplaySection
): TabletopDisplayOverride {
  const picked: TabletopDisplayOverride = {};
  for (const key of TABLETOP_DISPLAY_SECTIONS[section]) {
    (picked as Record<string, unknown>)[key] = settings[key];
  }
  return picked;
}

export function overridesSection(override: TabletopDisplayOverride, section: TabletopDisplaySection): boolean {
  return TABLETOP_DISPLAY_SECTIONS[section].every((key) => override[key] !== undefined);
}

export function withoutSection(
  override: TabletopDisplayOverride,
  section: TabletopDisplaySection
): TabletopDisplayOverride {
  const next: TabletopDisplayOverride = { ...override };
  for (const key of TABLETOP_DISPLAY_SECTIONS[section]) delete next[key];
  return next;
}

/** The settings the room has answered for. An empty answer is one the room has not given. */
export function answeredTabletopDisplay(answers: unknown): Partial<Record<TabletopDisplayKey, unknown>> {
  const source = answers && typeof answers === 'object' ? (answers as Record<string, unknown>) : {};
  const answered: Partial<Record<TabletopDisplayKey, unknown>> = {};
  for (const key of Object.keys(DEFAULT_TABLETOP_DISPLAY_SETTINGS) as TabletopDisplayKey[]) {
    const held = source[key];
    if (held === undefined || held === null || held === '') continue;
    answered[key] = held;
  }
  return answered;
}

/**
 * What is in force here, read from the furthest away inwards.
 *
 * The table answers for anything the room has not, which is how a room saved before the room
 * was asked keeps looking the way it did, and this reader answers for whatever they took over.
 */
export function resolveTabletopDisplay(
  table: unknown,
  answers: unknown,
  override: TabletopDisplayOverride
): TabletopDisplaySettings {
  return normalizeTabletopDisplaySettings({
    ...normalizeTabletopDisplaySettings(table),
    ...answeredTabletopDisplay(answers),
    ...override,
  });
}
