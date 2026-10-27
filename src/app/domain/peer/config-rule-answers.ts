import { ObjectNode } from '@axe/core/sync/object-node';
import {
  readRuleFlag,
  readRuleNumber,
  readRuleText,
  writeRuleFlag,
  writeRuleNumber,
  writeRuleText,
} from '@axe/domain/tabletop/room-rules';
import { ZoneRuleAnswers } from '@axe/domain/tabletop/zone/zone-rules';

/** How a rule's answer is written into its attribute: a yes or no, a number, or a word. */
type AnswerKind = 'flag' | 'number' | 'text';

/** A rule of play the room answers for itself, and the synced attribute its answer is kept in. */
interface RuleAnswerField<K extends AnswerKind> {
  readonly kind: K;
  /** The attribute's name, which saved rooms and older peers know the answer by. Never renamed. */
  readonly attribute: string;
}

const flag = (attribute: string): RuleAnswerField<'flag'> => ({ kind: 'flag', attribute });
const number = (attribute: string): RuleAnswerField<'number'> => ({ kind: 'number', attribute });
const text = (attribute: string): RuleAnswerField<'text'> => ({ kind: 'text', attribute });

/**
 * The rules of play the room answers for itself, each read and written through an attribute of the
 * config that the room syncs and saves: a yes or no as `1` or `0`, a number with anything below zero
 * for no answer, and a word with nothing written for none. Each reads null until the room answers
 * it, and an unanswered rule is taken from the table in play.
 */
export const CONFIG_RULE_ANSWERS = {
  /** Whether pieces show how far they can move, or null where the room leaves it to the table in play. */
  moveRangeEnabled: flag('_moveRangeEnabled'),
  /** The comma-separated names of the sheet fields read as a piece's movement, or null to leave it to the table. */
  moveRangeElementNames: text('_moveRangeElementNames'),
  /** Whether a piece may end its move on a cell another piece stands on, or null to leave it to the table. */
  piecesShareCells: flag('_piecesShareCells'),
  /** What a piece does with the ground its own party holds, or null to leave it to the table. */
  samePartyPassage: text('_samePartyPassage'),
  /** The same, for the ground some other party holds. */
  otherPartyPassage: text('_otherPartyPassage'),
  /** The same, for the ground a piece in no party holds. */
  noPartyPassage: text('_noPartyPassage'),
  /** What crossing somebody costs where the table charges for it, or null to leave it to the table. */
  piecePassageCost: number('_piecePassageCost'),
  /** Whether a piece squeezes past somebody far enough from it in size, or null to leave it to the table. */
  sizeSlipsPast: flag('_sizeSlipsPast'),
  /** Whether a piece folds itself through a gap too small for it, or null for the table. */
  squeezes: flag('_squeezes'),
  /** How far one leap carries in cells, or null for the table. */
  jumpCells: number('_jumpCells'),
  /** Whether ground between a piece's two ends goes off when a hand moves it, or null for the table. */
  handTracesWay: flag('_handTracesWay'),
  /** Whether the selected piece's reach stays shown without picking it up, or null to leave it to the table. */
  moveRangeAlways: flag('_moveRangeAlways'),
  /** Whether the ground enemies hold stays shown for the selected piece, or null to leave it to the table. */
  zocAlways: flag('_zocAlways'),
  /** How much distance one cell stands for, in `cellDistanceUnit`, or null to leave it to the table. */
  cellDistance: number('_cellDistance'),
  /** The unit `cellDistance` is measured in, cells or a length, or null to leave it to the table. */
  cellDistanceUnit: text('_cellDistanceUnit'),
  /** What the ground around an enemy does to a piece walking into it (none, stop, block or cost), or null. */
  zocMode: text('_zocMode'),
  /** How the room tells its two sides apart, or null to leave it to the table. */
  hostilityBy: text('_hostilityBy'),
  /** How many steps out from an enemy its held ground reaches, or null to leave it to the table. */
  zocRange: number('_zocRange'),
  /** The extra steps charged for entering held ground when the mode is cost, or null to leave it to the table. */
  zocExtraCost: number('_zocExtraCost'),
  /** Whether pieces standing against one another form one fight rather than pairs, or null to leave it to the table. */
  zocEngages: flag('_zocEngages'),
  /** What a piece must do to walk out of a fight (weighed, cost, block or free), or null to leave it to the table. */
  breakOutMode: text('_breakOutMode'),
  /** The steps leaving a fight costs when every leaving costs the same, or null to leave it to the table. */
  breakOutCost: number('_breakOutCost'),
  /** Whether a piece weighs as much as the cells it covers when sides are weighed, or null to leave it to the table. */
  engagementCountsSize: flag('_engagementCountsSize'),
  /** How a piece shows which way it faces (none, turn or arrow), or null to leave it to the table. */
  facingMark: text('_facingMark'),
  /** Whether a piece is drawn no taller than the cell it stands on, or null to leave it to the table. */
  pieceImageInCell: flag('_pieceImageInCell'),

  /** Whether the room plays engagement zones, or null where it has not said. */
  zoneEnabled: flag('_zoneEnabled'),
  /** The size table zones grow by, as `count:radius:side` rows, or null for the default. */
  zoneSizes: text('_zoneSizes'),
  /** The sheet field a piece gives its count in, or null to count each piece once. */
  zoneCountField: text('_zoneCountField'),
  /** How close two pieces stand, in metres, to be at the same point, or null for the default. */
  zoneSamePointM: number('_zoneSamePoint'),
  /** How many times the other side one side has to be to pass a zone unheld, or null for the default. */
  zoneOutnumber: number('_zoneOutnumber'),
  /** The kind of move a piece may leave an overflowing zone by at once, or null for any kind. */
  zoneLeaveKind: text('_zoneLeaveKind'),
  /** How close to a line of fire, in metres, a piece stands to be in its way, or null for the default. */
  zoneBlockRadiusM: number('_zoneBlockRadius'),
  /** The sheet field or buff by which a shooter fires past what stands in the way, or null for none. */
  zoneClearName: text('_zoneClearName'),
  /** Whether a piece in stealth counts as one nobody can see, or null for the default, which it does not. */
  zoneStealthUnseen: flag('_zoneStealthUnseen'),

  /** The kinds of move the room plays, as `name:factor:cap` rows, or null for the plain kind alone. */
  moveKinds: text('_moveKinds'),
  /** The kind of move a piece steps into a move by, which sets how far it reaches; null for the room's first. */
  interruptKind: text('_interruptKind'),
  /** How far apart two sides start, as `name:metres` rows, or null where the room has written none. */
  placementDistances: text('_placementDistances'),
  /** What a distance between the sides does, as `metres:note` rows, or null where the room has written none. */
  distanceModifiers: text('_distanceModifiers'),

  /**
   * The sheet field holding the skill of steering a mount, or null where the room names none, in
   * which case everybody riding in front steers.
   */
  rideSkillField: text('_rideSkillField'),
  /** The field on a mount's sheet saying what it asks of that skill, or null where the room names none. */
  rideRequireField: text('_rideRequireField'),
  /** The shortest fall from a mount, in metres, or null for the default. */
  fallMinM: number('_fallMinM'),
  /**
   * What a fall from a mount does, as a line rolled for the piece that fell with `{m}` standing for
   * how far it fell, or null where the room has written none and a fall only says how far.
   */
  fallDamage: text('_fallDamage'),
  /**
   * The buff given the one riding a mount in front and the one behind while both are on it, written
   * as a chat buff command, or null where the room gives none.
   */
  twoUpBuff: text('_twoUpBuff'),
};

