import { computed, DestroyRef, effect, inject, Injectable, Signal, signal, untracked } from '@angular/core';
import { DiceTrayPlacementService, TablePlacement } from '@axe/application/dice/dice-tray-placement.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { diceThrow$, messageAdded$ } from '@axe/core/event/domain-events';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { decodeDiceLook, DiceLook, wornDiceLook } from '@axe/domain/dice/dice-3d/dice-look';
import { DiceStage, showsInFrame, showsOnTable } from '@axe/domain/dice/dice-3d/dice-stage';
import { DieToThrow, labelOf, ThrowPlan, throwPlanOf, traysOf } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { upFace } from '@axe/domain/dice/dice-3d/die-symmetry';
import { polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { restingLayout } from '@axe/domain/dice/dice-3d/resting-pose';
import { Quat, quatFromAxisAngle, quatMultiply, quatRotate, UP } from '@axe/domain/dice/dice-3d/rotation';
import { throwSeedOf } from '@axe/domain/dice/dice-3d/throw-seed';
import { Tray } from '@axe/domain/dice/dice-3d/throw-validation';
import { FRAME_TRAY_AREA, frameAspectFor, trayFor } from '@axe/domain/dice/dice-3d/tray-size';
import { DiceRollOutcome } from '@axe/domain/dice/dice-roll-detail';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { readyDicePhysics, throwDice } from '@axe/infrastructure/dice-3d/dice-physics-client';
import { DiceThrowResult, FRAME_STRIDE, FRAMES_PER_SECOND } from '@axe/infrastructure/dice-3d/dice-physics-message';

/**
 * How lately a roll has to have been answered to be thrown. A device that comes back to the room
 * after a while away is handed what it missed, and none of that is thrown.
 */
export const JUST_ROLLED_MS = 30_000;
/** How long a throw waits for the line it throws the dice of, which can come after the call to throw. */
export const LINE_WAIT_MS = 5_000;
/** How many rolls tumble at once; any more are shown where they came to rest. */
export const MAX_TUMBLING = 6;
/**
 * How many dice may be on the move at once, in every place they are drawn, for another roll to
 * tumble beside those already tumbling; and as many on a device drawn lightly. A roll with nothing
 * else on the move tumbles whatever its size.
 */
export const MAX_TUMBLING_DICE = 400;
export const LITE_TUMBLING_DICE = 200;
/** How many rolls' throws are kept, so a line scrolled back into view shows the dice it was thrown. */
export const KEPT_THROWS = 300;
/** How many of the latest rolls keep the whole of their recording; older ones keep where their dice came to rest. */
export const KEPT_IN_FULL = 30;

/**
 * Where a throw has got to: being worked out, tumbling, come to rest, or not to be shown at all
 * because the dice could not be drawn.
 */
export type DiceThrowPhase = 'working' | 'rolling' | 'settled' | 'failed';

/**
 * A chat roll's dice on one tray, thrown in the frame of the line that answered it or on the table.
 * A roll of more dice than one tray holds is thrown on several, each its own throw.
 */
export interface DiceThrow {
  /** What the throw is kept by, from the line's identifier: see `throwKeyOf`. */
  readonly key: string;
  readonly messageIdentifier: string;
  /** Which of the roll's trays it is thrown on, from 0. */
  readonly part: number;
  /** Where they are thrown. */
  readonly stage: 'frame' | 'table';
  /** Where on the table, for a throw there. */
  readonly placement: TablePlacement | null;
  readonly dice: readonly DieToThrow[];
  /** How many more dice the roll had than are thrown, told on its last tray alone. */
  readonly overflow: number;
  /** The colour of the dice: the one the roller chose, or else the colour the roll was said in. */
  readonly color: string;
  /** How the one who rolled wants their dice to look. */
  readonly look: DiceLook;
  readonly tray: Tray;
  /** The tray's width over its depth, which is the frame's for a throw in one. */
  readonly aspect: number;
  readonly phase: DiceThrowPhase;
  /** How the dice move and the turns that show their numbers, once worked out. */
  readonly result: DiceThrowResult | null;
  /** When the dice began to tumble, on the clock `performance.now()` keeps. */
  readonly startedAt: number;
  /** Whether the dice are only laid down showing their numbers, with no tumble. */
  readonly still: boolean;
  /** What each drawn die shows once at rest, read off how it is turned. */
  readonly shown: readonly string[];
  /** Whether the roll was a critical or a fumble, which the dice flash as they come to rest. */
  readonly outcome: DiceRollOutcome;
}

/** One of a line's frames as this reader sees it: its shape, the dice it could not hold, and its throw once there is one. */
export interface DiceFrame {
  /** The key its throw is kept by. */
  readonly key: string;
  readonly aspect: number;
  readonly overflow: number;
  readonly diceThrow: DiceThrow | null;
}

const BLANK_COLOR = '#202024';
/** How long the physics waits for a quiet moment to be started in, at most, in milliseconds. */
const WARM_UP_WITHIN_MS = 3000;
/** What marks the key of a roll's throw on the table, beside the one in its frame. */
const ON_THE_TABLE = ':table';
/** The most a die laid down leans once its number is turned upright, in radians. */
const MAX_LEAN_KEPT = 0.15;
const NO_TURN: Quat = [0, 0, 0, 1];
const NO_FRAMES: readonly DiceFrame[] = [];
/** What marks the key of a throw made to try a look out, which no line said. */
const TRY_OUT = 'try-out:';
/** One of each die a look is tried out on. */
const TRY_OUT_SIDES = [4, 6, 8, 10, 12, 20] as const;

/**
 * What a roll's throw on one of its trays is kept by: the line's identifier for its first tray, the
 * identifier numbered for the rest, and either marked for one on the table. A roll on one tray is
 * kept as it was before rolls were shared out, so every version throws it from the same seed.
 */
export function throwKeyOf(messageIdentifier: string, part: number, stage: 'frame' | 'table'): string {
  const tray = part === 0 ? messageIdentifier : `${messageIdentifier}#${part}`;
  return stage === 'frame' ? tray : `${tray}${ON_THE_TABLE}`;
}

/**
 * Throws the dice of a chat roll the room is told to throw.
 *
 * The device that rolled tells the room, and every device - the roller's own among them - throws
 * the dice once the line with the result has reached it, so long as the room shows rolls this
 * way, the line was just said, and this reader may see it: a secret roll is thrown for the one
 * who rolled it alone. A replay, which plays the room back cut off from it, throws nothing.
 *
 * Every device works the throw out from the line itself, so all of them see the dice tumble much
 * the same way and land on the numbers the roll came to.
 */
@Injectable({ providedIn: 'root' })
export class DiceThrowService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly motion = inject(MotionService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly placements = inject(DiceTrayPlacementService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly state = signal<ReadonlyMap<string, DiceThrow>>(new Map());
  /** The lines already called to be thrown, kept beyond the throws themselves so none is thrown twice. */
  private readonly called = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The lines just said that are waiting a moment for their call to throw before being laid down still. */
  private readonly waits = new Map<string, ReturnType<typeof setTimeout>>();
  /** What each line read lately throws, which is read afresh from its words otherwise. */
  private readonly plans = new Map<string, ThrowPlan>();
  /** The frames each line was last given, handed back while nothing in them changes. */
  private readonly framesGiven = new Map<string, readonly DiceFrame[]>();
  private tries = 0;
  /** Where the room shows its rolls' dice; a room not yet set up shows none, and is not set up from here. */
  private readonly diceStage = computed<DiceStage>(() => {
    this.objectChange.versionOf('Config')();
    return this.objectStore.get<Config>('Config')?.diceStage ?? 'off';
  });

  /** Every throw kept, by its key: the line whose dice it throws, marked for one on the table. */
  readonly throws: Signal<ReadonlyMap<string, DiceThrow>> = this.state.asReadonly();

  constructor() {
    // A room that shows its rolls' dice has the physics started in a quiet moment, ahead of the first roll.
    effect(() => {
      this.objectChange.versionOf('Config')();
      const config = this.objectStore.get<Config>('Config');
      if (!config || config.diceStage === 'off') return;
      untracked(() => whenIdle(readyDicePhysics));
    });
    diceThrow$.subscribe(
      (event) => void this.receive(event.messageIdentifier, event.speakerIdentifier ?? ''),
      this.destroyRef
    );
    this.destroyRef.onDestroy(() => {
      this.timers.forEach((timer) => clearTimeout(timer));
      this.waits.forEach((timer) => clearTimeout(timer));
    });
  }

  /**
   * The frames a line's dice are shown in, for this reader: one for each tray the roll is thrown on,
   * with its throw once there is one. None where the room shows no dice in frames, this reader may
   * not see the roll, or it has no dice to show.
   *
   * A frame waiting for its dice already has its shape, so a line keeps its height from the start
   * and the log does not jump when they come. A line whose frames are as they were is handed the
   * same ones, so a change to another line's throw leaves it be.
   */
  framesOf(messageIdentifier: string): readonly DiceFrame[] {
    if (!showsInFrame(this.diceStage()) || isNetworkIsolated()) return NO_FRAMES;
    const message = this.objectStore.get<ChatMessage>(messageIdentifier);
    if (!(message instanceof ChatMessage) || !this.mayShow(message)) return NO_FRAMES;
    const plan = this.planOf(message);
    const trays = traysOf(plan.dice);
    const state = this.state();
    const frames = trays.flatMap((dice, part) => {
      const key = throwKeyOf(messageIdentifier, part, 'frame');
      const diceThrow = state.get(key) ?? null;
      if (diceThrow?.phase === 'failed') return [];
      const aspect = diceThrow?.aspect ?? frameAspectFor(dice.length);
      return [{ key, aspect, overflow: overflowOn(part, trays.length, plan), diceThrow }];
    });
    const given = this.framesGiven.get(messageIdentifier);
    if (given && sameFrames(given, frames)) return given;
    this.framesGiven.delete(messageIdentifier);
    this.framesGiven.set(messageIdentifier, frames);
    if (this.framesGiven.size > KEPT_THROWS * 4) this.framesGiven.delete(this.framesGiven.keys().next().value!);
    return frames;
  }

  /**
   * Lays the dice of a line down where they show its numbers, for a line come into view with none
   * thrown: one said before this reader came, or whose throw has since been let go.
   *
   * A line just said may yet be called to be thrown, the call coming after the line, so it is given
   * a moment for that before its dice are laid down.
   */
  showStill(messageIdentifier: string): void {
    const first = throwKeyOf(messageIdentifier, 0, 'frame');
    if (this.state().has(first) || this.waits.has(messageIdentifier)) return;
    const message = this.objectStore.get<ChatMessage>(messageIdentifier);
    if (!(message instanceof ChatMessage)) return;
    if (Date.now() - message.timestamp > JUST_ROLLED_MS) {
      this.layStill(message);
      return;
    }
    this.waits.set(
      messageIdentifier,
      setTimeout(() => {
        this.waits.delete(messageIdentifier);
        this.layStill(message);
      }, LINE_WAIT_MS)
    );
  }

  /**
   * Throws one of each die in a look, to see it by before choosing it: in a frame of its own, kept by
   * the key given back, and in place of the try before it. The dice land on numbers of their own,
   * since no roll was made; a reader who keeps the screen still has them laid down. They wear the
   * look as dice do, resin under a picture.
   */
  tryOut(chosen: DiceLook, rollColor: string): string {
    const look = wornDiceLook(chosen);
    const key = `${TRY_OUT}${++this.tries}`;
    const plan = throwPlanOf({
      system: '',
      outcome: '',
      faces: TRY_OUT_SIDES.map((sides) => ({ sides, value: 1 + Math.floor(Math.random() * sides), kind: 'normal' })),
    });
    const still = !this.motion.enabled();
    const tray = frameTrayFor(plan.dice.length);
    this.endTryOut();
    this.add({
      key,
      messageIdentifier: key,
      part: 0,
      stage: 'frame',
      placement: null,
      dice: plan.dice,
      overflow: 0,
      color: look.body || rollColor || BLANK_COLOR,
      look,
      tray,
      aspect: tray.halfWidth / tray.halfDepth,
      phase: 'working',
      result: null,
      startedAt: 0,
      still,
      shown: [],
      outcome: '',
    });
    void this.play([this.state().get(key)!], still);
    return key;
  }

  /** Lets the dice thrown to try a look out go, as when the panel they were thrown in closes. */
  endTryOut(): void {
    this.forget(isTryOut);
  }

  /** Gives up showing a throw, as when its dice cannot be drawn on this device. */
  fail(key: string): void {
    this.update(key, { phase: 'failed' });
  }

  private async receive(messageIdentifier: string, speakerIdentifier: string): Promise<void> {
    if (isNetworkIsolated() || this.called.has(messageIdentifier)) return;
    this.called.add(messageIdentifier);
    if (this.called.size > KEPT_THROWS * 4) this.called.delete(this.called.values().next().value!);

    const stage = this.config.diceStage;
    if (stage === 'off') return;
    const message = await this.arrivalOf(messageIdentifier);
    if (!message || !this.mayThrow(message)) return;
    const plan = this.planOf(message);
    if (plan.dice.length < 1) return;

    const throws: Promise<void>[] = [];
    if (showsInFrame(stage)) throws.push(this.throwIn('frame', message, plan, speakerIdentifier));
    // A reader who keeps the screen still has nothing put on the table, which they are moving about on.
    if (showsOnTable(stage) && this.motion.enabled()) {
      throws.push(this.throwIn('table', message, plan, speakerIdentifier));
    }
    await Promise.all(throws);
  }

  /**
   * Throws a roll's dice in one place, each place its own trays and its own tumble, to the same
   * numbers. The trays of a large roll are worked out one after another, and each starts to tumble
   * as soon as it is. A line already laid down still, its call to throw coming late, is left as it
   * lies.
   */
  private async throwIn(
    where: 'frame' | 'table',
    message: ChatMessage,
    plan: ThrowPlan,
    speakerIdentifier: string
  ): Promise<void> {
    const messageIdentifier = message.identifier;
    if (this.state().has(throwKeyOf(messageIdentifier, 0, where))) return;
    const trays = traysOf(plan.dice);
    const placements =
      where === 'table'
        ? this.placements.placementsFor(
            speakerIdentifier,
            trays.map((dice) => dice.length)
          )
        : null;
    if (where === 'table' && !placements) return;
    const still = !this.motion.enabled() || !this.hasRoomToTumble(messageIdentifier, plan.dice.length);
    const parts = this.throwsOf(message, where, plan, placements, still);
    this.add(...parts);
    await this.play(parts, still);
  }

  /**
   * Works out throws kept as being worked out and has each tumble as soon as it is, or lays them
   * down still; one put away meanwhile stays put away.
   */
  private async play(parts: readonly DiceThrow[], still: boolean): Promise<void> {
    await Promise.all(
      parts.map(async ({ key, dice, tray }) => {
        const result = still ? laidDown(dice, tray, key) : await this.worked(key, dice, tray);
        if (!result || this.state().get(key)?.phase !== 'working') return;
        this.update(key, {
          phase: still ? 'settled' : 'rolling',
          result,
          startedAt: performance.now(),
          shown: shownBy(dice, result),
        });
        if (!still) this.settleAfter(key, ((result.frameCount - 1) / FRAMES_PER_SECOND) * 1000);
      })
    );
  }

  /** A roll's throws on its trays in one place, before their dice are worked out. */
  private throwsOf(
    message: ChatMessage,
    where: 'frame' | 'table',
    plan: ThrowPlan,
    placements: readonly TablePlacement[] | null,
    still: boolean
  ): DiceThrow[] {
    const trays = traysOf(plan.dice);
    const look = decodeDiceLook(message.diceLook, message.diceImageIdentifier);
    const color = look.body || (message.messColor?.length ? message.messColor : BLANK_COLOR);
    return trays.map((dice, part) => {
      const placement = placements?.[part] ?? null;
      const tray = placement?.tray ?? frameTrayFor(dice.length);
      return {
        key: throwKeyOf(message.identifier, part, where),
        messageIdentifier: message.identifier,
        part,
        stage: where,
        placement,
        dice,
        overflow: overflowOn(part, trays.length, plan),
        color,
        look,
        tray,
        aspect: tray.halfWidth / tray.halfDepth,
        phase: 'working',
        result: null,
        startedAt: 0,
        still,
        shown: [],
        outcome: message.rollDetail?.outcome ?? '',
      };
    });
  }

  /**
   * Whether a roll's dice, so many in one place, may tumble beside those already on the move: always
   * when no other roll is, and otherwise while there are not too many rolls nor too many dice moving.
   * A roll's own dice already thrown in its other place count among those moving; dice thrown to try
   * a look out, which no line said, do not.
   */
  private hasRoomToTumble(messageIdentifier: string, count: number): boolean {
    const moving = [...this.state().values()].filter(
      (t) => (t.phase === 'working' || t.phase === 'rolling') && !isTryOut(t)
    );
    const rolls = new Set(moving.map((t) => t.messageIdentifier));
    rolls.delete(messageIdentifier);
    if (rolls.size < 1) return true;
    const dice = moving.reduce((sum, t) => sum + t.dice.length, 0) + count;
    const most = this.renderLite.active() ? LITE_TUMBLING_DICE : MAX_TUMBLING_DICE;
    return rolls.size < MAX_TUMBLING && dice <= most;
  }

  /**
   * Has a throw come to rest as long after a moment as its dice take to stop, the moment it began
   * to play where it is drawn, which can be later than when it was worked out.
   */
  played(key: string, at: number): void {
    const diceThrow = this.state().get(key);
    if (diceThrow?.phase !== 'rolling' || !diceThrow.result) return;
    const total = ((diceThrow.result.frameCount - 1) / FRAMES_PER_SECOND) * 1000;
    this.settleAfter(key, Math.max(0, at + total - performance.now()));
  }

  private settleAfter(key: string, ms: number): void {
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.update(key, { phase: 'settled' });
      }, ms)
    );
  }

  private get config(): Config {
    return this.objectStore.get<Config>('Config') ?? Config.instance;
  }

  /** The line, at once if it is here, or when it arrives within a few seconds. */
  private arrivalOf(identifier: string): Promise<ChatMessage | null> {
    const here = this.objectStore.get<ChatMessage>(identifier);
    if (here instanceof ChatMessage) return Promise.resolve(here);
    return new Promise((resolve) => {
      const done = (message: ChatMessage | null) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(message);
      };
      const unsubscribe = messageAdded$.subscribe((event) => {
        if (event.messageIdentifier !== identifier) return;
        const message = this.objectStore.get<ChatMessage>(identifier);
        done(message instanceof ChatMessage ? message : null);
      });
      const timer = setTimeout(() => done(null), LINE_WAIT_MS);
    });
  }

  /** Lays a line's dice down in its frames, showing their numbers, where this reader may see them there. */
  private layStill(message: ChatMessage): void {
    if (this.state().has(throwKeyOf(message.identifier, 0, 'frame'))) return;
    if (isNetworkIsolated() || !showsInFrame(this.config.diceStage) || !this.mayShow(message)) return;
    const plan = this.planOf(message);
    if (plan.dice.length < 1) return;
    const startedAt = performance.now();
    this.add(
      ...this.throwsOf(message, 'frame', plan, null, true).map((diceThrow): DiceThrow => {
        const result = laidDown(diceThrow.dice, diceThrow.tray, diceThrow.key);
        return { ...diceThrow, phase: 'settled', result, startedAt, shown: shownBy(diceThrow.dice, result) };
      })
    );
  }

  /** What a line throws, read once from its words while it is read often. */
  private planOf(message: ChatMessage): ThrowPlan {
    const kept = this.plans.get(message.identifier);
    if (kept) return kept;
    const plan = throwPlanOf(message.rollDetail);
    this.plans.set(message.identifier, plan);
    if (this.plans.size > KEPT_THROWS * 4) this.plans.delete(this.plans.keys().next().value!);
    return plan;
  }

  /** Whether a line was just said, and this reader may see its dice. */
  private mayThrow(message: ChatMessage): boolean {
    return Date.now() - message.timestamp <= JUST_ROLLED_MS && this.mayShow(message);
  }

  /** Whether this reader may see a line's dice: a roll they can read, and a secret one only if it was theirs. */
  private mayShow(message: ChatMessage): boolean {
    if (!message.isDicebot) return false;
    if (!message.isDisplayable) return false;
    if (message.isSecret && !message.isSendFromSelf) return false;
    const tab = this.objectStore.get<ChatTab>(message.tabIdentifier);
    return tab instanceof ChatTab && canRoleViewTab(tab, PeerCursor.myRole);
  }

  private async worked(key: string, dice: readonly DieToThrow[], tray: Tray): Promise<DiceThrowResult | null> {
    try {
      return await throwDice({
        key,
        shapes: dice.map((die) => die.shape),
        targets: dice.map((die) => die.target),
        tray,
        edge: 'left',
        away: [0, 1, 0],
      });
    } catch {
      this.fail(key);
      return null;
    }
  }

  /**
   * Keeps throws, letting whole rolls go past the most kept, so a roll shown in both places keeps
   * both. A roll laid down still can be laid down again just as it was, and one that tumbled cannot,
   * so the earliest laid down go first, as lines scrolled back over pile up; the latest few laid
   * down stay, being the lines in view. Only then do the earliest that tumbled go.
   *
   * Rolls that tumbled before the latest few keep only where their dice came to rest, which is all a
   * line at rest draws. Dice thrown to try a look out are no roll, and count as none.
   */
  private add(...diceThrows: DiceThrow[]): void {
    const next = new Map(this.state());
    for (const diceThrow of diceThrows) next.set(diceThrow.key, diceThrow);
    const tumbled = new Map<string, boolean>();
    for (const t of next.values()) {
      if (!isTryOut(t)) tumbled.set(t.messageIdentifier, tumbled.get(t.messageIdentifier) === true || !t.still);
    }
    const rolls = [...tumbled.keys()];
    const laid = rolls.filter((roll) => !tumbled.get(roll));
    const thrown = rolls.filter((roll) => tumbled.get(roll));
    const spare = laid.slice(0, Math.max(0, laid.length - KEPT_IN_FULL));
    const leaving = [...spare, ...thrown, ...laid.slice(spare.length)];
    const gone = new Set(leaving.slice(0, Math.max(0, rolls.length - KEPT_THROWS)));
    const folded = new Set(thrown.slice(0, Math.max(0, thrown.length - KEPT_IN_FULL)));
    for (const [key, kept] of next) {
      if (gone.has(kept.messageIdentifier)) {
        next.delete(key);
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      } else if (
        folded.has(kept.messageIdentifier) &&
        kept.phase === 'settled' &&
        kept.result &&
        kept.result.frameCount > 1
      ) {
        next.set(key, { ...kept, result: restOf(kept.result) });
      }
    }
    this.state.set(next);
  }

  /** Lets the throws that match go at once. */
  private forget(matches: (diceThrow: DiceThrow) => boolean): void {
    const next = new Map(this.state());
    for (const [key, kept] of next) {
      if (!matches(kept)) continue;
      next.delete(key);
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    this.state.set(next);
  }

  /** Changes a throw still kept; one given up stays given up, whatever comes in for it after. */
  private update(key: string, change: Partial<DiceThrow>): void {
    const current = this.state().get(key);
    if (!current || current.phase === 'failed') return;
    const next = new Map(this.state());
    next.set(key, { ...current, ...change });
    this.state.set(next);
  }
}

