import { asTriggerRepeat, DEFAULT_TRIGGER_REPEAT, TriggerRepeat } from '@axe/domain/tabletop/trigger-event';

/**
 * Who a switch speaks as.
 *
 * `presser` is whoever pressed it, as the piece they have picked to speak as, which is how a
 * line typed into the chat would go out. `host` is the thing the switch sits on, speaking under
 * its own name, which is how a door or a chest describes itself. `system` is the room's own voice.
 */
export const SWITCH_SPEAKERS = ['presser', 'host', 'system'] as const;

export type SwitchSpeaker = (typeof SWITCH_SPEAKERS)[number];

export const DEFAULT_SWITCH_SPEAKER: SwitchSpeaker = 'presser';

/** The kinds of thing a switch can do that this version knows how to do. */
export const SWITCH_ACTION_KINDS = [
  'say',
  'secret',
  'sound',
  'effect',
  'cutIn',
  'reveal',
  'conceal',
  'removeSelf',
  'spawn',
  'showTable',
  'carry',
  'tableSetting',
] as const;

export type SwitchActionKind = (typeof SWITCH_ACTION_KINDS)[number];

/** As long as a switch will wait between one thing and the next, and no longer. */
export const MAX_SWITCH_DELAY_MS = 10_000;

/** As many things as one switch may do, so a pasted file cannot hold the room up for an hour. */
export const MAX_SWITCH_ACTIONS = 20;

/** As far away as a switch can ask the presser's piece to stand, in cells. */
export const MAX_SWITCH_RANGE = 99;

/**
 * Who reads a line kept back from the room: the presser and the master, or the master alone.
 *
 * What a search turns up is for whoever searched, and a trip wire the party is not meant to notice
 * is for the master; either way the rest of the room sees only that something was kept back.
 */
export const SWITCH_SECRET_READERS = ['presser', 'master'] as const;

export type SwitchSecretReader = (typeof SWITCH_SECRET_READERS)[number];

interface SwitchActionBase {
  /** How long to wait after the thing before this one. The first runs at once. */
  delayMs: number;
  /** Whatever a newer version wrote on this action and this one cannot read, kept as it came. */
  extra: Record<string, unknown>;
}

/** A line spoken into the chat, with dice rolled and references filled in as a typed line would be. */
export interface SwitchSay extends SwitchActionBase {
  kind: 'say';
  text: string;
}

/** A line kept back from the room, which only the presser and the master, or the master alone, read. */
export interface SwitchSecret extends SwitchActionBase {
  kind: 'secret';
  text: string;
  to: SwitchSecretReader;
}

/** Something played by name: a sound, an effect or a cut-in. */
export interface SwitchCue extends SwitchActionBase {
  kind: 'sound' | 'effect' | 'cutIn';
  name: string;
}

/**
 * Something on the table, named the way a map carried into another room can still find it: by what
 * it was in the room it was chosen in, and failing that by what it is called.
 */
export interface SwitchTargetRef {
  identifier: string;
  name: string;
}

interface SwitchTargetAction extends SwitchActionBase {
  target: SwitchTargetRef;
}

/** Something the master put out of sight, brought back to where it was. */
export interface SwitchReveal extends SwitchTargetAction {
  kind: 'reveal';
}

/** Something on the table, put out of sight where it stands. */
export interface SwitchConceal extends SwitchTargetAction {
  kind: 'conceal';
}

export type SwitchShowHide = SwitchReveal | SwitchConceal;

/** As many copies as one press may set down, so a slip of the keyboard does not fill the table. */
export const MAX_SWITCH_SPAWN = 10;

/** Where copies are set down: round the switch, or round the presser's piece. */
export const SWITCH_SPAWN_PLACES = ['host', 'presser'] as const;

export type SwitchSpawnPlace = (typeof SWITCH_SPAWN_PLACES)[number];

/**
 * Copies of a piece set down on the table, as many as asked for, nearest first round where they
 * are to stand. The piece copied is left where it is, which is usually the graveyard or somewhere
 * out of sight, kept for the purpose.
 */
