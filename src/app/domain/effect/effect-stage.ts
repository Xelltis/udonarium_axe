import { type EffectKind, isEffectKind } from '@axe/domain/effect/effect-kind';

/**
 * An effect built out of stages.
 *
 * Without stages an effect is one look with one landing. A stage list makes it a run: it leaves
 * somewhere, travels, lands, throws off what it lands into, and leaves something behind.
 * Each stage names one of the looks the tool already draws, so the parts are the effects
 * that exist rather than a new vocabulary to learn.
 *
 * Stages name looks, never other effects. Nothing can therefore call itself round again,
 * and the depth is known before anything is drawn.
 */

export type EffectStageRole = 'travel' | 'impact' | 'field' | 'spawn';

export const EFFECT_STAGE_ROLES: readonly EffectStageRole[] = ['travel', 'impact', 'field', 'spawn'];

/** How many stages one effect may run, and how far a spawn may throw. */
export const MAX_STAGES = 6;
export const MAX_BRANCHES = 8;
export const MIN_STAGE_MS = 80;
export const MAX_STAGE_MS = 6000;
export const DEFAULT_STAGE_MS = 500;

export interface EffectStage {
  role: EffectStageRole;
  /** The look this stage draws, which is one the tool already knows. */
  kind: EffectKind;
  durationMs: number;
  scale?: number;
  grade?: 1 | 2 | 3;
  colorPrimary?: string;
  colorSecondary?: string;
  /** How many ways a spawn throws, and how wide, in degrees. */
  branches?: number;
  spreadDeg?: number;
  /** What each of those goes on to do. A branch may not spawn again. */
  children?: EffectStage[];
}

export interface StageWindow {
  stage: EffectStage;
  startMs: number;
  endMs: number;
  /** Which branch of a spawn this is, and how many there are, for placing it. */
  branch?: { index: number; count: number; spreadDeg: number };
}

/**
 * Where each stage falls on the clock.
 *
 * Travelling, landing and throwing follow one another: a stage starts where the one before
 * it ended. What is left behind runs alongside instead — a field is where the effect
 * finishes, not something the rest of it waits for.
 */
export interface StageLayout {
  windows: StageWindow[];
  totalMs: number;
}

/**
 * The same layout for as long as the list is the same one.
 *
 * A list is laid out to draw a frame, to say how long the run is and to place the sounds,
 * and the effect hands back the same list until its stages are written again. Laying it
 * out afresh for each of those, sixty times a second, is work with one answer.
 */
const laidOut = new WeakMap<readonly EffectStage[], StageLayout>();

/** Where each stage falls on the clock, laid out once and reused for as long as the list is the same array. */
export function stageLayoutOf(stages: readonly EffectStage[]): StageLayout {
  const known = laidOut.get(stages);
  if (known) return known;

  const layout = layOutStages(stages);
  laidOut.set(stages, layout);
  return layout;
}

/**
 * Works out afresh where each stage falls on the clock; `stageLayoutOf` is the cached way in.
 *
 * Each branch of a spawn gets windows of its own after the spawn's. The whole run lasts at
 * least 80 milliseconds.
 */
export function layOutStages(stages: readonly EffectStage[]): StageLayout {
  const windows: StageWindow[] = [];
  let at = 0;
  let total = 0;

  for (const stage of stages) {
    const length = stageDuration(stage);
    windows.push({ stage, startMs: at, endMs: at + length });

    if (stage.role === 'spawn') windows.push(...branchWindows(stage, at));
    if (stage.role !== 'field') at += length;
    total = Math.max(total, at, windows[windows.length - 1].endMs);
  }
  return { windows, totalMs: Math.max(total, MIN_STAGE_MS) };
}

/** A spawn runs for as long as the chain each branch follows. */
export function stageDuration(stage: EffectStage): number {
  if (stage.role === 'spawn') {
    const chain = (stage.children ?? []).reduce((sum, child) => sum + clampMs(child.durationMs), 0);
    return Math.max(chain, MIN_STAGE_MS);
  }
  return clampMs(stage.durationMs);
}

