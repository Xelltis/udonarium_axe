/**
 * When each beat of an exchange happens on the battle stage, and how far along each is at a
 * moment of the playing.
 *
 * The stage opens and the two sides step in; the one striking steps forward and the blow is
 * drawn; where it lands the struck reel, the numbers jump out and the bars fall; anybody brought
 * down goes down after that; then the stage holds a moment and closes. Every screen works out the
 * same frame from the time since it began, so nothing about the playing has to be sent along.
 */

/** How long the stage takes to open and the sides to step in. */
export const BATTLE_INTRO_MS = 560;
/** How long the one striking takes to step forward before the blow. */
export const BATTLE_STEP_MS = 220;
/** When the blow lands for an exchange drawn with no effect, after it starts. */
export const BATTLE_PLAIN_STRIKE_MS = 160;
/** How long the bars take to fall to where they ended. */
export const BATTLE_DRAIN_MS = 650;
/** How long the struck reel. */
export const BATTLE_SHAKE_MS = 320;
/** How long a number stays up over the fighter it belongs to. */
export const BATTLE_POP_MS = 1500;
/** As long after the landing as the stage waits for a long effect to finish. */
export const BATTLE_EFFECT_TAIL_MAX_MS = 2200;
/** As long as the stage waits for a fighter to finish going down. */
export const BATTLE_DEFEAT_MAX_MS = 2600;
/** How long a fighter brought down with no effect of its own takes to fade. */
export const BATTLE_PLAIN_DEFEAT_MS = 900;
/** How long the stage holds once everything has happened, before closing. */
export const BATTLE_HOLD_MS = 600;
/** How long the stage takes to close. */
export const BATTLE_OUTRO_MS = 380;
/** How long the stage stays up as one still picture, while motion is turned off. */
export const BATTLE_STILL_MS = 2600;
/** How far forward the one striking steps, in cells. */
export const BATTLE_STEP_CELLS = 0.9;

/** What a stage needs to know of the effects it draws to lay its beats out. */
export interface BattleTimelineInput {
  /** How long the effect of the blow plays, in milliseconds, or 0 for none. */
  effectMs: number;
  /** When its first blow lands, after it starts. Ignored without an effect. */
  landingMs: number;
  /** Whether somebody is brought down. */
  defeat: boolean;
  /** How long the effect of going down plays, or 0 for none. */
  defeatEffectMs: number;
}

/** The moments the beats happen at, in milliseconds since the stage began to open. */
export interface BattleTimeline {
  stepStart: number;
  effectStart: number;
  impact: number;
  drainEnd: number;
  /** When the one brought down begins to go down, or -1 where nobody is. */
  defeatStart: number;
  defeatEnd: number;
  outroStart: number;
  end: number;
}

/** Lays an exchange's beats out on the clock. */
export function battleTimeline(input: BattleTimelineInput): BattleTimeline {
  const stepStart = BATTLE_INTRO_MS;
  const effectStart = stepStart + BATTLE_STEP_MS;
  const hasEffect = input.effectMs > 0;
  const impact = effectStart + (hasEffect ? clampTime(input.landingMs, 0, input.effectMs) : BATTLE_PLAIN_STRIKE_MS);
  const drainEnd = impact + BATTLE_DRAIN_MS;
  const effectEnd = hasEffect ? Math.min(effectStart + input.effectMs, impact + BATTLE_EFFECT_TAIL_MAX_MS) : impact;

  const defeatStart = input.defeat ? drainEnd + 200 : -1;
  const defeatLength = input.defeatEffectMs > 0 ? input.defeatEffectMs : BATTLE_PLAIN_DEFEAT_MS;
  const defeatEnd = input.defeat ? defeatStart + Math.min(defeatLength, BATTLE_DEFEAT_MAX_MS) : -1;

  const settled = Math.max(effectEnd, drainEnd + BATTLE_POP_MS - BATTLE_DRAIN_MS, defeatEnd);
  const outroStart = settled + BATTLE_HOLD_MS;
  return {
    stepStart,
    effectStart,
    impact,
    drainEnd,
    defeatStart,
    defeatEnd,
    outroStart,
    end: outroStart + BATTLE_OUTRO_MS,
  };
}

/** How far through a stretch of time a moment is, from 0 before it to 1 after it. */
export function progressBetween(elapsed: number, start: number, end: number): number {
  if (end <= start) return elapsed >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (elapsed - start) / (end - start)));
}

/** A movement that starts quickly and settles. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** A movement that starts and ends gently. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** How open the stage stands, from 0 shut to 1 open: it opens first and closes last. */
export function stageOpenness(elapsed: number, timeline: BattleTimeline): number {
  const opening = easeOutCubic(progressBetween(elapsed, 0, 320));
  const closing = progressBetween(elapsed, timeline.outroStart, timeline.end);
  return opening * (1 - closing);
}

/** How far in the sides have stepped, from 0 off the stage to 1 in place. */
export function fighterEntry(elapsed: number): number {
  return easeOutCubic(progressBetween(elapsed, 80, BATTLE_INTRO_MS));
}

/** How far forward the one striking stands, from 0 in place to 1 a step forward, back once the blow has landed. */
export function attackerStep(elapsed: number, timeline: BattleTimeline): number {
  const forward = easeOutCubic(progressBetween(elapsed, timeline.stepStart, timeline.effectStart));
  const back = easeInOutCubic(progressBetween(elapsed, timeline.impact + 150, timeline.impact + 450));
  return forward * (1 - back);
}

/**
 * How far the struck are knocked aside at a moment, in cells: a jolt that dies away after the blow.
 * Nothing before it lands or once it has passed.
 */
export function hitJolt(elapsed: number, timeline: BattleTimeline): number {
  const since = elapsed - timeline.impact;
  if (since < 0 || since > BATTLE_SHAKE_MS) return 0;
  const fade = 1 - since / BATTLE_SHAKE_MS;
  return Math.sin((since / BATTLE_SHAKE_MS) * Math.PI * 6) * 0.18 * fade;
}

/** How far the bars have fallen, from 0 where they stood to 1 where they ended. */
export function drainProgress(elapsed: number, timeline: BattleTimeline): number {
  return easeInOutCubic(progressBetween(elapsed, timeline.impact, timeline.drainEnd));
}

/** Where a bar stands partway through its fall. */
export function gaugeReadingAt(before: number, after: number, progress: number): number {
  return before + (after - before) * progress;
}

/**
 * How a number over a fighter stands: hidden before the blow lands, then jumping out large,
 * settling, and fading as it drifts up. Its scale, how high it has drifted in cells, and how solid it is.
 */
export function popState(elapsed: number, timeline: BattleTimeline): { scale: number; rise: number; opacity: number } {
  const since = elapsed - timeline.impact;
  if (since < 0 || since > BATTLE_POP_MS) return { scale: 1, rise: 0, opacity: 0 };
  const burst = progressBetween(since, 0, 180);
  const scale = 1.6 - 0.6 * easeOutCubic(burst);
  const rise = 0.35 * easeOutCubic(progressBetween(since, 0, BATTLE_POP_MS));
  const opacity = 1 - progressBetween(since, BATTLE_POP_MS - 350, BATTLE_POP_MS);
  return { scale, rise, opacity };
}

/** How far a fighter brought down has gone, from 0 standing to 1 gone. Always 0 where nobody is. */
export function defeatProgress(elapsed: number, timeline: BattleTimeline): number {
  if (timeline.defeatStart < 0) return 0;
  return progressBetween(elapsed, timeline.defeatStart, timeline.defeatEnd);
}

function clampTime(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
