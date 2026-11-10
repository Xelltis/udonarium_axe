import { areaShareOf } from '@axe/domain/effect/effect-area';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectKind } from '@axe/domain/effect/effect-kind';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { isAimed } from '@axe/domain/effect/effect-timeline';
import { bash } from '@axe/domain/effect/scene/blade/bash';
import { skybladeWith } from '@axe/domain/effect/scene/blade/skyblade';
import { slash } from '@axe/domain/effect/scene/blade/slash';
import { type Choreography, nothingStaged, type Stage, type Staged } from '@axe/domain/effect/scene/choreography';
import { curse, gravity, miasma } from '@axe/domain/effect/scene/dark/dark';
import { impact, rubble, upheaval } from '@axe/domain/effect/scene/earth/earth';
import { breath } from '@axe/domain/effect/scene/fire/breath';
import { burst } from '@axe/domain/effect/scene/fire/burst';
import { flame } from '@axe/domain/effect/scene/fire/flame';
import { mushroom } from '@axe/domain/effect/scene/fire/mushroom';
import { nova } from '@axe/domain/effect/scene/fire/nova';
import { aura, barrier, heal, warp } from '@axe/domain/effect/scene/holy/holy';
import { arrowrain, ballisticWith, projectileWith } from '@axe/domain/effect/scene/shot/shots';
import { arc, beam, drain, raybeam } from '@axe/domain/effect/scene/shot/streams';
import { bolt, frost, vortex } from '@axe/domain/effect/scene/storm/storm';
import { targetScaleOf } from '@axe/domain/effect/timeline/shared';

/** The looks drawn in the table's scene, among the pieces, rather than over it. */
const CHOREOGRAPHIES: Partial<Record<EffectKind, Choreography>> = {
  arc,
  arrowrain,
  aura,
  barrier,
  bash,
  beam,
  bolt,
  breath,
  burst,
  curse,
  drain,
  flame,
  frost,
  gravity,
  heal,
  impact,
  miasma,
  mushroom,
  nova,
  raybeam,
  rubble,
  slash,
  upheaval,
  vortex,
  warp,
};

/** The looks that strike with another look, which are drawn in the scene only once the look they strike with is. */
const STRIKING_WITH: ReadonlySet<EffectKind> = new Set<EffectKind>(['skyblade', 'projectile', 'ballistic']);

/** How long the great blade lingers after its playback, long enough for the look it strikes with to clear. */
const SKYBLADE_LINGER_S = 1.8;

/** The look a preset strikes with, drawn on its own clock, or nothing where that look is not drawn in the scene. */
function strikeWith(stage: Stage): Staged {
  const kind = stage.preset.impactEffectKind;
  const look = STRIKING_WITH.has(kind) ? undefined : CHOREOGRAPHIES[kind];
  return look ? look.draw(stage) : nothingStaged();
}

CHOREOGRAPHIES.skyblade = skybladeWith(strikeWith, SKYBLADE_LINGER_S);
CHOREOGRAPHIES.projectile = projectileWith(strikeWith);
CHOREOGRAPHIES.ballistic = ballisticWith(strikeWith);

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
export function isDrawnInScene(
  preset: Pick<EffectPreset, 'isStaged' | 'effectKind'> & Partial<Pick<EffectPreset, 'impactEffectKind'>>
): boolean {
  if (preset.isStaged || CHOREOGRAPHIES[preset.effectKind] === undefined) return false;
  if (!STRIKING_WITH.has(preset.effectKind)) return true;
  const strikesWith = preset.impactEffectKind;
  return strikesWith !== undefined && !STRIKING_WITH.has(strikesWith) && CHOREOGRAPHIES[strikesWith] !== undefined;
}

/**
 * How long an effect drawn in the scene goes on being drawn after its playback, in milliseconds, as
 * what it leaves clears: smoke rising away and embers dying. Nothing for one drawn over it.
 */
export function sceneLingerMsOf(
  preset: Pick<EffectPreset, 'isStaged' | 'effectKind'> & Partial<Pick<EffectPreset, 'impactEffectKind'>>
): number {
  if (!isDrawnInScene(preset)) return 0;
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
  if (!choreography || !isDrawnInScene(preset)) return;
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
