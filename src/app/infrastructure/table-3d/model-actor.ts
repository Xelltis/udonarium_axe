import { faceMoves, seedOf, shapeWeightsAt } from '@axe/domain/tabletop/model-face';
import {
  actHolds,
  MADE_REST,
  madeActMs,
  type MadePose,
  madePoseAt,
  type ModelAct,
  type ModelMotions,
  motionNameFor,
  type MotionRole,
} from '@axe/domain/tabletop/model-motions';
import type { PieceModel } from '@axe/domain/tabletop/piece-model';
import {
  type AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  type Object3D,
  Vector3,
} from 'three/webgpu';

/** How long one motion takes to give way to the next, in seconds. */
const BLEND_SECONDS = 0.2;

/** The longest step a motion is moved on by at once, in seconds, so a frame long in coming does not jump it. */
const LONGEST_STEP = 0.1;

/**
 * How fast a model wants drawing: every frame while it walks or acts, a frame now and then while it
 * only stands in its motion or moves its face, and not at all while nothing of it moves.
 */
export type ActorPace = 'fast' | 'slow' | 'still';

/** What a model is asked to do at a moment. */
export interface ActorMoment {
  /** The moment, in the milliseconds frames are timed in. */
  readonly timeMs: number;
  /** Whether anything moves at all: nothing does for a reader who asks for less motion. */
  readonly moving: boolean;
  /** Whether a model standing still plays the motion it stands in and moves its face, or holds its first pose. */
  readonly standing: boolean;
}

/** A mesh of a model that can be blended towards shapes, with where each of them stands by name. */
interface ShapedMesh {
  readonly influences: number[];
  readonly places: ReadonlyMap<string, number>;
}

/**
 * One copy of a model as it moves: standing in its idle, walking while its piece is moved, acting a
 * blow, a spell, a blow taken or its going down when it is asked to, and blinking, breathing and
 * holding the expression its piece gives its shapes. One motion gives way to the next over a moment
 * rather than at once; an act is played once and gives way to standing again, but for going down,
 * which stays as it ends. A role the model has no motion for is played by moving the whole model, as
 * a figure in the hand, where its piece lets it be (see {@link pose}).
 *
 * Everything is worked out from the moments it is moved on to, so a copy made while its piece acts
 * joins the act where it has got to.
 */
export class ModelActor {
  private readonly mixer: AnimationMixer;
  private readonly names: readonly string[];
  private readonly shaped: readonly ShapedMesh[];
  /** The names of all the shapes its meshes can be blended towards. */
  readonly shapes: readonly string[];
  private readonly seed: number;
  private asked: Pick<PieceModel, 'idle' | 'walk' | 'motions' | 'face'> | null = null;
  private current: AnimationAction | null = null;
  private walking = false;
  private walkedFromMs = 0;
  private act: ModelAct | null = null;
  /** Whether the act asked for is played by a motion of the model, rather than by hand or not at all. */
  private actPlays = false;
  /** How long the act asked for takes to play through, in milliseconds. */
  private actLastsMs = 0;
  /** Whether the act asked for has been played through. */
  private actOver = true;
  /** Whether the act asked for is yet to come, as a blow taken is until the blow lands. */
  private actWaits = false;
  /** Whether the model has a motion of its own to walk in. */
  private walkPlays = false;
  /** Whether its face moves as it stands: it blinks, breathes or sways between shapes. */
  private faceLively = false;
  private lastMs: number | null = null;
  private written = new Set<string>();
  private posed: MadePose = MADE_REST;
  private restless = true;

  constructor(
    root: Object3D,
    private readonly clips: readonly AnimationClip[],
    owner: string
  ) {
    this.mixer = new AnimationMixer(root);
    this.names = clips.map((clip) => clip.name);
    this.shaped = shapedMeshesOf(root);
    this.shapes = [...new Set(this.shaped.flatMap((mesh) => [...mesh.places.keys()]))];
    this.seed = seedOf(owner);
  }

