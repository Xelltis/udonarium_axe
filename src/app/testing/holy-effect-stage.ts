import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';

/* What the specs of the looks of holy light share: a preset of one, a cast of it, and what it draws at a moment. */

export const CELL = 50;

/** A preset of a look of holy light, in its gold and white. */
export function holyPresetOf(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 4000;
  preset.colorPrimary = '#fffbe0';
  preset.colorSecondary = '#ffc24a';
  Object.assign(preset, fields);
  return preset;
}

/** A cast on some points, from a caster off to the west or from no one. */
export function castOn(points: readonly { x: number; y: number }[], caster = true, seed = 11): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? { x: 50, y: 300, z: 30 } : null,
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

/** Whether a band stands straight up over one point of the floor, taller than a cell. */
export function standsUpright(ribbon: EffectRibbon): boolean {
  const [first] = ribbon.points;
  const heights = ribbon.points.map((point) => point.z);
  return (
    ribbon.points.every((point) => Math.abs(point.x - first.x) < 0.01 && Math.abs(point.y - first.y) < 0.01) &&
    Math.max(...heights) - Math.min(...heights) > CELL
  );
}

/** The bands that stand straight up within a distance of a point of the floor. */
export function uprightAt(drawn: Staged, at: { x: number; y: number }, within = 1): EffectRibbon[] {
  return drawn.ribbons.filter(
    (ribbon) => standsUpright(ribbon) && Math.hypot(ribbon.points[0].x - at.x, ribbon.points[0].y - at.y) <= within
  );
}

/** Whether a band lies level, all of it at one height. */
export function liesLevel(ribbon: EffectRibbon): boolean {
  return ribbon.points.every((point) => Math.abs(point.z - ribbon.points[0].z) < 0.01);
}