type AnswerOf<F> = F extends RuleAnswerField<'flag'> ? boolean : F extends RuleAnswerField<'number'> ? number : string;

/** The room's answer to every rule in {@link CONFIG_RULE_ANSWERS}, null where it has not answered. */
export type ConfigRuleAnswers = {
  [Rule in keyof typeof CONFIG_RULE_ANSWERS]: AnswerOf<(typeof CONFIG_RULE_ANSWERS)[Rule]> | null;
};

/** Where each engagement-zone answer is kept among the room's rule answers. */
const ZONE_ANSWER_RULES = {
  enabled: 'zoneEnabled',
  sizes: 'zoneSizes',
  countField: 'zoneCountField',
  samePointM: 'zoneSamePointM',
  outnumber: 'zoneOutnumber',
  leaveKind: 'zoneLeaveKind',
  blockRadiusM: 'zoneBlockRadiusM',
  clearName: 'zoneClearName',
  stealthUnseen: 'zoneStealthUnseen',
} as const satisfies Record<keyof ZoneRuleAnswers, keyof ConfigRuleAnswers>;

/** Every engagement-zone rule the room has been asked about, read from its rule answers. */
export function zoneRuleAnswersOf(answers: ConfigRuleAnswers): ZoneRuleAnswers {
  const zone: Record<string, unknown> = {};
  for (const [answer, rule] of Object.entries(ZONE_ANSWER_RULES)) zone[answer] = answers[rule];
  return zone as unknown as ZoneRuleAnswers;
}

const READ: Record<AnswerKind, (held: unknown) => unknown> = {
  flag: readRuleFlag,
  number: readRuleNumber,
  text: readRuleText,
};

const WRITE: Record<AnswerKind, (answer: never) => unknown> = {
  flag: writeRuleFlag,
  number: writeRuleNumber,
  text: writeRuleText,
};

/**
 * An object node with a property for every rule in {@link CONFIG_RULE_ANSWERS}, reading and writing
 * the rule's attribute. The subclass declares the attributes themselves, with their defaults, so
 * that what a room saves stays written out where it is read.
 */
export function withRuleAnswers(): new (identifier?: string) => ObjectNode & ConfigRuleAnswers {
  class RuleAnswers extends ObjectNode {}
  for (const [rule, field] of Object.entries(CONFIG_RULE_ANSWERS)) {
    Object.defineProperty(RuleAnswers.prototype, rule, {
      get(this: Record<string, unknown>) {
        return READ[field.kind](this[field.attribute]);
      },
      set(this: Record<string, unknown>, answer: never) {
        this[field.attribute] = WRITE[field.kind](answer);
      },
      configurable: true,
    });
  }
  return RuleAnswers as unknown as new (identifier?: string) => ObjectNode & ConfigRuleAnswers;
}
