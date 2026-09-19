import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { parseAttributesKeepingIdentifier, toAttributesKeepingIdentifier } from '@axe/core/sync/persisted-identifier';
import {
  EffectKind,
  EffectTargeting,
  isEffectKind,
  isEffectTargeting,
  isProjectileStyle,
  isSlashStyle,
  ProjectileStyle,
  SlashStyle,
} from '@axe/domain/effect/effect-kind';
import { type EffectStage, parseEffectStages } from '@axe/domain/effect/effect-stage';
import { stagedEffectDuration } from '@axe/domain/effect/effect-stage-timeline';

const MIN_DURATION_MS = 120;
const MAX_DURATION_MS = 6000;
const MIN_SCALE = 0.2;
const MAX_SCALE = 6;
const MAX_STAGGER_MS = 2000;
const MAX_TARGET_LIMIT = 20;
const MAX_SHOTS = 24;
const MAX_AREA_RADIUS = 12;

@SyncObject('effect-preset')
export class EffectPreset extends GameObject {
  @SyncVar() name: string = '';
  @SyncVar() tagName: string = '';
  @SyncVar() kind: string = 'burst';
  @SyncVar() colorPrimary: string = '#ffd27f';
  @SyncVar() colorSecondary: string = '#ff5a33';
  @SyncVar() durationMs: number = 900;
  @SyncVar() staggerMs: number = 90;
  @SyncVar() scale: number = 1;
  @SyncVar() followTarget: boolean = true;
  @SyncVar() soundIdentifier: string = '';
  /** The sound of the landing. Empty for the shot alone. */
  @SyncVar() impactSoundIdentifier: string = '';
  @SyncVar() targeting: string = 'single';
  @SyncVar() maxTargets: number = 1;
  /** The grade, from the lowest to the highest, which sets how many particles there are and how many stages the effect runs. */
  @SyncVar() grade: number = 2;
  /** The effect a projectile makes on landing. Empty for an explosion. */
  @SyncVar() impactKind: string = '';
  /** What a projectile looks like: a magical bolt, an arrow or a bullet. */
  @SyncVar() projectileStyle: string = 'bolt';
  /** How many shots one firing makes. More than one is a burst. */
  @SyncVar() shots: number = 1;
  /** The form of a cut. */
  @SyncVar() slashStyle: string = 'single';
  /** How long between them. At nothing they are spread evenly through the playback. */
  @SyncVar() shotInterval: number = 0;
  /** Shown to the game master alone, for when an effect would give the preparation away. */
  @SyncVar() gmOnly: boolean = false;
  /** How far it reaches, in cells. At nothing the targets are chosen one at a time. */
  @SyncVar() areaRadius: number = 0;
  /** The particles scattered along the way. Empty for whatever the family gives. */
  @SyncVar() moteStyle: string = '';

  /**
   * The run this effect goes through, written as a list of stages.
   *
   * Empty for an effect that draws one look, which is every effect written before stages
   * existed. Old versions of the tool ignore the field and go on drawing that one look, so
   * a room shared with them still plays.
   */
  @SyncVar() stages: string = '';

  /**
   * The identifier is written out with the rest and read back as it was.
   *
   * The base class does not write it, so an effect read back would be a new object every
   * time: the same file read twice would leave two of everything, and an effect handed on
   * and handed back would no longer be the effect it left as.
   *
   * One thrown away here is the exception, and comes back under a name of its own. Everyone
   * else at the table has it down as deleted and would answer its return with the deletion
   * again, taking it from the one who brought it back.
   */
  toAttributes(): Attributes {
    return toAttributesKeepingIdentifier(this);
  }

  /**
   * Reads the fields back from a file, taking up the identifier that was written with them.
   *
   * The written identifier is kept only when it has not been deleted in this room; otherwise
   * the effect stays under the fresh identifier it was made with.
   */
  parseAttributes(attributes: NamedNodeMap): void {
    parseAttributesKeepingIdentifier(this, attributes);
  }

  /** Every effect on the room's shelf. */
  static list(): EffectPreset[] {
    return ObjectStore.instance.getObjects<EffectPreset>(EffectPreset);
  }

  private stagesRaw = '';
  private stagesParsed: EffectStage[] = [];

  /** The stages, read once per change rather than once per frame. */
  get stageList(): EffectStage[] {
    const raw = this.stages ?? '';
    if (raw !== this.stagesRaw) {
      this.stagesRaw = raw;
      this.stagesParsed = parseEffectStages(raw);
    }
    return this.stagesParsed;
  }

