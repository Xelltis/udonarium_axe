import { holdsHotbarCell, HotbarCell } from '@axe/domain/hotbar/hotbar-size';
import { HotbarSlotKind } from '@axe/domain/hotbar/hotbar-slot-kind';
import { CharacterPanelName, DEFAULT_CHARACTER_PANEL, toCharacterPanelName } from '@axe/domain/ui/room-panel';

export type EffectCastMode = 'cast' | 'field' | 'preview';
export type TurnAction = 'next' | 'prev' | 'reset';

export type RangeSlotOptions = Extract<HotbarPayload, { kind: 'range' }>;
export type GroupSlotOptions = Extract<HotbarPayload, { kind: 'group' }>;

/** As long as a reader will wait for the next step of a group, and no longer. */
export const MAX_STEP_DELAY_MS = 10_000;

/**
 * One slot a group runs.
 *
 * The slot itself is named, so the group follows it when the reader drags it somewhere else.
 * A bar read in from a file makes its slots afresh under new identifiers, and there the cell
 * it sat in is what finds it again.
 */
export interface HotbarStep extends HotbarCell {
  slotIdentifier: string;
  /** How long to wait after the step before this one. The first step of a group runs at once. */
  delayMs: number;
}

export type HotbarPayload =
  | { kind: 'chat'; tab: string; gameType: string; colorIndex: number }
  | { kind: 'effect'; mode: EffectCastMode; onSelf: boolean }
  | {
      kind: 'range';
      dock: boolean;
      name: string;
      length: number;
      width: number;
      borderColor: string;
      fillColor: string;
      opacity: number;
      fillOutline: boolean;
      rotateSnap: boolean;
      shiftX: boolean;
      shiftY: boolean;
    }
  | { kind: 'panel'; panel: CharacterPanelName }
  | { kind: 'sound'; local: boolean }
  | { kind: 'cutIn'; soundOnly: boolean }
  | { kind: 'turn'; action: TurnAction }
  /** A piece changing what it looks like. A part left at its "leave it" value is not touched. */
  | { kind: 'appearance'; image: number; portrait: number; size: number }
  | { kind: 'group'; steps: HotbarStep[] }
  | { kind: 'plain' };

/**
 * Whether a step and a slot are the same slot.
 *
 * The identifier is asked for first, and the cell answers where it cannot: a bar read in from
 * a file makes its slots afresh under new identifiers, and a group written before that would
 * otherwise point at nothing - which is how a run kept working while the editor showed every
 * step of it as gone.
 */
export function sameHotbarStep(
  step: HotbarCell & { slotIdentifier: string },
  slot: HotbarCell & { slotIdentifier: string }
): boolean {
  if (step.slotIdentifier && slot.slotIdentifier && step.slotIdentifier === slot.slotIdentifier) return true;
  return step.page === slot.page && step.slotIndex === slot.slotIndex;
}

/** What an appearance slot holds for a part it leaves alone: no image chosen, and no size given. */
export const KEEP_INDEX = -1;
export const KEEP_SIZE = 0;

export const EFFECT_MODES: readonly EffectCastMode[] = ['cast', 'field', 'preview'];
export const TURN_ACTIONS: readonly TurnAction[] = ['next', 'prev', 'reset'];

export function defaultHotbarPayload(kind: HotbarSlotKind): HotbarPayload {
  switch (kind) {
    case 'chat':
      return { kind: 'chat', tab: '', gameType: '', colorIndex: 0 };
    case 'effect':
      return { kind: 'effect', mode: 'cast', onSelf: false };
    case 'range':
      return {
        kind: 'range',
        dock: true,
        name: '',
        length: 0,
        width: 0,
        borderColor: '',
        fillColor: '',
        opacity: 100,
        fillOutline: false,
        rotateSnap: true,
        shiftX: false,
        shiftY: false,
      };
    case 'panel':
      return { kind: 'panel', panel: DEFAULT_CHARACTER_PANEL };
    case 'sound':
      return { kind: 'sound', local: false };
    case 'cutIn':
      return { kind: 'cutIn', soundOnly: false };
    case 'turn':
      return { kind: 'turn', action: 'next' };
    case 'appearance':
      return { kind: 'appearance', image: KEEP_INDEX, portrait: KEEP_INDEX, size: KEEP_SIZE };
    case 'group':
      return { kind: 'group', steps: [] };
    default:
      return { kind: 'plain' };
  }
}

