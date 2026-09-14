import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { type EffectStage, stageLayoutOf, type StageWindow } from '@axe/domain/effect/effect-stage';
import type { EffectPaintContext } from '@axe/domain/effect/effect-timeline';
import type { EffectParticleLayer } from '@axe/domain/effect/particles/shared';
import {
  type EffectSprite,
  type EffectSpriteOptions,
  effectTargetCenter,
  type Point3,
  seededRandom,
} from '@axe/domain/effect/timeline/shared';

/**
 * What paints one look. It is handed in rather than reached for: the dispatch plays a
 * single-look effect as well, and each calling the other would tie them in a knot.
 */
export type EffectKindPainter = (kind: EffectStage['kind'], context: EffectPaintContext) => void;

/** What makes the particles of one look, handed in for the same reason the painter is. */
export type StageParticleEmitter = (
  preset: EffectPreset,
  seed: number,
  progress: number,
  base: number
) => EffectParticleLayer;

export interface StagedParticlePlacement {
  key: string;
  layer: EffectParticleLayer;
  /** Where that stage is happening, which is not the target for what a branch throws off. */
  center: Point3;
}

/**
 * Drawing an effect that runs in stages.
 *
 * Each stage is one of the looks the tool already draws, so nothing here paints: it works
 * out when a stage runs, where it runs from and where it runs to, and hands that to the
 * same dispatch a single-look effect goes through.
 *
 * A stage that travels paints no landing of its own — the stage after it is the landing,
 * and painting both would burst twice.
 */

/** How far a thrown branch flies from where it was thrown, against the size of a piece. */
const BRANCH_REACH = 1.6;

/**
 * The outlined sprites of a staged effect at a moment in its playback, for every target.
 *
 * Only the stages running at that moment are painted, each through the painter handed in.
 * Targets that are hidden, or whose staggered start has not come yet, are skipped.
 */
export function stagedEffectSprites(
  preset: EffectPreset,
  stages: readonly EffectStage[],
  cast: EffectCast,
  elapsedMs: number,
  options: EffectSpriteOptions,
  paint: EffectKindPainter
): EffectSprite[] {
  const sprites: EffectSprite[] = [];
  if (stages.length < 1) return sprites;

  const base = Math.max(options.baseSize, 1) * preset.sizeScale;
  const { windows } = stageLayoutOf(stages);
  // The stage sees the same preset whichever target it is playing on, so it is laid out once.
  const views = windows.map((window) => stageView(preset, window));

  cast.targets.forEach((target, index) => {
    if (options.hiddenIdentifiers?.has(target.identifier)) return;

    const localMs = elapsedMs - preset.stagger * index;
    if (localMs < 0) return;

    const center = effectTargetCenter(target, preset, options);
    windows.forEach((window, order) => {
      const progress = progressIn(window, localMs);
      if (progress === null) return;

      const view = views[order];
      const places = placesFor(window, cast, center, base);
      const context: EffectPaintContext = {
        sprites,
        prefix: `${index}-${order}`,
        center: places.center,
        base: base * (window.stage.scale ?? 1),
        progress,
        preset: view,
        random: seededRandom(cast.seed + index * 7919 + order * 104729),
        cast,
        target,
        options,
        view: options.viewRotation,
        origin: places.origin,
        // The stage after it is the landing, so a stage that travels paints none of its own.
        impactPainter: () => undefined,
      };
      paint(window.stage.kind, context);
    });
  });

  return sprites;
}

/**
 * The glowing particles of a run, one canvas for every stage that is showing.
 *
 * A single-look effect paints one canvas at the target. A run paints one per stage that is
 * up, each where that stage is happening, so what a branch throws off glows where it went
 * rather than back at the target.
 */
