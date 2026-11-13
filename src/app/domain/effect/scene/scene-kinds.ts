import type { EffectKind } from '@axe/domain/effect/effect-kind';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type EffectStage, stageLayoutOf } from '@axe/domain/effect/effect-stage';

/*
 * Which looks are drawn in the table's scene, and how long each lingers there after its playback.
 *
 * The looks themselves are loaded only once one plays; what the page needs to know before that, to
 * leave a look to the scene and to keep its playback going while it lingers, is kept here, without
 * them. A spec holds this to the looks as they are.
 */

/** How long each look drawn wholly in the scene lingers after its playback, in seconds, while what it leaves clears. */
export const SCENE_LINGER_S: Readonly<Partial<Record<EffectKind, number>>> = {
  arc: 0.4,
  arrowrain: 0.8,
  aura: 0.5,
  ballistic: 1.8,
  barrier: 0.5,
  bash: 0.6,
  beam: 0.6,
  bolt: 0.8,
  breath: 1.5,
  burst: 1.8,
  curse: 0.6,
  drain: 0.5,
  flame: 1.6,
  frost: 0.8,
  gore: 1.4,
  gravity: 0.8,
  heal: 0.6,
  impact: 0.8,
  miasma: 1,
  mushroom: 2.5,
  nova: 2.2,
  projectile: 1.8,
  raybeam: 0.6,
  rubble: 1,
  skyblade: 1.8,
  slash: 0.6,
  upheaval: 1,
  vortex: 0.8,
  warp: 0.6,
};

/** How long a shot or a blade that travels as a stage of a run lingers, landing nothing of its own. */
export const TRAVELLING_LINGER_S: Readonly<Partial<Record<EffectKind, number>>> = {
  projectile: 1.8,
  ballistic: 1.8,
  skyblade: 0,
};

/** The looks that strike with another look, which are drawn in the scene only once the look they strike with is. */
export const STRIKING_WITH: ReadonlySet<EffectKind> = new Set<EffectKind>(['skyblade', 'projectile', 'ballistic']);

/**
 * The looks that cut a piece's own picture, which is still drawn over the table: what is drawn about
 * the picture, the flash, the blood and the light, is drawn in the scene alongside it.
 */
export const ALONGSIDE_PICTURES: ReadonlySet<EffectKind> = new Set<EffectKind>(['bisect', 'dissolve']);

type SceneQuestion = Pick<EffectPreset, 'isStaged' | 'effectKind'> &
  Partial<Pick<EffectPreset, 'impactEffectKind' | 'stageList'>>;

/** Whether one stage of a run is a look drawn in the scene: a shot or a blade that travels lands nothing of its own there. */
export function stageDrawnInScene(kind: EffectKind): boolean {
  return STRIKING_WITH.has(kind) ? TRAVELLING_LINGER_S[kind] !== undefined : SCENE_LINGER_S[kind] !== undefined;
}

/** How long one stage of a run lingers in the scene, in seconds. */
export function stageLingerS(kind: EffectKind): number {
  return (STRIKING_WITH.has(kind) ? TRAVELLING_LINGER_S[kind] : SCENE_LINGER_S[kind]) ?? 0;
}

/**
 * The look a shot or a blade strikes with in the scene: the one it names, but where that is a look
 * that itself strikes with another, a burst, as a shot that names itself does.
 */
export function strikesInSceneWith(kind: EffectKind | undefined): EffectKind {
  return kind === undefined || STRIKING_WITH.has(kind) ? 'burst' : kind;
}

/** The kinds of the stages of a run, and of the branches it throws. */
function runKindsOf(stages: readonly EffectStage[] | undefined): EffectKind[] {
  return stages && stages.length > 0 ? stageLayoutOf(stages).windows.map((window) => window.stage.kind) : [];
}

/**
 * Whether an effect cuts a piece's own picture, which is drawn over the table: a look of such a kind,
 * a shot or a blade that strikes with one, or a run with a stage of one.
 */
function cutsPicture(preset: SceneQuestion): boolean {
  if (preset.isStaged) return runKindsOf(preset.stageList).some((kind) => ALONGSIDE_PICTURES.has(kind));
  if (ALONGSIDE_PICTURES.has(preset.effectKind)) return true;
  return STRIKING_WITH.has(preset.effectKind) && ALONGSIDE_PICTURES.has(strikesInSceneWith(preset.impactEffectKind));
}

/**
 * Whether an effect is drawn wholly in the table's scene: a look of a single kind made anew for it,
 * one that strikes with such a look, or a run every stage of which is.
 */
export function isDrawnInScene(preset: SceneQuestion): boolean {
  if (preset.isStaged) {
    const kinds = runKindsOf(preset.stageList);
    return kinds.length > 0 && kinds.every(stageDrawnInScene);
  }
  return SCENE_LINGER_S[preset.effectKind] !== undefined && !cutsPicture(preset);
}

/**
 * Whether any of an effect is drawn in the table's scene: one drawn there wholly, or one that cuts a
 * piece's picture, whose picture is drawn over the table and the rest of it in the scene.
 */
export function hasScenePart(preset: SceneQuestion): boolean {
  return isDrawnInScene(preset) || drawsOnlyPicturesOver(preset);
}

/**
 * Whether an effect is drawn over the table only as a piece's own picture cut up, the rest of it in
 * the scene: one that cuts a picture, alone, as the blow of a shot or a blade, or as a stage of a run.
 */
export function drawsOnlyPicturesOver(preset: SceneQuestion): boolean {
  return cutsPicture(preset);
}

/**
 * How long an effect drawn in the scene goes on being drawn after its playback, in milliseconds, as
 * what it leaves clears: smoke rising away and embers dying. Nothing for one drawn over it.
 */
export function sceneLingerMsOf(preset: SceneQuestion): number {
  if (!hasScenePart(preset)) return 0;
  if (preset.isStaged && preset.stageList) {
    const layout = stageLayoutOf(preset.stageList);
    const last = Math.max(...layout.windows.map((window) => window.endMs + stageLingerS(window.stage.kind) * 1000));
    return Math.max(0, last - layout.totalMs);
  }
  return (SCENE_LINGER_S[preset.effectKind] ?? 0) * 1000;
}