  /** The name of the motion of the model playing now, or null where none is. */
  get motion(): string | null {
    return this.current?.getClip().name ?? null;
  }

  /** Where the whole model is moved to by hand at the moment last moved on to; as it stands where no hand moves it. */
  get pose(): MadePose {
    return this.posed;
  }

  /** Whether an act played once is being played, or waited for, now. */
  get acting(): boolean {
    return this.act !== null && !this.actOver && !actHolds(this.act);
  }

  /** The act asked for, where it has been played through and the model stands again: one going down is never through. */
  get finishedAct(): ModelAct | null {
    return this.act && this.actOver && !actHolds(this.act) ? this.act : null;
  }

  /**
   * Takes what the piece asks of its model: the motions it names and what it does with its shapes.
   * The motions are chosen again where it names others, so a name changed once the piece is on the
   * table takes at once.
   */
  cast(asked: Pick<PieceModel, 'idle' | 'walk' | 'motions' | 'face'>): void {
    const before = this.asked;
    this.asked = asked;
    this.faceLively = faceMoves(asked.face, this.shapes);
    if (
      before &&
      before.idle === asked.idle &&
      before.walk === asked.walk &&
      sameMotions(before.motions, asked.motions)
    ) {
      return;
    }
    this.restless = true;
  }

  /** Has the model walk while its piece is moved, from a moment, and stand again once it is not. */
  walk(walking: boolean, timeMs: number): void {
    if (walking === this.walking) return;
    this.walking = walking;
    this.walkedFromMs = timeMs;
    this.restless = true;
  }

  /**
   * Has the model act, where the act is another than the one before, or stand again where there is
   * none. An act played once that is no longer asked for is played on to its end all the same, as
   * the effect that asked for a blow may be over before the blow is.
   */
  perform(act: ModelAct | null): void {
    if ((act?.key ?? null) === (this.act?.key ?? null)) return;
    if (act === null && this.acting) return;
    this.act = act;
    this.actOver = act === null;
    this.actPlays = false;
    this.restless = true;
  }

  /**
   * Moves the model on to a moment: its motions, its face, and where a hand moves the whole of it.
   * Answers how fast it wants drawing from here.
   */
  advance(moment: ActorMoment): ActorPace {
    const step = this.lastMs === null ? 0 : Math.min(LONGEST_STEP, Math.max(0, (moment.timeMs - this.lastMs) / 1000));
    this.lastMs = moment.timeMs;
    if (this.restless) this.settle(moment);
    this.restless = false;
    const acting = this.playAct(moment);
    const down = this.act !== null && actHolds(this.act);
    const stands = !down && moment.standing && (this.current !== null || this.faceLively);
    if (moment.moving && (acting || (!down && this.walking) || (stands && this.current !== null))) {
      this.mixer.update(step);
    }
    this.face(moment, down);
    this.posed = this.madePose(moment);
    if (!moment.moving) return 'still';
    if (acting || (!down && this.walking)) return 'fast';
    return stands ? 'slow' : 'still';
  }

