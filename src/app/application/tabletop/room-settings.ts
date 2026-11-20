import { wholeCellsOrNone } from '@axe/core/util/whole-cells';
import { asDiceStage } from '@axe/domain/dice/dice-3d/dice-stage';
import { Config } from '@axe/domain/peer/config';
import type { ConfigRuleAnswers } from '@axe/domain/peer/config-rule-answers';
import { asDiagonalMove, DEFAULT_DIAGONAL_MOVE } from '@axe/domain/tabletop/move/diagonal-move';
import { asBreakOutMode } from '@axe/domain/tabletop/move/engagement';
import { DEFAULT_CELL_DISTANCE, DEFAULT_CELL_DISTANCE_UNIT } from '@axe/domain/tabletop/move/move-cells';
import { type MoveUnit, parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { asZocMode } from '@axe/domain/tabletop/move/zone-of-control';
import { DEFAULT_FALL_MIN_M } from '@axe/domain/tabletop/ride/ride-rules';
import type { RoomRules } from '@axe/domain/tabletop/room-rules';
import { asTableFacingMark, type TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import type { ZoneRules } from '@axe/domain/tabletop/zone/zone-rules';

/** Who may change a room setting: whoever may edit the table, or only the master, for what every screen shows. */
export type RoomSettingWriter = 'table' | 'shared';

/**
 * Where a room setting is read from: as it is in force (the room's answer, else the table's, else the
 * default), or as the room's config holds it, where nothing stands in for a value it has not written.
 */
export type RoomSettingSource = 'rule' | 'config';

/** What a room setting is read from and written to, each read afresh when it is asked for. */
export interface RoomSettingSources {
  /** The room's config. */
  config(): Config;
  /** The rules in force on the table in view. */
  rules(): RoomRules;
  /** The engagement-zone rules in force. */
  zone(): ZoneRules;
}

/**
 * One setting of the room, as the room settings and the AI alike read and write it: the config field it
 * is kept in, who may write it, where it is read from, and how a value is turned into what is kept.
 */
export interface RoomSetting<K extends keyof Config, T> {
  readonly key: K;
  readonly writer: RoomSettingWriter;
  readonly source: RoomSettingSource;
  /** The setting as it is shown. */
  read(from: RoomSettingSources): T;
  /** Writes a value onto the room's config, turned into what the field keeps. Asks nobody's leave. */
  write(to: RoomSettingSources, value: T): void;
}

/** The rules of play the room answers for itself, which are read as they are in force. */
type RuleKey = keyof RoomRules & keyof Config;

/** The rules the room answers with a word, a number, or a yes or no. */
type AnswerOf<T> = { [Rule in keyof ConfigRuleAnswers]: ConfigRuleAnswers[Rule] extends T | null ? Rule : never };
type TextRule = AnswerOf<string>[keyof ConfigRuleAnswers];
type NumberRule = AnswerOf<number>[keyof ConfigRuleAnswers];
type FlagRule = AnswerOf<boolean>[keyof ConfigRuleAnswers];

/**
 * A rule of play read as the rules in force have it, through `shown` where it is shown otherwise, and
 * written as the room's own answer, through `written` on the way.
 */
function rule<K extends RuleKey, T = RoomRules[K]>(
  key: K,
  options: {
    readonly written?: (value: NoInfer<T>) => Config[K];
    readonly shown?: (held: RoomRules[K]) => T;
    readonly writer?: RoomSettingWriter;
  } = {}
): RoomSetting<K, NoInfer<T>> {
  const shown = options.shown ?? ((held: RoomRules[K]) => held as unknown as T);
  const written = options.written ?? ((value: T) => value as unknown as Config[K]);
  return {
    key,
    writer: options.writer ?? 'table',
    source: 'rule',
    read: (from) => shown(from.rules()[key]),
    write: (to, value) => {
      to.config()[key] = written(value);
    },
  };
}

/** A setting the config holds, read as it holds it and written through `written` on the way. */
function held<K extends keyof Config>(
  key: K,
  writer: RoomSettingWriter = 'table',
  written: (value: Config[K]) => Config[K] = (value) => value
): RoomSetting<K, Config[K]> {
  return {
    key,
    writer,
    source: 'config',
    read: (from) => from.config()[key],
    write: (to, value) => {
      to.config()[key] = written(value);
    },
  };
}

/** A yes the room answers with; a no takes the answer back. */
function answerYes<K extends FlagRule>(key: K): RoomSetting<K, boolean> {
  return {
    key,
    writer: 'table',
    source: 'config',
    read: (from) => from.config()[key] === true,
    write: (to, value) => {
      (to.config() as ConfigRuleAnswers)[key as FlagRule] = value ? true : null;
    },
  };
}

/** A word the room answers with, empty while it has written none; an empty box takes the answer back. */
function answerText<K extends TextRule>(key: K): RoomSetting<K, string> {
  return {
    key,
    writer: 'table',
    source: 'config',
    read: (from) => from.config()[key] ?? '',
    write: (to, value) => {
      const trimmed = value.trim();
      (to.config() as ConfigRuleAnswers)[key as TextRule] = trimmed.length > 0 ? trimmed : null;
    },
  };
}

/**
 * A number the room answers with, shown as it is in force; a number the rule does not `take`, or none
 * at all, takes the answer back.
 */
function answerNumber<K extends NumberRule>(
  key: K,
  shown: (from: RoomSettingSources) => number,
  takes: (value: number) => boolean
): RoomSetting<K, number> {
  return {
    key,
    writer: 'table',
    source: 'rule',
    read: shown,
    write: (to, value) => {
      (to.config() as ConfigRuleAnswers)[key as NumberRule] = Number.isFinite(value) && takes(value) ? value : null;
    },
  };
}

/**
 * The unit a cell's distance is counted in. A table turned over to cells starts again at one cell a
 * cell: a distance written for metres or feet would otherwise go on dividing every sheet without
 * saying so.
 */
function cellDistanceUnit(): RoomSetting<'cellDistanceUnit', MoveUnit> {
  const shown = (from: RoomSettingSources): MoveUnit =>
    parseMoveUnit(from.rules().cellDistanceUnit) ?? DEFAULT_CELL_DISTANCE_UNIT;
  return {
    key: 'cellDistanceUnit',
    writer: 'table',
    source: 'rule',
    read: shown,
    write: (to, value) => {
      if (value === 'cell' && shown(to) !== 'cell') to.config().cellDistance = DEFAULT_CELL_DISTANCE;
      to.config().cellDistanceUnit = value;
    },
  };
}

/** What one cell stands for, in the chosen unit; anything but a positive number is kept as 0. */
function positiveOrNone(value: number): number {
  const distance = Number(value);
  return Number.isFinite(distance) && distance > 0 ? distance : 0;
}

/**
 * Every setting of the room the room settings and the AI read and write, by the config field it is
 * kept in: who may write it, where it is read from, and how a value is kept. This is the one place
 * each of those is said; whatever shows or changes a setting goes through its entry.
 */
export const ROOM_SETTINGS = {
  moveRangeEnabled: rule('moveRangeEnabled'),
  moveRangeAlways: rule('moveRangeAlways'),
  diagonalMove: rule('diagonalMove', { written: (move) => asDiagonalMove(move) ?? DEFAULT_DIAGONAL_MOVE }),
  piecesShareCells: rule('piecesShareCells'),
  samePartyPassage: rule('samePartyPassage'),
  otherPartyPassage: rule('otherPartyPassage'),
  noPartyPassage: rule('noPartyPassage'),
  piecePassageCost: rule('piecePassageCost', { written: wholeCellsOrNone }),
  jumpCells: rule('jumpCells', { written: wholeCellsOrNone }),
  squeezes: rule('squeezes'),
  handTracesWay: rule('handTracesWay'),
  sizeSlipsPast: rule('sizeSlipsPast'),
  moveRangeElementNames: rule('moveRangeElementNames'),
  cellDistance: rule('cellDistance', { written: positiveOrNone }),
  cellDistanceUnit: cellDistanceUnit(),
  moveStrict: held('moveStrict'),
  pathMove: held('pathMove'),
  moveKinds: answerText('moveKinds'),

  zocMode: rule('zocMode', { written: asZocMode }),
  hostilityBy: rule('hostilityBy'),
  zocRange: rule('zocRange', { written: wholeCellsOrNone }),
  zocAlways: rule('zocAlways'),
  zocExtraCost: rule('zocExtraCost', { written: wholeCellsOrNone }),
  zocEngages: rule('zocEngages'),
  breakOutMode: rule('breakOutMode', { written: asBreakOutMode }),
  breakOutCost: rule('breakOutCost', { written: wholeCellsOrNone }),
  engagementCountsSize: rule('engagementCountsSize'),

  zoneEnabled: answerYes('zoneEnabled'),
  zoneStealthUnseen: answerYes('zoneStealthUnseen'),
  zoneSizes: answerText('zoneSizes'),
  zoneCountField: answerText('zoneCountField'),
  zoneSamePointM: answerNumber(
    'zoneSamePointM',
    (from) => from.zone().samePointM,
    (metres) => metres >= 0
  ),
  zoneOutnumber: answerNumber(
    'zoneOutnumber',
    (from) => from.zone().outnumber,
    (times) => times > 0
  ),
  zoneLeaveKind: answerText('zoneLeaveKind'),
  interruptEnabled: held('interruptEnabled'),
  interruptKind: answerText('interruptKind'),
  zoneBlockRadiusM: answerNumber(
    'zoneBlockRadiusM',
    (from) => from.zone().blockRadiusM,
    (metres) => metres >= 0
  ),
  zoneClearName: answerText('zoneClearName'),
  placementDistances: answerText('placementDistances'),
  distanceModifiers: answerText('distanceModifiers'),
  rideSkillField: answerText('rideSkillField'),
  rideRequireField: answerText('rideRequireField'),
  fallMinM: answerNumber(
    'fallMinM',
    (from) => from.config().fallMinM ?? DEFAULT_FALL_MIN_M,
    (metres) => metres >= 0
  ),
  fallDamage: answerText('fallDamage'),
  twoUpBuff: answerText('twoUpBuff'),

  turnOrderMode: held('turnOrderMode'),
  factionPhaseMode: held('factionPhaseMode'),
  factionSkipUnassigned: held('factionSkipUnassigned'),
  factionOrder: held('factionOrder'),
  turnSignalEnabled: held('turnSignalEnabled', 'shared'),
  turnTickEnabled: held('turnTickEnabled', 'shared'),

  defaultDiceBot: held('defaultDiceBot', 'shared'),
  diceStage: held('diceStage', 'shared', asDiceStage),
  speechBubblesEnabled: held('speechBubblesEnabled', 'shared'),
  controllerResources: held('controllerResources', 'shared'),
  systemNotices: held('systemNotices', 'shared'),

  facingMark: rule('facingMark', {
    shown: asTableFacingMark,
    written: (mark: TableFacingMark) => asTableFacingMark(mark),
    writer: 'shared',
  }),
  pieceImageInCell: rule('pieceImageInCell', { writer: 'shared' }),
  resourceSliderByDefault: held('resourceSliderByDefault', 'shared'),
} satisfies { readonly [K in keyof Config]?: RoomSetting<K, unknown> };

/** The config fields the room settings keep in {@link ROOM_SETTINGS}. */
export type RoomSettingKey = keyof typeof ROOM_SETTINGS;

/** A room setting's value, as it is shown and written. */
export type RoomSettingValue<K extends RoomSettingKey> =
  (typeof ROOM_SETTINGS)[K] extends RoomSetting<K, infer T> ? T : never;

/** The entry of a room setting, typed by its value. */
export function roomSettingOf<K extends RoomSettingKey>(key: K): RoomSetting<K, RoomSettingValue<K>> {
  return ROOM_SETTINGS[key] as unknown as RoomSetting<K, RoomSettingValue<K>>;
}