/** Every branch of a spawn starts together and follows the same chain, each its own way. */
function branchWindows(stage: EffectStage, startMs: number): StageWindow[] {
  const children = stage.children ?? [];
  const count = clampBranches(stage.branches);
  if (children.length < 1) return [];

  const windows: StageWindow[] = [];
  for (let index = 0; index < count; index++) {
    let at = startMs;
    for (const child of children) {
      const length = clampMs(child.durationMs);
      windows.push({
        stage: child,
        startMs: at,
        endMs: at + length,
        branch: { index, count, spreadDeg: clampSpread(stage.spreadDeg) },
      });
      at += length;
    }
  }
  return windows;
}

/**
 * Reads a stage list back off a preset.
 *
 * Anything it cannot read comes back as no stages at all, which is how an effect written
 * before stages existed behaves: it draws the one look it always drew.
 */
export function parseEffectStages(raw: string | null | undefined): EffectStage[] {
  if (!raw || raw.trim().length < 1) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, MAX_STAGES)
      .map((entry) => readStage(entry, true))
      .filter((stage): stage is EffectStage => stage !== null);
  } catch {
    return [];
  }
}

/**
 * Writes a stage list into the form a preset stores.
 *
 * An empty list writes as an empty string, which is what an effect of one look holds. Stages
 * past the most a run may have are dropped.
 */
export function encodeEffectStages(stages: readonly EffectStage[]): string {
  if (stages.length < 1) return '';
  try {
    return JSON.stringify(stages.slice(0, MAX_STAGES));
  } catch {
    return '';
  }
}

function readStage(entry: unknown, allowSpawn: boolean): EffectStage | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const source = entry as Record<string, unknown>;

  const kind = source['kind'];
  if (!isEffectKind(kind)) return null;

  const role = readRole(source['role'], allowSpawn);
  const stage: EffectStage = { role, kind, durationMs: clampMs(source['durationMs']) };

  const scale = Number(source['scale']);
  if (Number.isFinite(scale) && scale > 0) stage.scale = Math.min(scale, 8);
  const grade = Number(source['grade']);
  if (grade === 1 || grade === 2 || grade === 3) stage.grade = grade;
  if (typeof source['colorPrimary'] === 'string') stage.colorPrimary = source['colorPrimary'];
  if (typeof source['colorSecondary'] === 'string') stage.colorSecondary = source['colorSecondary'];

  if (role !== 'spawn') return stage;

  stage.branches = clampBranches(source['branches']);
  stage.spreadDeg = clampSpread(source['spreadDeg']);
  // A branch may not spawn again: one level is what can be read on the board, and what can be drawn.
  stage.children = Array.isArray(source['children'])
    ? source['children']
        .slice(0, MAX_STAGES)
        .map((child) => readStage(child, false))
        .filter((child): child is EffectStage => child !== null)
    : [];
  return stage;
}

/** A stage of an unknown role lands, which is the one every look can do. */
function readRole(value: unknown, allowSpawn: boolean): EffectStageRole {
  if (value === 'travel' || value === 'field' || value === 'impact') return value;
  if (value === 'spawn') return allowSpawn ? 'spawn' : 'impact';
  return 'impact';
}

function clampMs(value: unknown): number {
  const length = Number(value);
  if (!Number.isFinite(length)) return DEFAULT_STAGE_MS;
  return Math.min(Math.max(Math.round(length), MIN_STAGE_MS), MAX_STAGE_MS);
}

function clampBranches(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) return 3;
  return Math.min(Math.max(Math.round(count), 2), MAX_BRANCHES);
}

function clampSpread(value: unknown): number {
  const spread = Number(value);
  if (!Number.isFinite(spread)) return 120;
  return Math.min(Math.max(Math.round(spread), 10), 360);
}
