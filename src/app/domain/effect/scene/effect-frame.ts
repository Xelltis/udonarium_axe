import { areaShareOf } from '@axe/domain/effect/effect-area';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectKind } from '@axe/domain/effect/effect-kind';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';
import { placesFor, stageView } from '@axe/domain/effect/effect-stage-timeline';
import { isAimed } from '@axe/domain/effect/effect-timeline';
import { curse } from '@axe/domain/effect/scene/ailment/curse';
import { skybladeWith } from '@axe/domain/effect/scene/blade/skyblade';
import { slash } from '@axe/domain/effect/scene/blade/slash';
import { bisect } from '@axe/domain/effect/scene/body/bisect';
import { gore } from '@axe/domain/effect/scene/body/body';
import { dissolve } from '@axe/domain/effect/scene/body/dissolve';
import { breath } from '@axe/domain/effect/scene/breath/breath';
import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  type StageMouth,
  type StageTarget,
} from '@axe/domain/effect/scene/choreography';
import { darkorb, struckOrb } from '@axe/domain/effect/scene/dark/darkorb';
import { drain } from '@axe/domain/effect/scene/dark/drain';
import { miasma } from '@axe/domain/effect/scene/dark/miasma';
import { shadow, struckShadow } from '@axe/domain/effect/scene/dark/shadow';
import { impact } from '@axe/domain/effect/scene/earth/impact';
import { quake, struckQuake } from '@axe/domain/effect/scene/earth/quake';
import { rubble } from '@axe/domain/effect/scene/earth/rubble';
import { struckImpact, struckRubble } from '@axe/domain/effect/scene/earth/struck';
import { upheaval } from '@axe/domain/effect/scene/earth/upheaval';
import { type BreathingBody, handsBefore, mouthBefore } from '@axe/domain/effect/scene/effect-mouth';
import { burst } from '@axe/domain/effect/scene/fire/burst';
import { flame } from '@axe/domain/effect/scene/fire/flame';
import { mushroom } from '@axe/domain/effect/scene/fire/mushroom';
import { nova } from '@axe/domain/effect/scene/fire/nova';
import { aura } from '@axe/domain/effect/scene/holy/aura';
import { barrier } from '@axe/domain/effect/scene/holy/barrier';
import { halo } from '@axe/domain/effect/scene/holy/halo';
import { heal } from '@axe/domain/effect/scene/holy/heal';
import { sanctuary } from '@axe/domain/effect/scene/holy/sanctuary';
import { shotSmite } from '@axe/domain/effect/scene/holy/shot-smite';
import { smite } from '@axe/domain/effect/scene/holy/smite';
import { hasScenePart, SCENE_LINGER_S, strikesInSceneWith, STRIKING_WITH } from '@axe/domain/effect/scene/scene-kinds';
import { arc } from '@axe/domain/effect/scene/shot/arc';
import { arrowrain } from '@axe/domain/effect/scene/shot/arrow-rain';
import { beam, raybeam } from '@axe/domain/effect/scene/shot/beam';
import { ballisticWith, projectileWith } from '@axe/domain/effect/scene/shot/shots';
import { gravity } from '@axe/domain/effect/scene/space/gravity';
import { warp } from '@axe/domain/effect/scene/space/warp';
import { bolt, shotBolt } from '@axe/domain/effect/scene/storm/bolt';
import { frost } from '@axe/domain/effect/scene/storm/frost';
import { bash } from '@axe/domain/effect/scene/strike/bash';
import { vortex } from '@axe/domain/effect/scene/wind/vortex';
import { projectileTiming } from '@axe/domain/effect/timeline/flight-timing';
import { targetScaleOf } from '@axe/domain/effect/timeline/shared';

export { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
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
  darkorb,
  drain,
  flame,
  frost,
  gore,
  gravity,
  halo,
  heal,
  impact,
  miasma,
  mushroom,
  nova,
  quake,
  raybeam,
  rubble,
  sanctuary,
  shadow,
  slash,
  smite,
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
 * The looks a shot or a blade lands with that are not the look of the same kind cast on its own: the
 * impact of an arrow or a bullet is a flash and a puff of dust, not the ground stamped in; and what
 * lands in darkness lands in its spikes or in the bursting of its sphere whatever its grade, never
 * in a mire or an eclipse; and what lands in a quake tears a rift open close before its target.
 */
const LANDINGS: Partial<Record<EffectKind, Choreography>> = {
  impact: struckImpact,
  rubble: struckRubble,
  shadow: struckShadow,
  darkorb: struckOrb,
  quake: struckQuake,
};

/**
 * The looks a shot lands with that a great blade does not: a shot that lands in light that smites
 * lands in the least of it, and one that lands in a bolt of lightning in the least of those, where a
 * blade brings down the light or the lightning of its own grade.
 */
const SHOT_LANDINGS: Partial<Record<EffectKind, Choreography>> = { smite: shotSmite, bolt: shotBolt };

/**
 * The look a preset strikes with, drawn on its own clock: one that cuts a piece's picture draws all
 * but the picture, which is drawn over the table.
 */
function strikeWith(stage: Stage): Staged {
  const kind = strikesInSceneWith(stage.preset.impactEffectKind);
  const shot = stage.preset.effectKind === 'skyblade' ? undefined : SHOT_LANDINGS[kind];
  const look = shot ?? LANDINGS[kind] ?? CHOREOGRAPHIES[kind] ?? ALONGSIDE[kind];
  return look ? look.draw(stage) : nothingStaged();
}

CHOREOGRAPHIES.skyblade = skybladeWith(strikeWith, SCENE_LINGER_S.skyblade ?? 0);
CHOREOGRAPHIES.projectile = projectileWith(strikeWith);
CHOREOGRAPHIES.ballistic = ballisticWith(strikeWith);

/**
 * The looks that go off about their target and yet grow only by the root of its size, as what is
 * aimed at it does: the looks of earth, whose boulders and pillars, as many times larger as a dragon
 * is than a man, would wall the table off; ice that strikes, whose crystals would; and a bolt of
 * lightning, whose storm would darken all of it. A cut grows so too: its crescent is as thick as a
 * piece, and one grown as a dragon is would hide the table. So does a strike, whose star and rings
 * would cover a giant and those standing beside it, and a barrier, whose dome would take in the
 * pieces round the one it wards. So do a healing, an aura, the looks of space and time and those of
 * darkness, whose canopies, pillars, circles, pits and spheres would cover the table.
 */
const GROWS_BY_ROOT: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'impact',
  'rubble',
  'upheaval',
  'quake',
  'frost',
  'slash',
  'bolt',
  'bash',
  'barrier',
  'heal',
  'aura',
  'warp',
  'gravity',
  'shadow',
  'darkorb',
]);

/**
 * The looks that are told of the pieces standing by: a breath and the torrent of a great sword break
 * on those in their way, and a great beam washes over them.
 */
const BREAKS_ON_BYSTANDERS: ReadonlySet<EffectKind> = new Set<EffectKind>(['breath', 'skyblade', 'beam']);

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
  /** How tall a target stands over its foot as it is drawn, in table pixels; as tall as it is wide without it. */
  readonly resolveHeight?: (identifier: string) => number | null;
  /**
   * The pieces standing on the table now, for a breath to break on those in its way: asked for only
   * by a look that breaks on them, and never sent, each seat telling of the pieces it draws.
   */
  readonly resolveStanding?: () => readonly string[];
}

/**
 * The looks a stage of a run draws. A shot or a blade that travels lands nothing of its own: the
 * stage after it is its landing, and drawing both would burst twice.
 */
