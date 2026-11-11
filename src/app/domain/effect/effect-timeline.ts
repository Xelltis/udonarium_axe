import { areaShareOf } from '@axe/domain/effect/effect-area';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast, type EffectCastTarget } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { stagedCutPictures } from '@axe/domain/effect/effect-stage-timeline';
import { strikesInSceneWith, STRIKING_WITH } from '@axe/domain/effect/scene/scene-kinds';
import { appendBisect } from '@axe/domain/effect/timeline/blade';
import { appendDissolve } from '@axe/domain/effect/timeline/body';
import {
  type EffectSprite,
  type EffectSpriteOptions,
  effectTargetCenter,
  imageOf,
  type Point3,
  seededRandom,
  targetScaleOf,
} from '@axe/domain/effect/timeline/shared';

/*
 * Which kinds of look are fired from the caster and which go off about the target, and the pieces of
 * a piece's own picture the looks that cut it make: the picture cleaved in two or crumbled to
 * fragments, laid over the table where the piece is drawn. All else an effect draws is drawn in the
 * table's scene.
 */

export { type EffectSprite, type EffectSpriteOptions, type Point3 } from '@axe/domain/effect/timeline/shared';

/** The kinds fired from the caster at the target, which need an origin and a direction rather than a centre alone. */
export const AIMED_EFFECT_KINDS: readonly EffectKind[] = [
  'arc',
  'dissolve',
  'gore',
  'bisect',
  'ballistic',
  'arrowrain',
  'skyblade',
  'raybeam',
  'beam',
  'breath',
  'drain',
  'projectile',
];

/** The kinds that go off about the target, but for a burst, which is what a look of no kind goes off as. */
export const CENTERED_EFFECT_KINDS: readonly EffectKind[] = [
  'slash',
  'flame',
  'heal',
  'impact',
  'rubble',
  'upheaval',
  'mushroom',
  'bolt',
  'frost',
  'nova',
  'vortex',
  'miasma',
  'aura',
  'barrier',
  'bash',
  'curse',
  'warp',
  'gravity',
];

const AIMED: ReadonlySet<EffectKind> = new Set(AIMED_EFFECT_KINDS);

/** Whether a look is fired from the caster at the target, rather than going off about the target. */
export function isAimed(preset: Pick<EffectPreset, 'effectKind'>): boolean {
  return AIMED.has(preset.effectKind);
}

/** What the cutting of one target's picture by one look is given. */
export interface CutPictureContext {
  sprites: EffectSprite[];
  prefix: string;
  center: Point3;
  base: number;
  progress: number;
  preset: EffectPreset;
  random: () => number;
  target: EffectCastTarget;
  options: EffectSpriteOptions;
}

/** How each look that cuts a piece's picture cuts it. */
const CUTTING: Partial<Record<EffectKind, (context: CutPictureContext) => void>> = {
  bisect: (c) =>
    appendBisect(c.sprites, c.prefix, c.center, c.base, c.progress, imageOf(c.options, c.target.identifier)),
  dissolve: (c) =>
    appendDissolve(
      c.sprites,
      c.prefix,
      c.center,
      c.base,
      c.progress,
      c.random,
      imageOf(c.options, c.target.identifier)
    ),
};

/** Cuts up a piece's picture as a look of this kind does, and leaves it whole for any other. */
function cutPicture(kind: EffectKind, context: CutPictureContext): void {
  CUTTING[kind]?.(context);
}

/** The shortest a shot's landing plays, as the scene plays it, in milliseconds. */
const LANDING_LEAST_MS = 600;

/**
 * How an effect not run in stages cuts a piece's picture: the look that cuts it, and when and for how
 * long on the effect's own clock. A look that cuts it does so over the whole playback; a shot or a
 * blade that strikes with one cuts it as it first lands, as the scene draws the rest of that landing.
 * Null for an effect that cuts none.
 */
function pictureCutOf(preset: EffectPreset): { kind: EffectKind; fromMs: number; forMs: number } | null {
  if (CUTTING[preset.effectKind]) return { kind: preset.effectKind, fromMs: 0, forMs: preset.duration };
  if (!STRIKING_WITH.has(preset.effectKind)) return null;
  const kind = strikesInSceneWith(preset.impactEffectKind);
  if (!CUTTING[kind]) return null;
  const fromMs = effectBlowsOf(preset)[0]?.atMs ?? preset.duration;
  return { kind, fromMs, forMs: Math.max(LANDING_LEAST_MS, preset.duration - fromMs) };
}

/**
 * The pieces of the pictures a cast cuts up at a moment in its playback, for every target whose own
 * playback is under way: a look that cuts a piece's picture alone, a shot or a blade that lands with
 * one, or a run with stages that do.
 * Hidden targets are skipped, and a target with no picture has nothing cut.
 */
export function cutPictureSprites(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  options: EffectSpriteOptions
): EffectSprite[] {
  if (preset.isStaged) return stagedCutPictures(preset, preset.stageList, cast, elapsedMs, options, cutPicture);
  const sprites: EffectSprite[] = [];
  const cut = pictureCutOf(preset);
  if (!cut) return sprites;
  const base = Math.max(options.baseSize, 1) * preset.sizeScale;

  cast.targets.forEach((target, index) => {
    if (options.hiddenIdentifiers?.has(target.identifier)) return;
    const progress = (elapsedMs - preset.stagger * index - cut.fromMs) / cut.forMs;
    if (progress < 0 || progress > 1) return;
    cutPicture(cut.kind, {
      sprites,
      prefix: `${index}`,
      center: effectTargetCenter(target, preset, options),
      base: base * areaShareOf(preset, cast, index) * targetScaleOf(options, target.identifier, isAimed(preset)),
      progress,
      preset,
      random: seededRandom(cast.seed + index * 7919),
      target,
      options,
    });
  });
  return sprites;
}