export interface SwitchSpawn extends SwitchTargetAction {
  kind: 'spawn';
  count: number;
  place: SwitchSpawnPlace;
}

/** Everybody's view turned to another table, which is how a scene changes. */
export interface SwitchShowTable extends SwitchActionBase {
  kind: 'showTable';
  table: SwitchTargetRef;
}

/**
 * The presser's piece carried to a cell, on the table being looked at or on another, which turns
 * the room's view with it the way a pitfall to the floor below does.
 */
export interface SwitchCarry extends SwitchActionBase {
  kind: 'carry';
  col: number;
  row: number;
  /** The table it is carried onto. Empty keeps it on the one being looked at. */
  table: SwitchTargetRef;
}

/** What a switch does to a setting of the table: leaves it, turns it on, or turns it off. */
export const SWITCH_TOGGLES = ['keep', 'on', 'off'] as const;

export type SwitchToggle = (typeof SWITCH_TOGGLES)[number];

/** The table being looked at changed: its darkness, its fog, its picture, and the music. */
export interface SwitchTableSetting extends SwitchActionBase {
  kind: 'tableSetting';
  darkness: SwitchToggle;
  fog: SwitchToggle;
  /** The picture laid on the table. Empty leaves it. */
  image: SwitchTargetRef;
  /** The music to put on. Empty leaves whatever is playing. */
  bgm: SwitchTargetRef;
  /** Whether the music stops, which it does before anything is put on. */
  bgmStop: boolean;
}

/**
 * The thing the switch sits on taken away once it has done everything else: a block is taken off
 * the table, and painted ground is put away where only the master sees it.
 */
export interface SwitchRemoveSelf extends SwitchActionBase {
  kind: 'removeSelf';
}

/**
 * Something a newer version knows how to do and this one does not.
 *
 * Kept whole rather than read as something this version does know: a switch that makes monsters
 * appear, read by a version that cannot, is better left doing nothing than saying its settings
 * aloud in the chat.
 */
export interface SwitchUnknownAction extends SwitchActionBase {
  kind: 'unknown';
  /** The action as it was written, its own kind included. */
  raw: Record<string, unknown>;
}

export type SwitchAction =
  | SwitchSay
  | SwitchSecret
  | SwitchCue
  | SwitchReveal
  | SwitchConceal
  | SwitchRemoveSelf
  | SwitchSpawn
  | SwitchShowTable
  | SwitchCarry
  | SwitchTableSetting
  | SwitchUnknownAction;

/** What a switch is called and what it does when it is pressed. */
export interface SwitchDefinition {
  /** What is written beside it for whoever is looking at the table. */
  label: string;
  speaker: SwitchSpeaker;
  /** The chat tab it speaks into, by identifier. Empty speaks into the tab the presser has open. */
  tab: string;
  /** The dice system its lines are rolled under. Empty takes the speaker's or the room's. */
  gameType: string;
  /** Whether somebody watching may press it, where the tab lets watchers speak. */
  guests: boolean;
  /**
   * How near the presser's piece has to stand, in cells counted the way pieces step. Nought lets
   * it be pressed from anywhere.
   */
  range: number;
  /** Whether it can only be pressed by somebody who can see it. */
  needsSight: boolean;
  /** How often it can be pressed, in the words painted ground uses. */
  repeat: TriggerRepeat;
  actions: SwitchAction[];
  /** Whatever a newer version wrote on the switch and this one cannot read, kept as it came. */
  extra: Record<string, unknown>;
}

export function defaultSwitchDefinition(): SwitchDefinition {
  return {
    label: '',
    speaker: DEFAULT_SWITCH_SPEAKER,
    tab: '',
    gameType: '',
    guests: false,
    range: 0,
    needsSight: false,
    repeat: DEFAULT_TRIGGER_REPEAT,
    actions: [],
    extra: {},
  };
}

