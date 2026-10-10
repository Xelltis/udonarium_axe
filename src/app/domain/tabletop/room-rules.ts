import { asDiagonalMove, DEFAULT_DIAGONAL_MOVE, DiagonalMove } from '@axe/domain/tabletop/move/diagonal-move';
import {
  asBreakOutMode,
  BreakOutMode,
  DEFAULT_BREAK_OUT_COST,
  DEFAULT_BREAK_OUT_MODE,
} from '@axe/domain/tabletop/move/engagement';
import {
  DEFAULT_CELL_DISTANCE,
  DEFAULT_CELL_DISTANCE_UNIT,
  DEFAULT_MOVE_RANGE_ELEMENT_NAMES,
} from '@axe/domain/tabletop/move/move-cells';
import {
  asPiecePassageMode,
  DEFAULT_PIECE_PASSAGE_COST,
  PiecePassageMode,
} from '@axe/domain/tabletop/move/piece-passage';
import {
  asHostilityBy,
  asZocMode,
  DEFAULT_HOSTILITY_BY,
  DEFAULT_ZOC_EXTRA_COST,
  DEFAULT_ZOC_MODE,
  DEFAULT_ZOC_RANGE,
  HostilityBy,
  ZocMode,
} from '@axe/domain/tabletop/move/zone-of-control';
import { DEFAULT_TABLE_FACING_MARK } from '@axe/domain/tabletop/table-facing-mark';

/** How a piece walks and what an enemy holds against it, as the table plays it. */
export interface RoomRules {
  moveRangeEnabled: boolean;
  moveRangeElementNames: string;
  /** Whether a corner may be cut at all, which is what a table said before it could say how. */
  moveDiagonally: boolean;
  /** How a corner is counted: see {@link DiagonalMove}. */
  diagonalMove: DiagonalMove;
  piecesShareCells: boolean;
  /**
   * What the ground a piece of one's own party stands on does to a piece walking into it.
   *
   * These three are a finer way of asking what piecesShareCells asks, and a room that has never
   * been asked them is answered from it: see {@link PiecePassageMode}.
   */
  samePartyPassage: PiecePassageMode;
  /** The same, for a piece of some other party. */
  otherPartyPassage: PiecePassageMode;
  /** The same, for a piece in no party at all, which is what most pieces are. */
  noPartyPassage: PiecePassageMode;
  /** What crossing somebody costs on top of the one step, where the table charges for it. */
  piecePassageCost: number;
  /**
   * Whether a piece squeezes past somebody far enough from it in size.
   *
   * Ground shut to a piece of one's own size is ground one slips past where the two are two
   * cells or more apart: a rat goes under a giant and a giant steps over a rat. Left off, size
   * says nothing and a body in the way is a body in the way.
   */
  sizeSlipsPast: boolean;
  /**
   * Whether a piece too big for a gap may fold itself through it at a price.
   *
   * A piece three cells across needs three clear cells to stand on, so a two-cell passage is
   * shut to it however much of it would fit. Left on, it may squeeze: it stands there as
   * though it were a size smaller, and every cell it does that in costs a step again. Left
   * off, a gap too small is simply shut, which is what the table has always done.
   */
  squeezes: boolean;
  /**
   * How far one leap carries, in cells. Nought carries as far as the move has left.
   *
   * A jump goes over what a walk goes round, and with nothing said it goes on doing that for
   * the whole of a move: a piece with six cells of movement clears six cells of chasm in one
   * bound. Most games have a jump of its own length, and this is where a table says what it
   * is.
   */
  jumpCells: number;
  /**
   * Whether the ground between where a piece was lifted and where it was set down goes off.
   *
   * A hand leaves no way behind it, so the way is guessed: the shortest walk between the two
   * ends. Left off, only the ground it was set down on answers, which is what a table does
   * while somebody is shifting a dozen monsters into place.
   */
  handTracesWay: boolean;
  moveRangeAlways: boolean;
  zocAlways: boolean;
  cellDistance: number;
  cellDistanceUnit: string;
  zocMode: ZocMode;
  /** How the table tells its two sides apart: see {@link HostilityBy}. */
  hostilityBy: HostilityBy;
  zocRange: number;
  zocExtraCost: number;
  /**
   * Whether pieces standing against one another are held as one fight rather than as pairs.
   *
   * Left off, every enemy holds its own ground and nothing joins up. Turned on, whoever stands
   * beside a piece already fighting is in the same fight, and what it costs to get out of one
   * is weighed side against side rather than enemy by enemy.
   */
  zocEngages: boolean;
  /** What a piece has to do to walk out of a fight: see {@link BreakOutMode}. */
  breakOutMode: BreakOutMode;
  /** What leaving costs where the table charges the same for every leaving. */
  breakOutCost: number;
  /** Whether a piece weighs what it covers in that reckoning, rather than one apiece. */
  engagementCountsSize: boolean;
  facingMark: string;
  /**
   * Whether a piece is drawn no taller than the cell it stands on.
   *
   * A tall picture towers over its cell, which over a table laid flat smears it across
   * whatever is behind. The room answers for it so that everyone reads the same board.
   */
  pieceImageInCell: boolean;
}

/** The same rules in the looser terms a table holds them and an attribute carries them. */
export type RoomRuleValues = Omit<
  RoomRules,
  | 'zocMode'
  | 'hostilityBy'
  | 'diagonalMove'
  | 'breakOutMode'
  | 'samePartyPassage'
  | 'otherPartyPassage'
  | 'noPartyPassage'
> & {
  zocMode: string;
  hostilityBy: string;
  diagonalMove: string;
  breakOutMode: string;
  samePartyPassage: string;
  otherPartyPassage: string;
  noPartyPassage: string;
};

