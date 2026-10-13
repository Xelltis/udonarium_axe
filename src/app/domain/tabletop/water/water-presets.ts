import { DEFAULT_DIRT, DEFAULT_TURBIDITY } from '@axe/domain/tabletop/water/water-surface';

/** One way water can look, as the colour, murkiness and dirt that make it so. */
export interface WaterPreset {
  readonly id: WaterPresetId;
  /** Empty for the colour of water itself. */
  readonly color: string;
  readonly turbidity: number;
  readonly dirt: number;
}

export const WATER_PRESET_IDS = ['clear', 'murky', 'mud', 'algae', 'stagnant', 'milky'] as const;

export type WaterPresetId = (typeof WATER_PRESET_IDS)[number];

/**
 * The looks a body of water can be given in one choice. Each is only a starting point: the
 * colour, the murkiness and the dirt can each be changed after.
 */
export const WATER_PRESETS: readonly WaterPreset[] = [
  { id: 'clear', color: '', turbidity: DEFAULT_TURBIDITY, dirt: DEFAULT_DIRT },
  { id: 'murky', color: '#7f9a6e', turbidity: 0.65, dirt: 0.15 },
  { id: 'mud', color: '#8a6a3f', turbidity: 1, dirt: 0.25 },
  { id: 'algae', color: '#4f7f3a', turbidity: 0.6, dirt: 0.85 },
  { id: 'stagnant', color: '#5f6b4a', turbidity: 0.85, dirt: 1 },
  { id: 'milky', color: '#dfe8ea', turbidity: 1, dirt: 0 },
];

/** The look a body of water has, or null where its colour, murkiness and dirt match none of them. */
export function waterPresetOf(color: string, turbidity: number, dirt: number): WaterPresetId | null {
  const held = color.trim().toLowerCase();
  const found = WATER_PRESETS.find(
    (preset) =>
      preset.color === held && Math.abs(preset.turbidity - turbidity) < 0.005 && Math.abs(preset.dirt - dirt) < 0.005
  );
  return found?.id ?? null;
}

/** The look of the given name, or null for a name it does not know. */
export function waterPresetNamed(id: unknown): WaterPreset | null {
  return WATER_PRESETS.find((preset) => preset.id === id) ?? null;
}