const DEFINITION_KEYS = [
  'v',
  'label',
  'speaker',
  'tab',
  'gameType',
  'guests',
  'range',
  'needsSight',
  'repeat',
  'actions',
];
const SAY_KEYS = ['kind', 'delayMs', 'text'];
const SECRET_KEYS = ['kind', 'delayMs', 'text', 'to'];
const TARGET_KEYS = ['kind', 'delayMs', 'target'];
const BARE_KEYS = ['kind', 'delayMs'];
const SPAWN_KEYS = ['kind', 'delayMs', 'target', 'count', 'place'];
const SHOW_TABLE_KEYS = ['kind', 'delayMs', 'table'];
const CARRY_KEYS = ['kind', 'delayMs', 'col', 'row', 'table'];
const TABLE_SETTING_KEYS = ['kind', 'delayMs', 'darkness', 'fog', 'image', 'bgm', 'bgmStop'];
const CUE_KEYS = ['kind', 'delayMs', 'name'];

function readToggle(value: unknown): SwitchToggle {
  return value === 'on' || value === 'off' ? value : 'keep';
}

function readCell(value: unknown): number {
  const held = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(held) && held > 0 ? Math.min(999, Math.round(held)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Whether a stored answer means yes.
 *
 * A hand-written file or an older peer can hand back text where a boolean was written, so the
 * written forms of no are read as no rather than as a word that happens to have letters in it.
 */
function readFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;
  const held = value.trim().toLowerCase();
  return held.length > 0 && held !== '0' && held !== 'false';
}

/** A wait read from what was stored, as a whole number of milliseconds from none to the longest. */
export function clampSwitchDelay(value: unknown): number {
  const held = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(held) || held <= 0) return 0;
  return Math.min(MAX_SWITCH_DELAY_MS, Math.round(held));
}

function leftOver(record: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) if (!known.includes(key)) extra[key] = value;
  return extra;
}

/** A reach read from what was stored, as a whole number of cells from none to the farthest. */
export function clampSwitchRange(value: unknown): number {
  const held = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(held) || held <= 0) return 0;
  return Math.min(MAX_SWITCH_RANGE, Math.round(held));
}

/** How many copies a press sets down, from one to the most. */
export function clampSwitchSpawn(value: unknown): number {
  const held = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(held) || held < 1) return 1;
  return Math.min(MAX_SWITCH_SPAWN, Math.round(held));
}

function readTarget(value: unknown): SwitchTargetRef {
  if (!isRecord(value)) return { identifier: '', name: '' };
  return { identifier: readText(value['identifier']), name: readText(value['name']) };
}

function readSecretReader(value: unknown): SwitchSecretReader {
  return value === 'master' ? 'master' : 'presser';
}

function readSpeaker(value: unknown): SwitchSpeaker {
  return typeof value === 'string' && (SWITCH_SPEAKERS as readonly string[]).includes(value)
    ? (value as SwitchSpeaker)
    : DEFAULT_SWITCH_SPEAKER;
}

