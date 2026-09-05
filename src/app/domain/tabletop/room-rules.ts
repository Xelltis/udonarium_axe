import {
  DEFAULT_CELL_DISTANCE,
  DEFAULT_CELL_DISTANCE_UNIT,
  DEFAULT_MOVE_RANGE_ELEMENT_NAMES,
} from '@axe/domain/tabletop/move/move-cells';
import {
  asZocMode,
  DEFAULT_ZOC_EXTRA_COST,
  DEFAULT_ZOC_MODE,
  DEFAULT_ZOC_RANGE,
  ZocMode,
} from '@axe/domain/tabletop/move/zone-of-control';
import { DEFAULT_TABLE_FACING_MARK } from '@axe/domain/tabletop/table-facing-mark';

/** How a piece walks and what an enemy holds against it, as the table plays it. */
export interface RoomRules {
  moveRangeEnabled: boolean;
  moveRangeElementNames: string;
  moveDiagonally: boolean;
  piecesShareCells: boolean;
  moveRangeAlways: boolean;
  zocAlways: boolean;
  cellDistance: number;
  cellDistanceUnit: string;
  zocMode: ZocMode;
  zocRange: number;
  zocExtraCost: number;
  facingMark: string;
}

/** The same rules in the looser terms a table holds them and an attribute carries them. */
export type RoomRuleValues = Omit<RoomRules, 'zocMode'> & { zocMode: string };

/** The same questions as the room hears them, where null is one it has not answered. */
export type RoomRuleAnswers = { [Rule in keyof RoomRuleValues]: RoomRuleValues[Rule] | null };

export const ROOM_RULE_DEFAULTS: RoomRules = {
  moveRangeEnabled: true,
  moveRangeElementNames: DEFAULT_MOVE_RANGE_ELEMENT_NAMES,
  moveDiagonally: true,
  piecesShareCells: true,
  moveRangeAlways: false,
  zocAlways: false,
  cellDistance: DEFAULT_CELL_DISTANCE,
  cellDistanceUnit: DEFAULT_CELL_DISTANCE_UNIT,
  zocMode: DEFAULT_ZOC_MODE,
  zocRange: DEFAULT_ZOC_RANGE,
  zocExtraCost: DEFAULT_ZOC_EXTRA_COST,
  facingMark: DEFAULT_TABLE_FACING_MARK,
};

/** The rules that are set together, and so are handed back to the table together. */
export const ROOM_RULE_GROUPS = {
  moveRange: [
    'moveRangeEnabled',
    'moveRangeAlways',
    'moveDiagonally',
    'piecesShareCells',
    'moveRangeElementNames',
    'cellDistance',
    'cellDistanceUnit',
  ],
  zoc: ['zocMode', 'zocRange', 'zocAlways', 'zocExtraCost'],
  facing: ['facingMark'],
} as const satisfies Record<string, readonly (keyof RoomRules)[]>;

export type RoomRuleGroup = keyof typeof ROOM_RULE_GROUPS;

/** Whether the room has taken over any of the rules in a group, or left them all alone. */
export function isGroupAnswered(answers: Partial<RoomRuleAnswers> | null, group: RoomRuleGroup): boolean {
  return ROOM_RULE_GROUPS[group].some((rule) => (answers?.[rule] ?? null) !== null);
}

/** What a room holds where it has no answer of its own. */
export const ROOM_RULE_UNANSWERED = '';

/** Reads a yes or no the room writes as text, which is what a room attribute can carry. */
export function readRuleFlag(held: unknown): boolean | null {
  if (held === true || held === false) return held;
  const text = `${held ?? ''}`;
  if (text === '1') return true;
  if (text === '0') return false;
  return null;
}

export function writeRuleFlag(answer: boolean | null): string {
  if (answer === null) return ROOM_RULE_UNANSWERED;
  return answer ? '1' : '0';
}

/** Reads a number the room writes, where anything below zero stands for no answer. */
export function readRuleNumber(held: unknown): number | null {
  const text = `${held ?? ''}`.trim();
  if (typeof held !== 'number' && text.length < 1) return null;
  const amount = typeof held === 'number' ? held : Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

export function writeRuleNumber(answer: number | null): number {
  if (answer === null || !Number.isFinite(answer) || answer < 0) return -1;
  return answer;
}

/** Reads a word the room writes, where nothing written stands for no answer. */
export function readRuleText(held: unknown): string | null {
  const text = `${held ?? ''}`;
  return text.length > 0 ? text : null;
}

export function writeRuleText(answer: string | null): string {
  return answer === null ? ROOM_RULE_UNANSWERED : answer;
}

/**
 * What the rules come to, asking the room first and the table it leaves out second.
 *
 * A room that has never been asked answers nothing at all, so a table carries on ruling
 * itself as it always has; the first answer the room gives is the first rule it takes over.
 */
export function resolveRoomRules(
  room: Partial<RoomRuleAnswers> | null,
  table: Partial<RoomRuleValues> | null
): RoomRules {
  const settled = <Rule extends keyof RoomRuleValues>(rule: Rule): RoomRuleValues[Rule] => {
    const answered = room?.[rule];
    if (answered !== null && answered !== undefined) return answered;
    const ruled = table?.[rule];
    if (ruled !== null && ruled !== undefined) return ruled;
    return ROOM_RULE_DEFAULTS[rule];
  };

  return {
    moveRangeEnabled: settled('moveRangeEnabled'),
    moveRangeElementNames: settled('moveRangeElementNames'),
    moveDiagonally: settled('moveDiagonally'),
    piecesShareCells: settled('piecesShareCells'),
    moveRangeAlways: settled('moveRangeAlways'),
    zocAlways: settled('zocAlways'),
    cellDistance: settled('cellDistance'),
    cellDistanceUnit: settled('cellDistanceUnit'),
    zocMode: asZocMode(settled('zocMode')),
    zocRange: settled('zocRange'),
    zocExtraCost: settled('zocExtraCost'),
    facingMark: settled('facingMark'),
  };
}