const TRAVELLING: Partial<Record<EffectKind, Choreography>> = {
  projectile: projectileWith(null),
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

/**
 * Adds what a run of stages draws in the scene at a moment, each stage where and when it runs; see
 * {@link stageEffect}. Each stage plays where it runs to, a branch away from the target, so what it
 * plays over is that one place, and a breath in it leaves the place the stage runs from.
 */
function stageRun(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  options: EffectStagingOptions,
  into: Staged
): void {
  const { windows } = stageLayoutOf(preset.stageList);
  const base = options.cellPx * preset.sizeScale;
  const casterFooting = casterFootingOf(cast, options);
  const caster = originOf(cast, casterFooting, standingTargets(preset, cast, options), options);
  const body = bodyOf(cast, casterFooting, options);
  const views = windows.map((window) => stageView(preset, window));
  // When each stage's blows land, worked out once a frame for every target the run strikes.
  const blowsAtOf = views.map((view) => effectBlowsOf(view).map((blow) => blow.atMs / 1000));
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
      const blowsAt = blowsAtOf[order];
      const places = placesFor(window, cast, footing, base);
      const travels = window.stage.role === 'travel';
      const scale = targetScaleOf(
        { baseSize: options.cellPx, resolveSize: options.resolveSize },
        target.identifier,
        travels
      );
      const flies = travels ? flightShareOf(view, window.stage.kind, blowsAt, duration) : 1;
      const place: StageTarget = {
        index,
        ...places.center,
        groundZ: footing.groundZ,
        widthPx: widthOf(target.identifier, options),
      };
      const staged = look.draw({
        x: places.center.x,
        y: places.center.y,
        z: places.center.z,
        groundZ: footing.groundZ,
        cell: base * (window.stage.scale ?? 1) * scale,
        tall: heightOf(target.identifier, options),
        seconds: seconds * flies,
        duration,
        blowsAt,
        index,
        areaPx: 0,
        origin: places.origin ?? caster,
        targets: [place],
        mouth: places.origin
          ? { ...places.origin, widthPx: options.cellPx }
          : body && mouthBefore(body, [places.center]),
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
  const casterFooting = casterFootingOf(cast, options);
  const targets = standingTargets(preset, cast, options);
  const origin = originOf(cast, casterFooting, targets, options);
  const body = bodyOf(cast, casterFooting, options);
  const mouth: StageMouth | null = body && mouthBefore(body, targets);
  const bystanders = BREAKS_ON_BYSTANDERS.has(preset.effectKind) ? bystandersOf(cast, options) : undefined;
  for (const standing of targets) {
    const index = standing.index;
    const target = cast.targets[index];
    const seconds = (elapsedMs - preset.stagger * index) / 1000;
    if (seconds < 0 || seconds >= duration + choreography.lingerS) continue;
    const scale = targetScaleOf(
      { baseSize: options.cellPx, resolveSize: options.resolveSize },
      target.identifier,
      isAimed(preset) || GROWS_BY_ROOT.has(preset.effectKind)
    );
    const staged = choreography.draw({
      x: standing.x,
      y: standing.y,
      z: standing.z,
      groundZ: standing.groundZ,
      cell: base * areaShareOf(preset, cast, index) * scale,
      tall: heightOf(target.identifier, options),
      seconds,
      duration,
      blowsAt,
      index,
      areaPx: preset.areaRadiusCells * options.cellPx,
      origin,
      targets,
      bystanders,
      mouth,
      seed: cast.seed + index * 7919,
      preset,
    });
    into.motes.push(...staged.motes);
    into.ribbons.push(...staged.ribbons);
    into.floor.push(...staged.floor);
    into.lights.push(...staged.lights);
  }
}

/** How short and how tall a target is counted against its width, however it is drawn: a picture laid flat, or a banner. */
const SHORTEST_BY_WIDTH = 0.5;
const TALLEST_BY_WIDTH = 3;
/** How high over the foot of a caster where it was cast from an effect aimed from it leaves it, in cells of the table: from its hands. */
const AIMED_FROM_CELLS = 0.6;

/** Where the caster of a cast stands as it is drawn now; null for a caster that is not drawn, or for none. */
function casterFootingOf(cast: EffectCast, options: EffectStagingOptions): EffectFooting | null {
  return (cast.casterIdentifier ? options.resolveFooting?.(cast.casterIdentifier) : null) ?? null;
}

/**
 * Where an effect aimed from its caster leaves it: from the hands of the caster as it is drawn now,
 * before a large one's body towards what it is aimed at, or else where it stood as it was cast; null
 * for one cast from nowhere.
 */
function originOf(
  cast: EffectCast,
  caster: EffectFooting | null,
  aims: readonly StageTarget[],
  options: EffectStagingOptions
) {
  if (caster) return handsBefore({ ...caster, widthPx: widthOf(cast.casterIdentifier, options) }, aims, options.cellPx);
  return cast.origin ? { x: cast.origin.x, y: cast.origin.y, z: cast.origin.z } : null;
}

/** How wide a piece is, in table pixels: a cell where its size is not known. */
function widthOf(identifier: string, options: EffectStagingOptions): number {
  const cells = identifier.length > 0 ? (options.resolveSize?.(identifier) ?? 1) : 1;
  return options.cellPx * (cells > 0 ? cells : 1);
}

/**
 * How tall a piece stands over its foot, in table pixels: as it is drawn where the table tells it,
 * held between half its width and three times it, and as tall as it is wide where it does not.
 */
function heightOf(identifier: string, options: EffectStagingOptions): number {
  const wide = widthOf(identifier, options);
  const drawn = identifier.length > 0 ? options.resolveHeight?.(identifier) : null;
  return drawn && drawn > 0 ? Math.min(Math.max(drawn, wide * SHORTEST_BY_WIDTH), wide * TALLEST_BY_WIDTH) : wide;
}

/**
 * The caster as a breath leaves it: its foot as it is drawn now and how wide it is, or else a piece
 * of one cell standing under where it was cast from; null for one cast from nowhere.
 */
function bodyOf(cast: EffectCast, caster: EffectFooting | null, options: EffectStagingOptions): BreathingBody | null {
  if (caster) return { x: caster.x, y: caster.y, z: caster.z, widthPx: widthOf(cast.casterIdentifier, options) };
  if (!cast.origin) return null;
  const foot = cast.origin.z - options.cellPx * AIMED_FROM_CELLS;
  return { x: cast.origin.x, y: cast.origin.y, z: foot, widthPx: options.cellPx };
}

/** The pieces standing on the table that are neither a target of a cast nor its caster, where each stands now. */
function bystandersOf(cast: EffectCast, options: EffectStagingOptions): StageTarget[] {
  const taken = new Set([cast.casterIdentifier, ...cast.targets.map((target) => target.identifier)]);
  const standing: StageTarget[] = [];
  for (const identifier of options.resolveStanding?.() ?? []) {
    if (taken.has(identifier)) continue;
    const footing = options.resolveFooting?.(identifier);
    if (footing) standing.push({ index: -1, ...footing, widthPx: widthOf(identifier, options) });
  }
  return standing;
}

/** Every target of a cast that is drawn, where it stands now, in the order they were picked. */
function standingTargets(
  preset: Pick<EffectPreset, 'followTarget'>,
  cast: EffectCast,
  options: EffectStagingOptions
): StageTarget[] {
  const standing: StageTarget[] = [];
  cast.targets.forEach((target, index) => {
    if (options.hiddenIdentifiers?.has(target.identifier)) return;
    standing.push({ index, ...footingOf(target, preset, options), widthPx: widthOf(target.identifier, options) });
  });
  return standing;
}

function footingOf(
  target: { identifier: string; x: number; y: number; z: number },
  preset: Pick<EffectPreset, 'followTarget'>,
  options: EffectStagingOptions
): EffectFooting {
  const now = preset.followTarget && target.identifier.length > 0 ? options.resolveFooting?.(target.identifier) : null;
  return now ?? { x: target.x, y: target.y, z: target.z, groundZ: target.z };
}