function readAction(raw: unknown): SwitchAction | null {
  if (!isRecord(raw)) return null;
  const delayMs = clampSwitchDelay(raw['delayMs']);
  const kind = raw['kind'];
  if (kind === 'say') return { kind, text: readText(raw['text']), delayMs, extra: leftOver(raw, SAY_KEYS) };
  if (kind === 'secret') {
    return {
      kind,
      text: readText(raw['text']),
      to: readSecretReader(raw['to']),
      delayMs,
      extra: leftOver(raw, SECRET_KEYS),
    };
  }
  if (kind === 'sound' || kind === 'effect' || kind === 'cutIn') {
    return { kind, name: readText(raw['name']), delayMs, extra: leftOver(raw, CUE_KEYS) };
  }
  if (kind === 'reveal' || kind === 'conceal') {
    return { kind, target: readTarget(raw['target']), delayMs, extra: leftOver(raw, TARGET_KEYS) };
  }
  if (kind === 'removeSelf') return { kind, delayMs, extra: leftOver(raw, BARE_KEYS) };
  if (kind === 'showTable')
    return { kind, table: readTarget(raw['table']), delayMs, extra: leftOver(raw, SHOW_TABLE_KEYS) };
  if (kind === 'carry') {
    return {
      kind,
      col: readCell(raw['col']),
      row: readCell(raw['row']),
      table: readTarget(raw['table']),
      delayMs,
      extra: leftOver(raw, CARRY_KEYS),
    };
  }
  if (kind === 'tableSetting') {
    return {
      kind,
      darkness: readToggle(raw['darkness']),
      fog: readToggle(raw['fog']),
      image: readTarget(raw['image']),
      bgm: readTarget(raw['bgm']),
      bgmStop: readFlag(raw['bgmStop']),
      delayMs,
      extra: leftOver(raw, TABLE_SETTING_KEYS),
    };
  }
  if (kind === 'spawn') {
    return {
      kind,
      target: readTarget(raw['target']),
      count: clampSwitchSpawn(raw['count']),
      place: raw['place'] === 'presser' ? 'presser' : 'host',
      delayMs,
      extra: leftOver(raw, SPAWN_KEYS),
    };
  }
  if (typeof kind !== 'string' || kind.length < 1) return null;
  return { kind: 'unknown', raw: { ...raw }, delayMs, extra: {} };
}

/**
 * Reads a switch back from what it stored, or a switch that does nothing where there is nothing
 * readable to read.
 *
 * Forgiving throughout: an action it cannot make sense of is dropped rather than taking the rest
 * with it, and whatever a newer version wrote that this one cannot read is kept so that writing
 * the switch back hands it on unchanged.
 */
export function parseSwitchDefinition(stored: string | null | undefined): SwitchDefinition {
  const fallback = defaultSwitchDefinition();
  if (typeof stored !== 'string' || stored.trim().length < 1) return fallback;
  let held: unknown;
  try {
    held = JSON.parse(stored);
  } catch {
    return fallback;
  }
  if (!isRecord(held)) return fallback;
  const actions = Array.isArray(held['actions']) ? held['actions'] : [];
  return {
    label: readText(held['label']),
    speaker: readSpeaker(held['speaker']),
    tab: readText(held['tab']),
    gameType: readText(held['gameType']),
    guests: readFlag(held['guests']),
    range: clampSwitchRange(held['range']),
    needsSight: readFlag(held['needsSight']),
    repeat: asTriggerRepeat(held['repeat']),
    actions: actions
      .map(readAction)
      .filter((action): action is SwitchAction => action !== null)
      .slice(0, MAX_SWITCH_ACTIONS),
    extra: leftOver(held, DEFINITION_KEYS),
  };
}

function writeAction(action: SwitchAction): Record<string, unknown> {
  switch (action.kind) {
    case 'say':
      return { ...action.extra, kind: action.kind, delayMs: action.delayMs, text: action.text };
    case 'secret':
      return { ...action.extra, kind: action.kind, delayMs: action.delayMs, text: action.text, to: action.to };
    case 'sound':
    case 'effect':
    case 'cutIn':
      return { ...action.extra, kind: action.kind, delayMs: action.delayMs, name: action.name };
    case 'reveal':
    case 'conceal':
      return { ...action.extra, kind: action.kind, delayMs: action.delayMs, target: { ...action.target } };
    case 'removeSelf':
      return { ...action.extra, kind: action.kind, delayMs: action.delayMs };
    case 'showTable':
      return { ...action.extra, kind: action.kind, delayMs: action.delayMs, table: { ...action.table } };
    case 'carry':
      return {
        ...action.extra,
        kind: action.kind,
        delayMs: action.delayMs,
        col: action.col,
        row: action.row,
        table: { ...action.table },
      };
    case 'tableSetting':
      return {
        ...action.extra,
        kind: action.kind,
        delayMs: action.delayMs,
        darkness: action.darkness,
        fog: action.fog,
        image: { ...action.image },
        bgm: { ...action.bgm },
        bgmStop: action.bgmStop,
      };
    case 'spawn':
      return {
        ...action.extra,
        kind: action.kind,
        delayMs: action.delayMs,
        target: { ...action.target },
        count: clampSwitchSpawn(action.count),
        place: action.place,
      };
    case 'unknown':
      return { ...action.raw, delayMs: action.delayMs };
  }
}

