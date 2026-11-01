import { asBattleSide, BattleSide } from '@axe/domain/battle/battle-lineup';
import { asBattleTheme, BattleTheme } from '@axe/domain/battle/battle-settings';
import { fixedGaugeColor } from '@axe/domain/character/piece-gauge';

/**
 * A resource of one fighter as it stood before the exchange and after it.
 *
 * Both readings travel with the scene, so every screen draws the same fall of the bar however
 * late the change itself reaches it.
 */
export interface BattleGauge {
  name: string;
  before: number;
  after: number;
  max: number;
  /** A resource that grows worse as it rises, such as madness. */
  inverted: boolean;
  /** The colour set for its bar, or empty (or missing, from an older version) for that of how full it stands. */
  color?: string;
}

/** One piece on the stage, written down as it was when the exchange was played. */
export interface BattleFighter {
  identifier: string;
  name: string;
  /** The picture it stands as, by image identifier. Empty stands it as a shadow. */
  image: string;
  gauges: BattleGauge[];
  /** Whether the exchange brought it down. */
  defeated: boolean;
  /**
   * Which way its picture faces, so the stage turns it to face across; absent or none stands it as
   * drawn, as an older version sends it.
   */
  facing?: BattleSide | null;
}

/**
 * One exchange played out on the stage: who strikes, who is struck, with what, and how the
 * numbers moved.
 */
export interface BattleScene {
  /** Tells one playing from another, so the same scene heard twice plays once. */
  key: string;
  /** The side the one striking stands on; those struck stand on the other. */
  attackerSide: BattleSide;
  attacker: BattleFighter;
  defenders: BattleFighter[];
  /** The effect the blow is drawn with, by preset identifier. Empty strikes with a plain flash. */
  effect: string;
  /** The effect a fighter brought down goes with, by preset identifier. Empty only fades it. */
  defeatEffect: string;
  /** The picture behind the stage, by image identifier. Empty draws the stage named. */
  background: string;
  /** Which of the tool's own stages is drawn where there is no picture. */
  theme: BattleTheme;
  /** Whether the numbers are kept back, as they are for a line said in secret. */
  secret: boolean;
  seed: number;
}

/** As many struck at once as the stage can stand side by side. */
export const MAX_BATTLE_DEFENDERS = 4;
/** As many resources as one fighter carries onto the stage. */
export const MAX_BATTLE_GAUGES = 8;
const MAX_TEXT_LENGTH = 200;

/** How a resource of a fighter moved in the exchange. */
export interface BattleGaugeChange {
  name: string;
  delta: number;
  /** Whether it went the bad way: down, or up for a resource that grows worse as it rises. */
  hurt: boolean;
}

/** The resources of a fighter that moved, in the order it carries them. */
export function battleGaugeChanges(fighter: BattleFighter): BattleGaugeChange[] {
  const changes: BattleGaugeChange[] = [];
  for (const gauge of fighter.gauges) {
    const delta = gauge.after - gauge.before;
    if (delta === 0) continue;
    changes.push({ name: gauge.name, delta, hurt: gauge.inverted ? delta > 0 : delta < 0 });
  }
  return changes;
}

/** How a change reads over the fighter: a minus for a fall and a plus for a rise, without trailing zeroes. */
export function battleChangeLabel(delta: number): string {
  const trimmed = Number(delta.toFixed(2)).toString();
  return delta > 0 ? `+${trimmed}` : trimmed;
}

/**
 * Whether a resource moving from one reading to another brings its holder down: a resource that
 * was above nothing falls to nothing or below, or one that grows worse as it rises reaches its
 * maximum. A maximum of nothing never brings anybody down that way.
 */
export function isBattleDefeat(before: number, after: number, max: number, inverted: boolean): boolean {
  if (inverted) return max > 0 && before < max && after >= max;
  return before > 0 && after <= 0;
}

/**
 * Reads a scene that came in over the network into one that is safe to play.
 *
 * Null without somebody striking or somebody struck. Past four struck and eight resources each
 * are dropped, a number that is not a number reads as 0, and a side that is not one stands the
 * one striking on the left.
 */
export function normalizeBattleScene(raw: unknown): BattleScene | null {
  const source = asRecord(raw);
  if (!source) return null;

  const attacker = normalizeFighter(source['attacker']);
  if (!attacker) return null;

  const rawDefenders = Array.isArray(source['defenders']) ? source['defenders'] : [];
  const defenders: BattleFighter[] = [];
  for (const rawDefender of rawDefenders) {
    if (defenders.length >= MAX_BATTLE_DEFENDERS) break;
    const defender = normalizeFighter(rawDefender);
    if (defender) defenders.push(defender);
  }
  if (defenders.length < 1) return null;

  return {
    key: text(source['key']),
    attackerSide: asBattleSide(source['attackerSide']) ?? 'left',
    attacker,
    defenders,
    effect: text(source['effect']),
    defeatEffect: text(source['defeatEffect']),
    background: text(source['background']),
    theme: asBattleTheme(source['theme']),
    secret: source['secret'] === true,
    seed: number(source['seed']),
  };
}

function normalizeFighter(raw: unknown): BattleFighter | null {
  const source = asRecord(raw);
  if (!source) return null;
  const identifier = text(source['identifier']);
  if (identifier.length < 1) return null;

  const rawGauges = Array.isArray(source['gauges']) ? source['gauges'] : [];
  const gauges: BattleGauge[] = [];
  for (const rawGauge of rawGauges.slice(0, MAX_BATTLE_GAUGES)) {
    const gauge = normalizeGauge(rawGauge);
    if (gauge) gauges.push(gauge);
  }

  return {
    identifier,
    name: text(source['name']),
    image: text(source['image']),
    gauges,
    defeated: source['defeated'] === true,
    facing: asBattleSide(source['facing']),
  };
}

function normalizeGauge(raw: unknown): BattleGauge | null {
  const source = asRecord(raw);
  if (!source) return null;
  return {
    name: text(source['name']),
    before: number(source['before']),
    after: number(source['after']),
    max: number(source['max']),
    inverted: source['inverted'] === true,
    color: fixedGaugeColor(source['color']),
  };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : '';
}

function number(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
