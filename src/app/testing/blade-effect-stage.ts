import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind, type SlashStyle } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';

/* What the specs of the looks of a blade share: a preset of one, a cast of it from the east, and what it draws at a moment. */

export const CELL = 50;
/** Where the one target of a cast stands, and the caster, two cells to its east. */
export const TARGET = { x: 400, y: 300 };
export const CASTER = { x: 500, y: 300, z: 30 };

/** A cut of a form, in white and blue, of a grade and a length. */
export function cutOf(style: SlashStyle, durationMs = 2000, grade = 2): EffectPreset {
  const preset = bladePresetOf('slash', durationMs, grade);
  preset.slashStyle = style;
  return preset;
}

/** A preset of a kind of blade, in white and blue. */
export function bladePresetOf(kind: EffectKind, durationMs: number, grade = 2): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = durationMs;
  preset.staggerMs = 100;
  preset.colorPrimary = '#ffffff';
  preset.colorSecondary = '#7fd4ff';
  return preset;
}

/** The bundled effect of a name, as a room is given it. */
export function bundledOf(name: string): EffectPreset {
  return createEffectPreset(DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!);
}

/** A cast on the target from the caster to its east, or from no one. */
export function castOnTarget(caster = true, seed = 11): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? CASTER : null,
    targets: [{ identifier: 't0', ...TARGET, z: 0 }],
    seed,
  };
}

/** What a cast draws a while after it starts, in seconds. */
export function stagedAt(preset: EffectPreset, cast: EffectCast, seconds: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, seconds * 1000, { cellPx: CELL }, drawn);
  return drawn;
}

/** How wide a band is at its widest. */
export function widestOf(ribbon: EffectRibbon): number {
  return typeof ribbon.widths === 'number' ? ribbon.widths : Math.max(...ribbon.widths);
}

/** The hard white edges among the bands drawn: laid as colour, white, and neither torn nor soft. */
export function hardEdgesOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter(
    (ribbon) => ribbon.blend === 'color' && ribbon.color === '#ffffff' && !ribbon.torn && !ribbon.soft
  );
}

/** The torn bands among those drawn: the wakes blades leave. */
export function wakesOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => (ribbon.torn ?? 0) > 0);
}

/** How many points the bands of a crescent are drawn through, and those of a line or a seam laid straight through a target. */
export const CRESCENT_POINTS = 23;
export const CUT_POINTS = 9;

/** The white-hot edges of the crescents drawn, one a crescent, its afterimages having none. */
export function hotEdgesOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter(
    (ribbon) => ribbon.points.length === CRESCENT_POINTS && ribbon.core === '#ffffff' && ribbon.blend === 'color'
  );
}

/** The bodies of the crescents drawn and of their afterimages: the bands of a blade's colour whose heart is set to one side. */
export function crescentBodiesOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === CRESCENT_POINTS && ribbon.leans !== undefined);
}

/** The straight bands laid through a target that are white all through: the lines of impacts and the hearts of seams. */
export function whiteLinesOf(drawn: Staged): EffectRibbon[] {
  return hardEdgesOf(drawn).filter((ribbon) => ribbon.points.length === CUT_POINTS);
}

/** The seams open on a target: the straight bands of a blade's colour with a paler heart, which the line of an impact, white at heart, is not. */
export function seamsOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter(
    (ribbon) =>
      ribbon.points.length === CUT_POINTS &&
      ribbon.core !== undefined &&
      ribbon.core !== '#ffffff' &&
      ribbon.blend === 'color'
  );
}

/** How far a straight band reaches from end to end. */
export function lengthOf(ribbon: EffectRibbon): number {
  const from = ribbon.points[0];
  const to = ribbon.points[ribbon.points.length - 1];
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}