/** The switch as text, for the one place it is kept. */
export function encodeSwitchDefinition(definition: SwitchDefinition): string {
  return JSON.stringify({
    ...definition.extra,
    v: 1,
    label: definition.label,
    speaker: definition.speaker,
    tab: definition.tab,
    gameType: definition.gameType,
    guests: definition.guests,
    range: clampSwitchRange(definition.range),
    needsSight: definition.needsSight,
    repeat: definition.repeat,
    actions: definition.actions.slice(0, MAX_SWITCH_ACTIONS).map(writeAction),
  });
}

/** A fresh action of a kind, with nothing written in it yet. */
export function newSwitchAction(kind: 'say'): SwitchSay;
export function newSwitchAction(kind: 'secret'): SwitchSecret;
export function newSwitchAction(kind: SwitchShowHide['kind']): SwitchShowHide;
export function newSwitchAction(kind: 'removeSelf'): SwitchRemoveSelf;
export function newSwitchAction(kind: 'spawn'): SwitchSpawn;
export function newSwitchAction(kind: 'showTable'): SwitchShowTable;
export function newSwitchAction(kind: 'carry'): SwitchCarry;
export function newSwitchAction(kind: 'tableSetting'): SwitchTableSetting;
export function newSwitchAction(kind: SwitchCue['kind']): SwitchCue;
export function newSwitchAction(kind: SwitchActionKind): SwitchAction;
export function newSwitchAction(kind: SwitchActionKind): SwitchAction {
  if (kind === 'say') return { kind, text: '', delayMs: 0, extra: {} };
  if (kind === 'secret') return { kind, text: '', to: 'presser', delayMs: 0, extra: {} };
  if (kind === 'reveal' || kind === 'conceal')
    return { kind, target: { identifier: '', name: '' }, delayMs: 0, extra: {} };
  if (kind === 'removeSelf') return { kind, delayMs: 0, extra: {} };
  if (kind === 'spawn') {
    return { kind, target: { identifier: '', name: '' }, count: 1, place: 'host', delayMs: 0, extra: {} };
  }
  if (kind === 'showTable') return { kind, table: { identifier: '', name: '' }, delayMs: 0, extra: {} };
  if (kind === 'carry') return { kind, col: 0, row: 0, table: { identifier: '', name: '' }, delayMs: 0, extra: {} };
  if (kind === 'tableSetting') {
    return {
      kind,
      darkness: 'keep',
      fog: 'keep',
      image: { identifier: '', name: '' },
      bgm: { identifier: '', name: '' },
      bgmStop: false,
      delayMs: 0,
      extra: {},
    };
  }
  return { kind, name: '', delayMs: 0, extra: {} };
}

function names(ref: SwitchTargetRef): boolean {
  return ref.identifier.length > 0 || ref.name.trim().length > 0;
}

/** Whether pressing the switch would do anything this version knows how to do. */
export function switchDoesAnything(definition: SwitchDefinition): boolean {
  return definition.actions.some((action) => {
    if (action.kind === 'say' || action.kind === 'secret') return action.text.trim().length > 0;
    if (action.kind === 'reveal' || action.kind === 'conceal' || action.kind === 'spawn') return names(action.target);
    if (action.kind === 'removeSelf' || action.kind === 'carry') return true;
    if (action.kind === 'showTable') return names(action.table);
    if (action.kind === 'tableSetting') {
      return (
        action.darkness !== 'keep' ||
        action.fog !== 'keep' ||
        names(action.image) ||
        names(action.bgm) ||
        action.bgmStop
      );
    }
    if (action.kind === 'unknown') return false;
    return action.name.trim().length > 0;
  });
}