  /** Whether this effect runs through stages rather than drawing one look. */
  get isStaged(): boolean {
    return this.stageList.length > 0;
  }

  /** The look this effect draws. A stored kind the tool does not know reads as a burst. */
  get effectKind(): EffectKind {
    return isEffectKind(this.kind) ? this.kind : 'burst';
  }

  /** How the effect chooses its targets. A stored value the tool does not know reads as a single target. */
  get effectTargeting(): EffectTargeting {
    return isEffectTargeting(this.targeting) ? this.targeting : 'single';
  }

  /**
   * How long one target's playback lasts, in milliseconds.
   *
   * A staged effect lasts as long as its stages take. Any other is held between 120 and 6000,
   * and a stored length that is not a number reads as 900.
   */
  get duration(): number {
    // A run is as long as its stages take; the written length belongs to the one look.
    if (this.isStaged) return stagedEffectDuration(this.stageList);
    return clamp(this.durationMs, MIN_DURATION_MS, MAX_DURATION_MS, 900);
  }

  /** How long each target waits after the one before it, in milliseconds, held to at most 2000. */
  get stagger(): number {
    return clamp(this.staggerMs, 0, MAX_STAGGER_MS, 0);
  }

  /** How large the effect is drawn against a piece, held between 0.2 and 6. */
  get sizeScale(): number {
    return clamp(this.scale, MIN_SCALE, MAX_SCALE, 1);
  }

  /** The landing effect. A projectile may not nest inside one. */
  get impactEffectKind(): EffectKind {
    if (!isEffectKind(this.impactKind) || this.impactKind === 'projectile') return 'burst';
    return this.impactKind;
  }

  /** Where through the effect the landing sounds. A projectile sounds it as it lands, and anything else a little later. */
  get impactSoundAt(): number {
    if (this.effectKind === 'arc') return 0.4;
    // A beam sounds as it fires; waiting for the landing leaves the gathering silent.
    if (this.effectKind === 'beam') return 0.28;
    // A great sword of light arrives after it falls; sounded while it is held up it becomes a starting gun.
    if (this.effectKind === 'skyblade') return 0.62;
    // Falling arrows sound as the first of them strike; at the end of the volley the sound parts from the picture.
    if (this.effectKind === 'arrowrain') return 0.35;
    // A ballistic shot strikes nothing between the launch and the fall.
    if (this.effectKind === 'ballistic') return 0.86;
    return 0.5;
  }

  /** The gap between the shots of a burst, in milliseconds. Zero spreads them evenly through the playback. */
  get shotIntervalMs(): number {
    return Math.max(0, clamp(this.shotInterval, 0, MAX_DURATION_MS, 0));
  }

  /** How many shots one firing makes, a whole number from 1 to 24. */
  get shotCount(): number {
    return Math.round(clamp(this.shots, 1, MAX_SHOTS, 1));
  }

  /** The form of cut to draw. A stored form the tool does not know reads as a single stroke. */
  get slashLook(): SlashStyle {
    return isSlashStyle(this.slashStyle) ? this.slashStyle : 'single';
  }

  /** What a projectile looks like in flight. A stored look the tool does not know reads as a bolt. */
  get projectileLook(): ProjectileStyle {
    return isProjectileStyle(this.projectileStyle) ? this.projectileStyle : 'bolt';
  }

  /** The grade as one of 1, 2 or 3. A stored grade that is not a number reads as 2. */
  get gradeLevel(): 1 | 2 | 3 {
    const level = Math.round(clamp(this.grade, 1, 3, 2));
    return level === 1 || level === 3 ? level : 2;
  }

  /** How many particles the grade calls for. The higher grades are thicker and last longer. */
  get gradeDensity(): number {
    return this.gradeLevel === 1 ? 0.55 : this.gradeLevel === 3 ? 1.7 : 1;
  }

  /** How many targets one cast may take: 1 unless the effect takes several, then up to 20. */
  get targetLimit(): number {
    if (this.effectTargeting === 'self') return 1;
    if (this.effectTargeting === 'single') return 1;
    return Math.round(clamp(this.maxTargets, 1, MAX_TARGET_LIMIT, 1));
  }

  /** How far it reaches, in cells. A single-target effect has none. */
  get areaRadiusCells(): number {
    if (this.effectTargeting !== 'multi') return 0;
    return clamp(this.areaRadius, 0, MAX_AREA_RADIUS, 0);
  }

  /** How long until the playback has finished for every target. */
  totalDuration(targetCount: number): number {
    const count = Math.max(targetCount, 1);
    return this.duration + this.stagger * (count - 1);
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}