/** The same questions as the room hears them, where null is one it has not answered. */
export type RoomRuleAnswers = { [Rule in keyof RoomRuleValues]: RoomRuleValues[Rule] | null };

export const ROOM_RULE_DEFAULTS: RoomRules = {
  moveRangeEnabled: true,
  moveRangeElementNames: DEFAULT_MOVE_RANGE_ELEMENT_NAMES,
  moveDiagonally: true,
  diagonalMove: DEFAULT_DIAGONAL_MOVE,
  piecesShareCells: true,
  samePartyPassage: 'share',
  otherPartyPassage: 'share',
  noPartyPassage: 'share',
  piecePassageCost: DEFAULT_PIECE_PASSAGE_COST,
  sizeSlipsPast: false,
  squeezes: false,
  jumpCells: 0,
  handTracesWay: false,
  moveRangeAlways: false,
  zocAlways: false,
  cellDistance: DEFAULT_CELL_DISTANCE,
  cellDistanceUnit: DEFAULT_CELL_DISTANCE_UNIT,
  zocMode: DEFAULT_ZOC_MODE,
  hostilityBy: DEFAULT_HOSTILITY_BY,
  zocRange: DEFAULT_ZOC_RANGE,
  zocExtraCost: DEFAULT_ZOC_EXTRA_COST,
  zocEngages: false,
  breakOutMode: DEFAULT_BREAK_OUT_MODE,
  breakOutCost: DEFAULT_BREAK_OUT_COST,
  engagementCountsSize: true,
  facingMark: DEFAULT_TABLE_FACING_MARK,
  pieceImageInCell: false,
};

/** The rules that are set together, and so are handed back to the table together. */
export const ROOM_RULE_GROUPS = {
  moveRange: [
    'moveRangeEnabled',
    'moveRangeAlways',
    'moveDiagonally',
    'diagonalMove',
    'piecesShareCells',
    'samePartyPassage',
    'otherPartyPassage',
    'noPartyPassage',
    'piecePassageCost',
    'sizeSlipsPast',
    'squeezes',
    'jumpCells',
    'handTracesWay',
    'moveRangeElementNames',
    'cellDistance',
    'cellDistanceUnit',
  ],
  zoc: [
    'zocMode',
    'hostilityBy',
    'zocRange',
    'zocAlways',
    'zocExtraCost',
    'zocEngages',
    'breakOutMode',
    'breakOutCost',
    'engagementCountsSize',
  ],
  facing: ['facingMark'],
  flatPieces: ['pieceImageInCell'],
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

/** Writes a yes or no the way readRuleFlag reads it: `1`, `0`, or empty for no answer. */
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

/**
 * Writes a number the way readRuleNumber reads it, with -1 for no answer or for anything that is
 * not a finite number of zero or more.
 */
export function writeRuleNumber(answer: number | null): number {
  if (answer === null || !Number.isFinite(answer) || answer < 0) return -1;
  return answer;
}

/** Reads a word the room writes, where nothing written stands for no answer. */
export function readRuleText(held: unknown): string | null {
  const text = `${held ?? ''}`;
  return text.length > 0 ? text : null;
}

/** Writes a word the way readRuleText reads it, with empty for no answer. */
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

  const cutsCorners = settled('moveDiagonally');
  const sharesCells = settled('piecesShareCells');
  // Whether two pieces may share a cell is an older, coarser question than what one does with
  // the ground the other holds, so the older answer stands in for the newer ones rather than a
  // default doing. A table that only ever said "pieces share cells" is saying a piece walks
  // onto another and stops there, which is what it did when that was all a table could say.
  const crossing = (rule: 'samePartyPassage' | 'otherPartyPassage' | 'noPartyPassage'): PiecePassageMode =>
    asPiecePassageMode(room?.[rule]) ?? asPiecePassageMode(table?.[rule]) ?? (sharesCells ? 'share' : 'block');

  return {
    moveRangeEnabled: settled('moveRangeEnabled'),
    moveRangeElementNames: settled('moveRangeElementNames'),
    moveDiagonally: cutsCorners,
    // How a corner is counted is a newer question than whether it may be cut at all, so the
    // older answer stands in for it rather than the default doing: a room or a table that only
    // ever said "corners are allowed" is saying a corner costs what a side costs, which is what
    // it did when that was all a table could say.
    diagonalMove:
      asDiagonalMove(room?.diagonalMove) ??
      asDiagonalMove(table?.diagonalMove) ??
      (cutsCorners ? DEFAULT_DIAGONAL_MOVE : 'none'),
    piecesShareCells: sharesCells,
    samePartyPassage: crossing('samePartyPassage'),
    otherPartyPassage: crossing('otherPartyPassage'),
    noPartyPassage: crossing('noPartyPassage'),
    piecePassageCost: settled('piecePassageCost'),
    sizeSlipsPast: settled('sizeSlipsPast'),
    squeezes: settled('squeezes'),
    jumpCells: settled('jumpCells'),
    handTracesWay: settled('handTracesWay'),
    moveRangeAlways: settled('moveRangeAlways'),
    zocAlways: settled('zocAlways'),
    cellDistance: settled('cellDistance'),
    cellDistanceUnit: settled('cellDistanceUnit'),
    zocMode: asZocMode(settled('zocMode')),
    hostilityBy: asHostilityBy(settled('hostilityBy')),
    zocRange: settled('zocRange'),
    zocExtraCost: settled('zocExtraCost'),
    zocEngages: settled('zocEngages'),
    breakOutMode: asBreakOutMode(settled('breakOutMode')),
    breakOutCost: settled('breakOutCost'),
    engagementCountsSize: settled('engagementCountsSize'),
    facingMark: settled('facingMark'),
    pieceImageInCell: settled('pieceImageInCell'),
  };
}
