import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';

/* What the specs of the looks of lightning share: a preset of one, a cast of it, and what it draws at a moment. */

export const CELL = 50;
/** Where the caster's hand is, off to the west of every target. */
export const HAND = { x: 50, y: 300, z: 30 };

/** A preset of a look of lightning, in its pale blue and violet, on up to six targets a beat apart. */
export function thunderPresetOf(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 1567;
  preset.staggerMs = 140;
  preset.colorPrimary = '#dcefff';
  preset.colorSecondary = '#7b5cff';
  Object.assign(preset, fields);
  return preset;
}

/** A cast on some points, from a caster off to the west or from no one. */
export function castOn(points: readonly { x: number; y: number }[], caster = true, seed = 11): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? HAND : null,
    targets: points.map((point, index) => ({ identifier: `t${index}`, ...point, z: 0 })),
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

/** Whether two points stand over the same place on the floor, within a distance. */
function over(a: { x: number; y: number }, b: { x: number; y: number }, within: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= within;
}

/**
 * The bands of light that run from over one place to over another, the widest first: the bolts
 * between the two, told from the dark and the colour laid under them.
 */
export function boltsBetween(
  drawn: Staged,
  from: { x: number; y: number },
  to: { x: number; y: number },
  within = 1
): EffectRibbon[] {
  return drawn.ribbons
    .filter(
      (ribbon) =>
        ribbon.blend === 'light' && over(ribbon.points[0], from, within) && over(ribbon.points.at(-1)!, to, within)
    )
    .sort((a, b) => widestOf(b) - widestOf(a));
}

/** The bands of light that end over a place, the widest first, wherever they come from. */
export function boltsOnto(drawn: Staged, to: { x: number; y: number }, within = 1): EffectRibbon[] {
  return drawn.ribbons
    .filter((ribbon) => ribbon.blend === 'light' && over(ribbon.points.at(-1)!, to, within))
    .sort((a, b) => widestOf(b) - widestOf(a));
}

/** Whether a band lies level on the floor, all of it lower than a tenth of a cell. */
export function liesOnFloor(ribbon: EffectRibbon): boolean {
  return ribbon.points.every((point) => point.z < CELL * 0.1);
}
