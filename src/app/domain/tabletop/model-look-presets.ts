import { MODEL_AS_MADE, type ModelLook } from '@axe/domain/tabletop/model-look';

/**
 * The looks offered ready made, each what it sets over a model as made: metal polished or gilded, a
 * statue of stone, a ghost one sees through, a shadow, ice and a figure of light.
 */
export const MODEL_LOOK_PRESETS = {
  made: {},
  toon: { finish: 'toon' },
  steel: { metalness: 1, roughness: 0.28 },
  gold: { tint: '#ffcf5a', plain: true, metalness: 1, roughness: 0.22 },
  stone: { tint: '#a3a39b', plain: true, metalness: 0, roughness: 0.95 },
  ghost: { tint: '#bfe6ff', opacity: 0.45, glow: '#7fc8ff', glowStrength: 0.6 },
  shadow: { tint: '#0b0b10', plain: true, metalness: 0, roughness: 1 },
  ice: { tint: '#cfeeff', plain: true, metalness: 0.1, roughness: 0.08, opacity: 0.8 },
  light: { tint: '#fff3c4', plain: true, glow: '#ffe28a', glowStrength: 2.2, finish: 'matte' },
} as const satisfies Record<string, Partial<Omit<ModelLook, 'materials'>>>;

export type ModelLookPreset = keyof typeof MODEL_LOOK_PRESETS;

/** The ready-made looks, in the order they are offered. */
export const MODEL_LOOK_PRESET_NAMES = Object.keys(MODEL_LOOK_PRESETS) as readonly ModelLookPreset[];

/** A ready-made look, laid over a model as made. */
export function presetModelLook(preset: ModelLookPreset): ModelLook {
  return { ...MODEL_AS_MADE, ...MODEL_LOOK_PRESETS[preset] };
}