/** Whether two lists of a line's frames show the same throws in the same shapes. */
function sameFrames(a: readonly DiceFrame[], b: readonly DiceFrame[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (frame, i) =>
        frame.key === b[i].key &&
        frame.aspect === b[i].aspect &&
        frame.overflow === b[i].overflow &&
        frame.diceThrow === b[i].diceThrow
    )
  );
}

/** Whether a throw is one of the dice thrown to try a look out. */
function isTryOut(diceThrow: DiceThrow): boolean {
  return diceThrow.messageIdentifier.startsWith(TRY_OUT);
}

/** Runs some work in a quiet moment, or soon where the browser has no word for one. */
function whenIdle(work: () => void): void {
  const idle = globalThis.requestIdleCallback;
  if (typeof idle === 'function') idle(() => work(), { timeout: WARM_UP_WITHIN_MS });
  else setTimeout(work, 0);
}

/** How many dice a roll's tray tells it could not hold: the last tells them all, the rest none. */
function overflowOn(part: number, trays: number, plan: ThrowPlan): number {
  return part === trays - 1 ? plan.overflow : 0;
}

/** The tray a roll's dice are thrown onto in the frame of its line. */
function frameTrayFor(count: number): Tray {
  return trayFor(count, frameAspectFor(count), FRAME_TRAY_AREA);
}

