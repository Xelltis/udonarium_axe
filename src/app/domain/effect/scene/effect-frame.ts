import { areaShareOf } from '@axe/domain/effect/effect-area';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectKind } from '@axe/domain/effect/effect-kind';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { isAimed } from '@axe/domain/effect/effect-timeline';
import { type Choreography, type Staged } from '@axe/domain/effect/scene/choreography';
import { breath } from '@axe/domain/effect/scene/fire/breath';
import { burst } from '@axe/domain/effect/scene/fire/burst';
import { flame } from '@axe/domain/effect/scene/fire/flame';
import { mushroom } from '@axe/domain/effect/scene/fire/mushroom';
import { nova } from '@axe/domain/effect/scene/fire/nova';
import { targetScaleOf } from '@axe/domain/effect/timeline/shared';

/** The looks drawn in the table's scene, among the pieces, rather than over it. */
const CHOREOGRAPHIES: Partial<Record<EffectKind, Choreography>> = { breath, burst, flame, mushroom, nova };

/** Where a target stands for an effect: its foot, and the floor under it. */
export interface EffectFooting {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How high the floor under it is, in table pixels, below its foot where it flies. */
  readonly groundZ: number;
}

export interface EffectStagingOptions {
  /** How wide a cell of the table is, in table pixels. */
  readonly cellPx: number;
  /** The targets not to draw, such as a piece out of sight. */
  readonly hiddenIdentifiers?: ReadonlySet<string>;
  /** Where a target stands now, for an effect that follows it; without it, where it stood as it was cast. */
  readonly resolveFooting?: (identifier: string) => EffectFooting | null;
  /** How many cells across a target is; one without it. */
  readonly resolveSize?: (identifier: string) => number;
}

/** Whether an effect is drawn in the table's scene: a look of a single kind that has been made anew for it. */
export function isDrawnInScene(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return !preset.isStaged && CHOREOGRAPHIES[preset.effectKind] !== undefined;
}

/**
 * How long an effect drawn in the scene goes on being drawn after its playback, in milliseconds, as
 * what it leaves clears: smoke rising away and embers dying. Nothing for one drawn over it.
 */
export function sceneLingerMsOf(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): number {
  if (preset.isStaged) return 0;
  return (CHOREOGRAPHIES[preset.effectKind]?.lingerS ?? 0) * 1000;
}

/**
 * Adds what a cast draws in the table's scene at a moment into what is drawn, once for each target
 * whose own playback is under way or whose look still lingers, as large as the target for what goes
 * off about it; hidden targets are skipped.
 */
export function stageEffect(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  options: EffectStagingOptions,
  into: Staged
): void {
  const choreography = CHOREOGRAPHIES[preset.effectKind];
  if (!choreography || preset.isStaged) return;
  const duration = preset.duration / 1000;
  const base = options.cellPx * preset.sizeScale;
  const blowsAt = effectBlowsOf(preset).map((blow) => blow.atMs / 1000);
  const origin = originOf(cast, options);
  cast.targets.forEach((target, index) => {
    if (options.hiddenIdentifiers?.has(target.identifier)) return;
    const seconds = (elapsedMs - preset.stagger * index) / 1000;
    if (seconds < 0 || seconds >= duration + choreography.lingerS) return;
    const footing = footingOf(target, preset, options);
    const scale = targetScaleOf(
      { baseSize: options.cellPx, resolveSize: options.resolveSize },
      target.identifier,
      isAimed(preset)
    );
    const staged = choreography.draw({
      x: footing.x,
      y: footing.y,
      z: footing.z,
      groundZ: footing.groundZ,
      cell: base * areaShareOf(preset, cast, index) * scale,
      seconds,
      duration,
      blowsAt,
      index,
      areaPx: preset.areaRadiusCells * options.cellPx,
      origin,
      seed: cast.seed + index * 7919,
      preset,
    });
    into.motes.push(...staged.motes);
    into.ribbons.push(...staged.ribbons);
    into.floor.push(...staged.floor);
    into.lights.push(...staged.lights);
  });
}

/** How high over a caster's foot an effect aimed from it leaves it, in cells of the table: from its hands or its mouth. */
const AIMED_FROM_CELLS = 0.6;

/**
 * Where an effect aimed from its caster leaves it: from the caster as it is drawn now, or else where
 * it stood as it was cast; null for one cast from nowhere.
 */
function originOf(cast: EffectCast, options: EffectStagingOptions) {
  const caster = cast.casterIdentifier ? options.resolveFooting?.(cast.casterIdentifier) : null;
  if (caster) return { x: caster.x, y: caster.y, z: caster.z + options.cellPx * AIMED_FROM_CELLS };
  return cast.origin ? { x: cast.origin.x, y: cast.origin.y, z: cast.origin.z } : null;
}

function footingOf(
  target: { identifier: string; x: number; y: number; z: number },
  preset: Pick<EffectPreset, 'followTarget'>,
  options: EffectStagingOptions
): EffectFooting {
  const now = preset.followTarget && target.identifier.length > 0 ? options.resolveFooting?.(target.identifier) : null;
  return now ?? { x: target.x, y: target.y, z: target.z, groundZ: target.z };
}
