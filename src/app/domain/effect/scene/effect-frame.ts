import { areaShareOf } from '@axe/domain/effect/effect-area';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectKind } from '@axe/domain/effect/effect-kind';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';
import { placesFor, stageView } from '@axe/domain/effect/effect-stage-timeline';
import { isAimed } from '@axe/domain/effect/effect-timeline';
import { bash } from '@axe/domain/effect/scene/blade/bash';
import { skybladeWith } from '@axe/domain/effect/scene/blade/skyblade';
import { slash } from '@axe/domain/effect/scene/blade/slash';
import { bisect, dissolve, gore } from '@axe/domain/effect/scene/body/body';
import { type Choreography, nothingStaged, type Stage, type Staged } from '@axe/domain/effect/scene/choreography';
import { curse, gravity, miasma } from '@axe/domain/effect/scene/dark/dark';
import { impact, rubble, upheaval } from '@axe/domain/effect/scene/earth/earth';
import { breath } from '@axe/domain/effect/scene/fire/breath';
import { burst } from '@axe/domain/effect/scene/fire/burst';
import { flame } from '@axe/domain/effect/scene/fire/flame';
import { mushroom } from '@axe/domain/effect/scene/fire/mushroom';
import { nova } from '@axe/domain/effect/scene/fire/nova';
import { aura, barrier, heal, warp } from '@axe/domain/effect/scene/holy/holy';
import { hasScenePart, SCENE_LINGER_S, strikesInSceneWith, STRIKING_WITH } from '@axe/domain/effect/scene/scene-kinds';
import { arrowrain, ballisticWith, projectileWith } from '@axe/domain/effect/scene/shot/shots';
import { arc, beam, drain, raybeam } from '@axe/domain/effect/scene/shot/streams';
import { bolt, frost, vortex } from '@axe/domain/effect/scene/storm/storm';
import { projectileTiming } from '@axe/domain/effect/timeline/flight-timing';
import { targetScaleOf } from '@axe/domain/effect/timeline/shared';

export {
  drawsOnlyPicturesOver,
  hasScenePart,
  isDrawnInScene,
  sceneLingerMsOf,
} from '@axe/domain/effect/scene/scene-kinds';

/** The looks drawn in the scene and those drawn alongside a piece's picture, for a spec to hold the list of kinds to. */
export function sceneLooks(): {
  readonly wholly: Readonly<Partial<Record<EffectKind, Choreography>>>;
  readonly alongside: Readonly<Partial<Record<EffectKind, Choreography>>>;
  readonly travelling: Readonly<Partial<Record<EffectKind, Choreography>>>;
} {
  return { wholly: CHOREOGRAPHIES, alongside: ALONGSIDE, travelling: TRAVELLING };
}

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
  gore,
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

/**
 * The looks that cut a piece's own picture, which is still drawn over the table: what is drawn about
 * the picture, the flash, the blood and the light, is drawn in the scene alongside it.
 */
const ALONGSIDE: Partial<Record<EffectKind, Choreography>> = { bisect, dissolve };

/**
 * The look a preset strikes with, drawn on its own clock: one that cuts a piece's picture draws all
 * but the picture, which is drawn over the table.
 */
function strikeWith(stage: Stage): Staged {
  const kind = strikesInSceneWith(stage.preset.impactEffectKind);
  const look = CHOREOGRAPHIES[kind] ?? ALONGSIDE[kind];
  return look ? look.draw(stage) : nothingStaged();
}

CHOREOGRAPHIES.skyblade = skybladeWith(strikeWith, SCENE_LINGER_S.skyblade ?? 0);
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

/**
 * The looks a stage of a run draws. A shot or a blade that travels lands nothing of its own: the
 * stage after it is its landing, and drawing both would burst twice.
 */
const TRAVELLING: Partial<Record<EffectKind, Choreography>> = {
  projectile: projectileWith(() => nothingStaged()),
  ballistic: ballisticWith(() => nothingStaged()),
  skyblade: skybladeWith(() => nothingStaged(), 0),
};

/**
 * The look one stage of a run draws in the scene, all but the picture for one that cuts a piece's
 * picture, or nothing for a look not drawn there.
 */
function stageLookOf(kind: EffectKind): Choreography | undefined {
  return STRIKING_WITH.has(kind) ? TRAVELLING[kind] : (CHOREOGRAPHIES[kind] ?? ALONGSIDE[kind]);
}

/**
 * How far into its own flight a stage that travels is, as a shot of its kind would be: a shot flies
 * the whole of its stage, from where it is thrown at the start of it to where it lands at its end.
 */
function flightShareOf(view: EffectPreset, kind: EffectKind, blowsAt: readonly number[], duration: number): number {
  if (kind === 'projectile') return projectileTiming(view).shots.at(-1)?.land ?? 1;
  if (kind === 'ballistic') return duration > 0 && blowsAt[0] !== undefined ? blowsAt[0] / duration : 0.86;
  return 1;
}

/** Adds what a run of stages draws in the scene at a moment, each stage where and when it runs; see {@link stageEffect}. */
function stageRun(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  options: EffectStagingOptions,
  into: Staged
): void {
  const { windows } = stageLayoutOf(preset.stageList);
  const base = options.cellPx * preset.sizeScale;
  const caster = originOf(cast, options);
  const views = windows.map((window) => stageView(preset, window));
  cast.targets.forEach((target, index) => {
    if (options.hiddenIdentifiers?.has(target.identifier)) return;
    const localMs = elapsedMs - preset.stagger * index;
    if (localMs < 0) return;
    const footing = footingOf(target, preset, options);
    windows.forEach((window, order) => {
      const look = stageLookOf(window.stage.kind);
      if (!look) return;
      const duration = Math.max(window.endMs - window.startMs, 1) / 1000;
      const seconds = (localMs - window.startMs) / 1000;
      if (seconds < 0 || seconds >= duration + look.lingerS) return;
      const view = views[order];
      const blowsAt = effectBlowsOf(view).map((blow) => blow.atMs / 1000);
      const places = placesFor(window, cast, footing, base);
      const travels = window.stage.role === 'travel';
      const scale = targetScaleOf(
        { baseSize: options.cellPx, resolveSize: options.resolveSize },
        target.identifier,
        travels
      );
      const flies = travels ? flightShareOf(view, window.stage.kind, blowsAt, duration) : 1;
      const staged = look.draw({
        x: places.center.x,
        y: places.center.y,
        z: places.center.z,
        groundZ: footing.groundZ,
        cell: base * (window.stage.scale ?? 1) * scale,
        seconds: seconds * flies,
        duration,
        blowsAt,
        index,
        areaPx: 0,
        origin: places.origin ?? caster,
        seed: cast.seed + index * 7919 + order * 104729,
        preset: view,
      });
      into.motes.push(...staged.motes);
      into.ribbons.push(...staged.ribbons);
      into.floor.push(...staged.floor);
      into.lights.push(...staged.lights);
    });
  });
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
  if (preset.isStaged) {
    if (hasScenePart(preset)) stageRun(preset, cast, elapsedMs, options, into);
    return;
  }
  const choreography = hasScenePart(preset)
    ? (CHOREOGRAPHIES[preset.effectKind] ?? ALONGSIDE[preset.effectKind])
    : undefined;
  if (!choreography) return;
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
