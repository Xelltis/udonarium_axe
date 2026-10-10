import {
  applyEntrance,
  applyExit,
  type CutInEntrance,
  type CutInExit,
  DEFAULT_PRESET_MS,
  type PresetStage,
} from '@axe/domain/media/cut-in-animation-presets';
import type { CutInEffect } from '@axe/domain/media/cut-in-effect';
import type { CutInLayer } from '@axe/domain/media/cut-in-layer';

/**
 * Whole looks for a layer, for anyone who would rather pick one than build one.
 *
 * Each is an arrival, a departure and a touch chosen together. Nothing new is stored:
 * a preset writes what could have been set by hand, which is what makes it a starting
 * point rather than a mode the layer is stuck in.
 */

export interface CutInLayerPreset {
  id: string;
  entrance: CutInEntrance;
  exit: CutInExit;
  effect: CutInEffect;
  strength: number;
  /** How long the arrival and the departure each take, in ms. */
  ms: number;
}

export const CUT_IN_LAYER_PRESETS: readonly CutInLayerPreset[] = [
  { id: 'impact', entrance: 'popIn', exit: 'zoomOut', effect: 'shake', strength: 1.4, ms: 260 },
  { id: 'headline', entrance: 'slideInLeft', exit: 'slideOutRight', effect: 'glow', strength: 1, ms: 420 },
  { id: 'reveal', entrance: 'zoomIn', exit: 'fadeOut', effect: 'glow', strength: 0.7, ms: 520 },
  { id: 'ominous', entrance: 'fadeIn', exit: 'fadeOut', effect: 'pulse', strength: 1, ms: 900 },
  { id: 'drifting', entrance: 'fadeIn', exit: 'fadeOut', effect: 'float', strength: 1, ms: 700 },
  { id: 'alarm', entrance: 'fadeIn', exit: 'fadeOut', effect: 'blink', strength: 1, ms: 200 },
  { id: 'entrance', entrance: 'spinIn', exit: 'dropOut', effect: 'shadow', strength: 1, ms: 600 },
  { id: 'whisper', entrance: 'slideInBottom', exit: 'slideOutBottom', effect: 'none', strength: 1, ms: 380 },
] as const;

/** The whole look with the given id, or null when there is none by that id. */
export function cutInLayerPreset(id: string): CutInLayerPreset | null {
  return CUT_IN_LAYER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Lays a whole look onto a layer: how it arrives, how it leaves, and what it does meanwhile. */
export function applyLayerPreset(layer: CutInLayer, id: string, stage: PresetStage, sceneDurationMs: number): boolean {
  const preset = cutInLayerPreset(id);
  if (!preset) return false;

  const ms = preset.ms > 0 ? preset.ms : DEFAULT_PRESET_MS;
  layer.effect = preset.effect;
  layer.effectStrength = preset.strength;
  applyEntrance(layer, preset.entrance, stage, ms);
  applyExit(layer, preset.exit, stage, sceneDurationMs, ms);
  return true;
}
