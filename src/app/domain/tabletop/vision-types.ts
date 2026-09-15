export enum VisionType {
  NORMAL = 'normal',
  DARKVISION = 'darkvision',
  TRUESIGHT = 'truesight',
  BLIND = 'blind',
  THERMAL = 'thermal',
}

export enum LightCategory {
  PHYSICAL = 'physical',
  THEATRICAL = 'theatrical',
}

export enum LightAnimation {
  NONE = 'none',
  FLICKER = 'flicker',
  PULSE = 'pulse',
  NEON = 'neon',
}

export enum LightPreset {
  CUSTOM = 'custom',
  TORCH = 'torch',
  LANTERN = 'lantern',
  CANDLE = 'candle',
  DAYLIGHT = 'daylight',
  FLASHLIGHT = 'flashlight',
  NEON = 'neon',
  SPOTLIGHT = 'spotlight',
  CAMPFIRE = 'campfire',
  SCONCE = 'sconce',
  BRAZIER = 'brazier',
  CHANDELIER = 'chandelier',
}

export interface LightSpec {
  enabled: boolean;
  preset: LightPreset;
  brightRadius: number;
  dimRadius: number;
  color: string;
  angle: number;
  direction: number;
  pitch: number;
  animation: LightAnimation;
  category: LightCategory;
  ignoreOcclusion: boolean;
  revealToAll: boolean;
  castShadows: boolean;
}

export const DEFAULT_LIGHT_COLOR = '#ffd9a0';

export const DEFAULT_AMBIENT_COLOR = '#05060a';

export interface LightPresetDef {
  brightRadius: number;
  dimRadius: number;
  color: string;
  angle: number;
  pitch: number;
  animation: LightAnimation;
  category: LightCategory;
  ignoreOcclusion: boolean;
  revealToAll: boolean;
  castShadows: boolean;
}

export const LIGHT_PRESETS: Record<Exclude<LightPreset, LightPreset.CUSTOM>, LightPresetDef> = {
  [LightPreset.CAMPFIRE]: {
    brightRadius: 5,
    dimRadius: 11,
    color: '#ff9d4d',
    angle: 360,
    pitch: 0,
    animation: LightAnimation.FLICKER,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  // A torch in a bracket throws its light out from the wall rather than all round it.
  [LightPreset.SCONCE]: {
    brightRadius: 3,
    dimRadius: 7,
    color: '#ffb36b',
    angle: 200,
    pitch: 8,
    animation: LightAnimation.FLICKER,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  [LightPreset.BRAZIER]: {
    brightRadius: 4,
    dimRadius: 9,
    color: '#ffa347',
    angle: 360,
    pitch: 0,
    animation: LightAnimation.FLICKER,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  [LightPreset.CHANDELIER]: {
    brightRadius: 6,
    dimRadius: 12,
    color: '#ffe0b0',
    angle: 360,
    pitch: -20,
    animation: LightAnimation.FLICKER,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  [LightPreset.TORCH]: {
    brightRadius: 4,
    dimRadius: 8,
    color: '#ffb36b',
    angle: 360,
    pitch: 0,
    animation: LightAnimation.FLICKER,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  [LightPreset.LANTERN]: {
    brightRadius: 5,
    dimRadius: 10,
    color: '#ffd9a0',
    angle: 360,
    pitch: 0,
    animation: LightAnimation.FLICKER,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  [LightPreset.CANDLE]: {
    brightRadius: 1,
    dimRadius: 3,
    color: '#ffcc88',
    angle: 360,
    pitch: 0,
    animation: LightAnimation.FLICKER,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  [LightPreset.DAYLIGHT]: {
    brightRadius: 12,
    dimRadius: 24,
    color: '#ffffff',
    angle: 360,
    pitch: 0,
    animation: LightAnimation.NONE,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: false,
  },
  [LightPreset.FLASHLIGHT]: {
    brightRadius: 6,
    dimRadius: 12,
    color: '#fff6e0',
    angle: 45,
    pitch: -30,
    animation: LightAnimation.NONE,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  },
  [LightPreset.NEON]: {
    brightRadius: 3,
    dimRadius: 6,
    color: '#00e5ff',
    angle: 360,
    pitch: 0,
    animation: LightAnimation.NEON,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: false,
  },
  [LightPreset.SPOTLIGHT]: {
    brightRadius: 5,
    dimRadius: 8,
    color: '#ffffff',
    angle: 30,
    pitch: -30,
    animation: LightAnimation.PULSE,
    category: LightCategory.THEATRICAL,
    ignoreOcclusion: true,
    revealToAll: true,
    castShadows: true,
  },
};

/**
 * A complete light spec for a preset: the defaults, then the preset's own values, then any
 * overrides. The preset named is always kept.
 */
export function lightSpecFromPreset(preset: LightPreset, overrides: Partial<LightSpec> = {}): LightSpec {
  const base: LightSpec = {
    enabled: true,
    preset,
    brightRadius: 0,
    dimRadius: 0,
    color: DEFAULT_LIGHT_COLOR,
    angle: 360,
    direction: 0,
    pitch: 0,
    animation: LightAnimation.NONE,
    category: LightCategory.PHYSICAL,
    ignoreOcclusion: false,
    revealToAll: false,
    castShadows: true,
  };
  const def = preset === LightPreset.CUSTOM ? null : LIGHT_PRESETS[preset];
  return { ...base, ...(def ?? {}), ...overrides, preset };
}

export interface LightConfig {
  lightEnabled: boolean;
  lightPreset: string;
  lightBrightRadius: number;
  lightDimRadius: number;
  lightColor: string;
  lightAngle: number;
  lightDirection: number;
  lightPitch?: number;
  lightAnimation: string;
  lightCategory?: string;
  lightIgnoreOcclusion?: boolean;
  lightRevealToAll?: boolean;
  lightCastShadows?: boolean;
  visionType?: string;
  visionRange?: number;
  castsShadow?: boolean;
  visionShape?: string;
  visionConeAngle?: number;
  visionConeCount?: number;
  visionBackAngle?: number;
  visionBackScale?: number;
  visionPeripheralScale?: number;
  visionDirection?: number;
  visionLobes?: string;
  showVisionRange?: boolean;
}

export interface MutableLightFields {
  lightPreset: string;
  lightBrightRadius: number;
  lightDimRadius: number;
  lightColor: string;
  lightAngle: number;
  lightPitch?: number;
  lightAnimation: string;
  lightCategory?: string;
  lightIgnoreOcclusion?: boolean;
  lightRevealToAll?: boolean;
  lightCastShadows?: boolean;
}

/**
 * Sets a light's preset and, for every preset but custom, copies that preset's values onto it.
 *
 * Optional fields are written only when the light has them.
 */
export function applyLightPreset(target: MutableLightFields, preset: LightPreset): void {
  target.lightPreset = preset;
  if (preset === LightPreset.CUSTOM) return;
  const def = LIGHT_PRESETS[preset];
  target.lightBrightRadius = def.brightRadius;
  target.lightDimRadius = def.dimRadius;
  target.lightColor = def.color;
  target.lightAngle = def.angle;
  if ('lightPitch' in target) target.lightPitch = def.pitch;
  target.lightAnimation = def.animation;
  if ('lightCategory' in target) target.lightCategory = def.category;
  if ('lightIgnoreOcclusion' in target) target.lightIgnoreOcclusion = def.ignoreOcclusion;
  if ('lightRevealToAll' in target) target.lightRevealToAll = def.revealToAll;
  if ('lightCastShadows' in target) target.lightCastShadows = def.castShadows;
}
