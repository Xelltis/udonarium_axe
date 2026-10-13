import { DEFAULT_DIRT, DEFAULT_LEAVES, DEFAULT_TURBIDITY } from '@axe/domain/tabletop/water/water-surface';

/** One way water can look, as the colour, murkiness, dirt and floating leaves that make it so. */
export interface WaterPreset {
  readonly id: WaterPresetId;
  /** Empty for the colour of water itself. */
  readonly color: string;
  readonly turbidity: number;
  readonly dirt: number;
  readonly leaves: number;
}

export const WATER_PRESET_IDS = ['clear', 'murky', 'mud', 'algae', 'stagnant', 'milky', 'lotus'] as const;

export type WaterPresetId = (typeof WATER_PRESET_IDS)[number];

/**
 * The looks a body of water can be given in one choice. Each is only a starting point: the
 * colour, the murkiness and the dirt can each be changed after.
 */
export const WATER_PRESETS: readonly WaterPreset[] = [
  { id: 'clear', color: '', turbidity: DEFAULT_TURBIDITY, dirt: DEFAULT_DIRT, leaves: DEFAULT_LEAVES },
  { id: 'murky', color: '#7f9a6e', turbidity: 0.65, dirt: 0.15, leaves: DEFAULT_LEAVES },
  { id: 'mud', color: '#8a6a3f', turbidity: 1, dirt: 0.25, leaves: DEFAULT_LEAVES },
  { id: 'algae', color: '#4f7f3a', turbidity: 0.6, dirt: 0.85, leaves: DEFAULT_LEAVES },
  { id: 'stagnant', color: '#5f6b4a', turbidity: 0.85, dirt: 1, leaves: DEFAULT_LEAVES },
  { id: 'milky', color: '#dfe8ea', turbidity: 1, dirt: 0, leaves: DEFAULT_LEAVES },
  { id: 'lotus', color: '#4d7a5c', turbidity: 0.5, dirt: 0.1, leaves: 0.6 },
];

/** The look a body of water has, or null where its colour, murkiness, dirt and leaves match none of them. */
export function waterPresetOf(color: string, turbidity: number, dirt: number, leaves = 0): WaterPresetId | null {
  const held = color.trim().toLowerCase();
  const found = WATER_PRESETS.find(
    (preset) =>
      preset.color === held &&
      Math.abs(preset.turbidity - turbidity) < 0.005 &&
      Math.abs(preset.dirt - dirt) < 0.005 &&
      Math.abs(preset.leaves - leaves) < 0.005
  );
  return found?.id ?? null;
}

/** The look of the given name, or null for a name it does not know. */
export function waterPresetNamed(id: unknown): WaterPreset | null {
  return WATER_PRESETS.find((preset) => preset.id === id) ?? null;
}