export function parseHotbarPayload(kind: HotbarSlotKind, raw: unknown): HotbarPayload {
  const fallback = defaultHotbarPayload(kind);
  const held = readObject(raw);
  if (!held) return fallback;

  switch (fallback.kind) {
    case 'chat':
      return {
        kind: 'chat',
        tab: readString(held.tab, fallback.tab),
        gameType: readString(held.gameType, fallback.gameType),
        colorIndex: readIndex(held.colorIndex, fallback.colorIndex),
      };
    case 'effect':
      return {
        kind: 'effect',
        mode: readOneOf(held.mode, EFFECT_MODES, fallback.mode),
        onSelf: readBoolean(held.onSelf, fallback.onSelf),
      };
    case 'range':
      return {
        kind: 'range',
        dock: readBoolean(held.dock, fallback.dock),
        name: readString(held.name, fallback.name),
        length: readIndex(held.length, fallback.length),
        width: readIndex(held.width, fallback.width),
        borderColor: readString(held.borderColor, fallback.borderColor),
        fillColor: readString(held.fillColor, fallback.fillColor),
        opacity: readPercent(held.opacity, fallback.opacity),
        fillOutline: readBoolean(held.fillOutline, fallback.fillOutline),
        rotateSnap: readBoolean(held.rotateSnap, fallback.rotateSnap),
        shiftX: readBoolean(held.shiftX, fallback.shiftX),
        shiftY: readBoolean(held.shiftY, fallback.shiftY),
      };
    case 'panel':
      return { kind: 'panel', panel: toCharacterPanelName(held.panel) };
    case 'sound':
      return { kind: 'sound', local: readBoolean(held.local, fallback.local) };
    case 'cutIn':
      return { kind: 'cutIn', soundOnly: readBoolean(held.soundOnly, fallback.soundOnly) };
    case 'turn':
      return { kind: 'turn', action: readOneOf(held.action, TURN_ACTIONS, fallback.action) };
    case 'appearance':
      return {
        kind: 'appearance',
        image: readChoice(held.image, fallback.image),
        portrait: readChoice(held.portrait, fallback.portrait),
        size: readIndex(held.size, fallback.size),
      };
    case 'group':
      // A group written before each step had a wait of its own kept one wait for the lot;
      // it is read as that wait before every step but the first, which is what it meant.
      return { kind: 'group', steps: readSteps(held.steps, readIndex(held.delayMs, 0)) };
    default:
      return fallback;
  }
}

export function encodeHotbarPayload(payload: HotbarPayload): string {
  if (payload.kind === 'plain') return '';
  const { kind: _kind, ...rest } = payload;
  return JSON.stringify(rest);
}

function readObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** An index into the pictures a character carries, or {@link KEEP_INDEX} for the one it has. */
function readChoice(value: unknown, fallback: number): number {
  const held = Number(value);
  if (!Number.isFinite(held)) return fallback;
  return held < 0 ? KEEP_INDEX : Math.floor(held);
}

function readIndex(value: unknown, fallback: number): number {
  const held = Number(value);
  return Number.isFinite(held) && held >= 0 ? Math.floor(held) : fallback;
}

/** Only the cells the bar actually has, so a file naming a sixth page names nothing. */
function readSteps(value: unknown, fallbackDelayMs: number): HotbarStep[] {
  if (!Array.isArray(value)) return [];

  const steps: HotbarStep[] = [];
  for (const held of value as unknown[]) {
    const record = held as Record<string, unknown> | null;
    const cell = { page: Number(record?.['page']), slotIndex: Number(record?.['slotIndex']) };
    if (!holdsHotbarCell(cell)) continue;
    steps.push({
      ...cell,
      slotIdentifier: readString(record?.['slotIdentifier'], ''),
      delayMs: Math.min(MAX_STEP_DELAY_MS, readIndex(record?.['delayMs'], steps.length < 1 ? 0 : fallbackDelayMs)),
    });
  }
  return steps;
}

function readPercent(value: unknown, fallback: number): number {
  const held = Number(value);
  if (!Number.isFinite(held)) return fallback;
  return Math.round(Math.max(0, Math.min(100, held)));
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