export function stagedEffectParticles(
  preset: EffectPreset,
  stages: readonly EffectStage[],
  cast: EffectCast,
  elapsedMs: number,
  base: number,
  options: EffectSpriteOptions,
  emit: StageParticleEmitter,
  limit = Number.POSITIVE_INFINITY
): StagedParticlePlacement[] {
  const placements: StagedParticlePlacement[] = [];
  if (stages.length < 1 || limit < 1) return placements;

  const { windows } = stageLayoutOf(stages);
  const views = windows.map((window) => stageView(preset, window));

  for (const [index, target] of cast.targets.entries()) {
    if (options.hiddenIdentifiers?.has(target.identifier)) continue;

    const localMs = elapsedMs - preset.stagger * index;
    if (localMs < 0) continue;

    const center = effectTargetCenter(target, preset, options);
    for (const [order, window] of windows.entries()) {
      // Particles are drawn onto a canvas apiece and only so many are kept, so what is
      // over the count is never made rather than made and thrown away.
      if (placements.length >= limit) return placements;

      const progress = progressIn(window, localMs);
      if (progress === null) continue;

      const places = placesFor(window, cast, center, base);
      const layer = emit(
        views[order],
        cast.seed + index * 7919 + order * 104729,
        progress,
        base * (window.stage.scale ?? 1)
      );
      if (layer.particles.length < 1) continue;

      placements.push({ key: `${index}-${order}`, layer, center: places.center });
    }
  }

  return placements;
}

/** How long the whole run takes, which is what the last stage to finish decides. */
export function stagedEffectDuration(stages: readonly EffectStage[]): number {
  return stageLayoutOf(stages).totalMs;
}

function progressIn(window: StageWindow, localMs: number): number | null {
  const length = Math.max(window.endMs - window.startMs, 1);
  const progress = (localMs - window.startMs) / length;
  return progress < 0 || progress > 1 ? null : progress;
}

/**
 * Where a stage runs from and where it runs to.
 *
 * A stage of the run itself happens at the target, travelling there from the caster. A
 * branch happens away from it: it is thrown from the point the run reached, out along its
 * own share of the spread, and lands where it gets to.
 */
function placesFor(
  window: StageWindow,
  cast: EffectCast,
  center: Point3,
  base: number
): { center: Point3; origin: Point3 | undefined } {
  if (!window.branch) return { center, origin: undefined };

  const heading = headingOf(cast.origin ?? null, center);
  const { index, count, spreadDeg } = window.branch;
  const spread = (spreadDeg * Math.PI) / 180;
  const step = count > 1 ? spread / (count - 1) : 0;
  const angle = heading - spread / 2 + step * index;
  const reach = base * BRANCH_REACH;

  return {
    center: { x: center.x + Math.cos(angle) * reach, y: center.y + Math.sin(angle) * reach, z: center.z },
    origin: center,
  };
}

/** Which way the run was going when it got here, so what it throws off carries on outwards. */
function headingOf(origin: Point3 | null, center: Point3): number {
  if (!origin) return 0;
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

/**
 * The preset as this stage sees it.
 *
 * The painters read the colours, the size and the length off the preset, so a stage is
 * given a preset of its own: the same one underneath, with its own values laid over the
 * top. They are laid on as plain properties rather than written, because writing to a
 * synchronised field would change the effect for everybody at the table.
 */
function stageView(preset: EffectPreset, window: StageWindow): EffectPreset {
  const stage = window.stage;
  const view = Object.create(preset) as EffectPreset;
  const length = Math.max(window.endMs - window.startMs, 1);
  const own: Record<string, unknown> = {
    kind: stage.kind,
    durationMs: length,
    // What the painters read is the worked-out length, which on the effect itself is the
    // whole run. A stage lasts as long as its own window and nothing longer.
    duration: length,
    isStaged: false,
    stageList: [],
    staggerMs: 0,
  };
  if (stage.grade !== undefined) own['grade'] = stage.grade;
  if (stage.colorPrimary !== undefined) own['colorPrimary'] = stage.colorPrimary;
  if (stage.colorSecondary !== undefined) own['colorSecondary'] = stage.colorSecondary;

  for (const [key, value] of Object.entries(own)) {
    Object.defineProperty(view, key, { value, enumerable: true, configurable: true });
  }
  return view;
}