  /** Stops every motion and lets go of what playing them holds. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }

  /**
   * Starts what the model is to play now. An act asked for and not yet through is joined where it has
   * got to, by a motion of the model or else by hand; one already through by then is not played, but
   * for going down, which is stood as it ends. Otherwise, and until an act yet to come comes, the
   * model walks or stands in its idle. For a
   * reader who asks for less motion, and where standing motions are not played, it is stood in the
   * first pose of what it stands in.
   */
  private settle(moment: ActorMoment): void {
    this.walkPlays = this.clipFor('walk') !== null;
    const act = this.act;
    this.actWaits = act !== null && !this.actOver && moment.moving && moment.timeMs < act.atMs;
    if (act && !this.actOver && !this.actWaits) {
      const clip = this.clipForAct(act);
      const elapsedMs = Math.max(0, moment.timeMs - act.atMs);
      this.actPlays = clip !== null;
      this.actLastsMs = clip ? clip.duration * 1000 : this.madeBy(act) ? madeActMs(act) : 0;
      if (!moment.moving || elapsedMs >= this.actLastsMs) this.actOver = true;
      if (clip && (!this.actOver || actHolds(act))) {
        this.play(clip, true, this.actOver ? 0 : BLEND_SECONDS, this.actOver ? clip.duration : elapsedMs / 1000);
        return;
      }
    } else if (act && actHolds(act) && this.actPlays) {
      const clip = this.clipForAct(act);
      if (clip) {
        this.play(clip, true, 0, clip.duration);
        return;
      }
    }
    const clip = this.clipFor(this.walking ? 'walk' : 'idle') ?? this.clipFor('idle');
    const blends = moment.moving && (moment.standing || this.walking);
    this.play(clip, false, blends ? BLEND_SECONDS : 0, 0);
  }

  /**
   * Follows the act asked for to its end: answers whether it is still being played, or waited for.
   * One played through gives way to standing, or to walking, again, but for going down.
   */
  private playAct(moment: ActorMoment): boolean {
    const act = this.act;
    if (!act || this.actOver) return false;
    if (this.actWaits) {
      if (moment.moving && moment.timeMs < act.atMs) return true;
      this.settle(moment);
      if (this.actOver) return false;
    }
    if (moment.moving && moment.timeMs - act.atMs < this.actLastsMs) return true;
    this.actOver = true;
    if (!actHolds(act)) this.settle(moment);
    return false;
  }

  /** Whether an act the model has no motion of its own for is played by a hand moving the whole model. */
  private madeBy(act: ModelAct): boolean {
    return act.role !== 'named' && this.asked?.motions.made === true;
  }

  /** Where a hand moves the whole model at a moment, for whatever it plays that it has no motion of its own for. */
  private madePose(moment: ActorMoment): MadePose {
    const act = this.act;
    const byHand = act !== null && !this.actWaits && !this.actPlays && this.madeBy(act);
    if (act && act.role !== 'named' && byHand && (!this.actOver || actHolds(act))) {
      return madePoseAt(act.role, this.actOver ? madeActMs(act) : Math.max(0, moment.timeMs - act.atMs));
    }
    if (this.walking && moment.moving && !this.walkPlays && this.asked?.motions.made) {
      return madePoseAt('walk', Math.max(0, moment.timeMs - this.walkedFromMs));
    }
    return MADE_REST;
  }

  /**
   * Blends the meshes towards their shapes as the face stands at a moment: held in its expression
   * alone where nothing moves, where standing motions are not played, and once the model is down.
   */
  private face(moment: ActorMoment, down: boolean): void {
    if (this.shaped.length === 0 || !this.asked) return;
    const still = !moment.moving || !moment.standing || down;
    const weights = shapeWeightsAt(this.asked.face, this.shapes, { timeMs: moment.timeMs, seed: this.seed, still });
    for (const mesh of this.shaped) {
      for (const name of this.written) {
        const place = mesh.places.get(name);
        if (place !== undefined && !weights.has(name)) mesh.influences[place] = 0;
      }
      for (const [name, weight] of weights) {
        const place = mesh.places.get(name);
        if (place !== undefined) mesh.influences[place] = weight;
      }
    }
    this.written = new Set(weights.keys());
  }

  private clipFor(role: MotionRole): AnimationClip | null {
    const asked = this.asked;
    const named = role === 'idle' ? asked?.idle : role === 'walk' ? asked?.walk : asked?.motions[role];
    const name = motionNameFor(role, this.names, named ?? '');
    return name === null ? null : AnimationClip.findByName(this.clips as AnimationClip[], name);
  }

  private clipForAct(act: ModelAct): AnimationClip | null {
    if (act.role !== 'named') return this.clipFor(act.role);
    return act.name ? AnimationClip.findByName(this.clips as AnimationClip[], act.name) : null;
  }

