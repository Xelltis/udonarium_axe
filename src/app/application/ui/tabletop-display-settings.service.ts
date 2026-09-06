import { computed, Injectable, signal } from '@angular/core';
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

export const TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY = 'ui-tabletop-display-settings';

export interface TabletopDisplaySettings {
  readonly enabled: boolean;
  readonly cutInMultiDirectionMode: CutInMultiDirectionMode;
  readonly hoverDetailPlacement: HoverDetailPlacement;
  readonly radialMenuEnabled: boolean;
  readonly radialMenuRotationSpeed: number;
  readonly multiAngleEnabled: boolean;
  readonly multiAngleResourceBuffEnabled: boolean;
  readonly multiAngleMotionMode: MultiAngleMotionMode;
  readonly multiAngleRevolutionSeconds: number;
  readonly multiAnglePauseSeconds: number;
  readonly multiAnglePieceRevolutionSeconds: number;
  readonly multiAngleTickerEnabled: boolean;
  readonly multiAngleTickerPixelsPerSecond: number;
  readonly multiAngleFontScale: MultiAngleFontScale;
}

export const DEFAULT_TABLETOP_DISPLAY_SETTINGS: TabletopDisplaySettings = {
  enabled: false,
  cutInMultiDirectionMode: DEFAULT_CUT_IN_MULTI_DIRECTION_MODE,
  hoverDetailPlacement: DEFAULT_HOVER_DETAIL_PLACEMENT,
  radialMenuEnabled: false,
  radialMenuRotationSpeed: DEFAULT_RADIAL_MENU_ROTATION_SPEED,
  multiAngleEnabled: false,
  multiAngleResourceBuffEnabled: false,
  multiAngleMotionMode: 'continuous',
  multiAngleRevolutionSeconds: DEFAULT_MULTI_ANGLE_REVOLUTION_SECONDS,
  multiAnglePauseSeconds: DEFAULT_MULTI_ANGLE_PAUSE_SECONDS,
  multiAnglePieceRevolutionSeconds: DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
  multiAngleTickerEnabled: false,
  multiAngleTickerPixelsPerSecond: DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  multiAngleFontScale: DEFAULT_MULTI_ANGLE_FONT_SCALE,
};

type MutableTabletopDisplaySettings = { -readonly [K in keyof TabletopDisplaySettings]: TabletopDisplaySettings[K] };

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function finiteInRange(value: unknown, fallback: number, min: number, max: number, round = false): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(max, Math.max(min, numeric));
  return round ? Math.round(clamped) : clamped;
}

function asMultiAngleMotionMode(value: unknown): MultiAngleMotionMode {
  return value === 'quarter-turn' || value === 'piece-quarter-turn' ? value : 'continuous';
}

export function normalizeTabletopDisplaySettings(value: unknown): TabletopDisplaySettings {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    enabled: booleanOr(source['enabled'], false),
    cutInMultiDirectionMode: asCutInMultiDirectionMode(source['cutInMultiDirectionMode']),
    hoverDetailPlacement: asHoverDetailPlacement(source['hoverDetailPlacement']),
    radialMenuEnabled: booleanOr(source['radialMenuEnabled'], false),
    radialMenuRotationSpeed: finiteInRange(
      source['radialMenuRotationSpeed'],
      DEFAULT_RADIAL_MENU_ROTATION_SPEED,
      MIN_RADIAL_MENU_ROTATION_SPEED,
      MAX_RADIAL_MENU_ROTATION_SPEED,
      true
    ),
    multiAngleEnabled: booleanOr(source['multiAngleEnabled'], false),
    multiAngleResourceBuffEnabled: booleanOr(source['multiAngleResourceBuffEnabled'], false),
    multiAngleMotionMode: asMultiAngleMotionMode(source['multiAngleMotionMode']),
    multiAngleRevolutionSeconds: finiteInRange(
      source['multiAngleRevolutionSeconds'],
      DEFAULT_MULTI_ANGLE_REVOLUTION_SECONDS,
      1,
      120
    ),
    multiAnglePauseSeconds: finiteInRange(source['multiAnglePauseSeconds'], DEFAULT_MULTI_ANGLE_PAUSE_SECONDS, 0, 30),
    multiAnglePieceRevolutionSeconds: finiteInRange(
      source['multiAnglePieceRevolutionSeconds'],
      DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS,
      5,
      300
    ),
    multiAngleTickerEnabled: booleanOr(source['multiAngleTickerEnabled'], false),
    multiAngleTickerPixelsPerSecond: finiteInRange(
      source['multiAngleTickerPixelsPerSecond'],
      DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
      MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
      MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND
    ),
    multiAngleFontScale: asMultiAngleFontScale(source['multiAngleFontScale']),
  };
}

function readStoredSettings(): TabletopDisplaySettings {
  try {
    const raw = localStorage.getItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY);
    return normalizeTabletopDisplaySettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_TABLETOP_DISPLAY_SETTINGS;
  }
}

@Injectable({ providedIn: 'root' })
export class TabletopDisplaySettingsService {
  private readonly state = signal<TabletopDisplaySettings>(readStoredSettings());

  readonly settings = this.state.asReadonly();
  readonly enabled = computed(() => this.state().enabled);
  readonly cutInMultiDirectionMode = computed(() => this.state().cutInMultiDirectionMode);
  readonly hoverDetailPlacement = computed(() => this.state().hoverDetailPlacement);
  readonly radialMenuEnabled = computed(() => this.state().radialMenuEnabled);
  readonly radialMenuRotationSpeed = computed(() => this.state().radialMenuRotationSpeed);
  readonly multiAngleEnabled = computed(() => this.state().multiAngleEnabled);
  readonly multiAngleResourceBuffEnabled = computed(() => this.state().multiAngleResourceBuffEnabled);
  readonly multiAngleMotionMode = computed(() => this.state().multiAngleMotionMode);
  readonly multiAngleRevolutionSeconds = computed(() => this.state().multiAngleRevolutionSeconds);
  readonly multiAnglePauseSeconds = computed(() => this.state().multiAnglePauseSeconds);
  readonly multiAnglePieceRevolutionSeconds = computed(() => this.state().multiAnglePieceRevolutionSeconds);
  readonly multiAngleTickerEnabled = computed(() => this.state().multiAngleTickerEnabled);
  readonly multiAngleTickerPixelsPerSecond = computed(() => this.state().multiAngleTickerPixelsPerSecond);
  readonly multiAngleFontScale = computed(() => this.state().multiAngleFontScale);

  patch(patch: Partial<MutableTabletopDisplaySettings>): void {
    const next = normalizeTabletopDisplaySettings({ ...this.state(), ...patch });
    this.state.set(next);
    try {
      localStorage.setItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable in private mode; the signal still serves this session.
    }
  }
}