/** A recording cut down to its last frame, where the dice lie at rest, turned the same. */
function restOf(result: DiceThrowResult): DiceThrowResult {
  const stride = result.landed.length * FRAME_STRIDE;
  const last = result.frameCount - 1;
  return { ...result, frameCount: 1, restFrame: 0, frames: result.frames.slice(last * stride, (last + 1) * stride) };
}

/** A recording of a single frame, the dice laid down side by side showing their numbers. */
function laidDown(dice: readonly DieToThrow[], tray: Tray, key: string): DiceThrowResult {
  const poses = restingLayout(dice, tray, throwSeedOf(key));
  const frames = new Float32Array(dice.length * FRAME_STRIDE);
  poses.forEach((pose, index) =>
    frames.set([...pose.position, ...readable(dice[index], pose.rotation)], index * FRAME_STRIDE)
  );
  return {
    frameCount: 1,
    restFrame: 0,
    frames,
    landed: dice.map((die) => die.target),
    corrections: dice.map(() => NO_TURN),
    attempt: 0,
    fault: null,
  };
}

/**
 * A die laid down turned about the upright so its number reads the right way up to the reader,
 * keeping a little of the lean it was laid with so a row of dice does not look stamped out.
 */
function readable(die: DieToThrow, rotation: Quat): Quat {
  if (polyhedronOf(die.shape).readsCorners) return rotation;
  const [x, y] = quatRotate(rotation, faceFramesOf(die.shape)[die.target].up);
  const lean = Math.atan2(-x, y);
  const kept = Math.sign(lean) * Math.min(Math.abs(lean), MAX_LEAN_KEPT);
  return quatMultiply(quatFromAxisAngle(UP, kept - lean), rotation);
}

/** What each die shows at the end of its recording, turned as it is drawn. */
function shownBy(dice: readonly DieToThrow[], result: DiceThrowResult): string[] {
  const last = result.frameCount - 1;
  return dice.map((die, index) => {
    const at = (last * dice.length + index) * FRAME_STRIDE + 3;
    const rest: Quat = [result.frames[at], result.frames[at + 1], result.frames[at + 2], result.frames[at + 3]];
    const poly = polyhedronOf(die.shape);
    return labelOf(die.shape, die.labels, upFace(poly, quatMultiply(rest, result.corrections[index])));
  });
}