  /**
   * Plays a motion in place of the one playing, from so far into it, in seconds, the one giving way
   * to the other over a moment or at once; once through and held at its end, or over and over. A
   * motion played over and over that is playing already is left to play on, unless it is to be taken
   * up at once, which stands it at its start.
   */
  private play(clip: AnimationClip | null, once: boolean, blendSeconds: number, fromSeconds: number): void {
    const next = clip ? this.mixer.clipAction(clip) : null;
    const before = this.current;
    if (next === before && !once && blendSeconds > 0 && next?.isRunning()) return;
    if (next) {
      next.reset();
      next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = once;
      next.time = Math.min(fromSeconds, clip!.duration);
      if (before && before !== next && blendSeconds > 0) next.crossFadeFrom(before, blendSeconds, false);
      else if (before && before !== next) before.stop();
      next.play();
    } else {
      this.mixer.stopAllAction();
    }
    this.current = next;
    this.mixer.update(0);
  }
}

function sameMotions(one: ModelMotions, other: ModelMotions): boolean {
  return (
    one.attack === other.attack &&
    one.cast === other.cast &&
    one.hit === other.hit &&
    one.defeat === other.defeat &&
    one.made === other.made
  );
}

/**
 * The meshes under a model's root that can be blended towards shapes, each with where its shapes
 * stand by name: the names its file gives them, or where the mesh was read with none, those its shape
 * carries with it.
 */
function shapedMeshesOf(root: Object3D): ShapedMesh[] {
  const shaped: ShapedMesh[] = [];
  root.traverse((object) => {
    const mesh = object as Object3D & {
      morphTargetInfluences?: number[];
      morphTargetDictionary?: Record<string, number>;
      geometry?: { userData?: { targetNames?: unknown } };
    };
    const influences = mesh.morphTargetInfluences;
    if (!influences || influences.length === 0) return;
    const places = new Map<string, number>();
    const carried = mesh.geometry?.userData?.targetNames;
    const dictionary = mesh.morphTargetDictionary ?? {};
    const numbered = Object.keys(dictionary).every((name) => `${dictionary[name]}` === name);
    if (numbered && Array.isArray(carried) && carried.length === influences.length) {
      carried.forEach((name, place) => places.set(typeof name === 'string' && name ? name : `${place}`, place));
    } else {
      for (const name of Object.keys(dictionary)) places.set(name, dictionary[name]);
    }
    if (places.size > 0) shaped.push({ influences, places });
  });
  return shaped;
}

const UP = new Vector3(0, 1, 0);
const TIP_AXIS = new Vector3();
const LAID = new Matrix4();

/**
 * Where a model stands once a hand has moved it from where it was placed: carried towards the other
 * in its act and lifted, by so many widths of its piece, tipped towards the other about its foot, and
 * stretched upright. `foot` is its foot and `toward` the way to the other across the floor, of unit
 * length, both in the scene (x east, y up, z south); written into `into`.
 */
export function posedPlacement(
  placed: Matrix4,
  foot: Vector3,
  toward: Vector3,
  pose: MadePose,
  widthPx: number,
  into: Matrix4
): Matrix4 {
  if (pose === MADE_REST) return into.copy(placed);
  TIP_AXIS.crossVectors(UP, toward);
  const carried = pose.forward * widthPx;
  into.makeTranslation(foot.x + toward.x * carried, foot.y + pose.lift * widthPx, foot.z + toward.z * carried);
  if (TIP_AXIS.lengthSq() > 0) {
    into.multiply(LAID.makeRotationAxis(TIP_AXIS.normalize(), (pose.pitchDeg * Math.PI) / 180));
  }
  return into
    .multiply(LAID.makeScale(1, pose.stretch, 1))
    .multiply(LAID.makeTranslation(-foot.x, -foot.y, -foot.z))
    .multiply(placed);
}
