/**
 * Builds the summary of the day from one recording.
 *
 * It counts what the recording kept, and what is missing is left uncounted rather than quietly filled in.
 * In particular it **never says who damaged whom**: the actor is whoever changed the value
 * rather than whoever attacked, and the game master lowering an enemy's health is the actor.
 * Only what was taken is counted, and nobody is named as having dealt it.
 *
 * It returns the keys of the headings and the numbers rather than any wording, which the caller decides.
 */

import { type DiceRollDetail, parseDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import {
  canViewReplayEvent,
  findActorAt,
  findTargetAt,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
  type ReplayViewer,
} from '@axe/domain/replay/replay-event';
import { isSystemReplayChat } from '@axe/domain/replay/replay-event-category';

export interface ReplayDigestNumbers {
  readonly elapsedMs: number;
  readonly messages: number;
  readonly diceRolls: number;
  readonly effects: number;
  readonly rounds: number;
  readonly speakers: number;
}

export interface ReplayDigestSpeaker {
  readonly userId: string;
  readonly name: string;
  readonly messages: number;
  readonly diceRolls: number;
}

/**
 * How the dice fell for each person, counting only the rolls the recording kept.
 *
 * The average, the highest and the lowest are measured by **the total of one throw**. A
 * percentile roll is kept as two faces, and counted face by face it averages the tens with the units.
 * A change of system mid-session changes the scale too, so only the system rolled most is measured.
 */
export interface ReplayDigestFortune {
  readonly userId: string;
  readonly name: string;
  /** How many throws could be read. */
  readonly rolls: number;
  /** The system the averages are taken over: where several were rolled, the one rolled most. */
  readonly system: string;
  /** How many throws that system had, which is what the average, the highest and the lowest cover. */
  readonly counted: number;
  readonly average: number;
  readonly best: number;
  readonly worst: number;
  readonly criticals: number;
  readonly fumbles: number;
  readonly successes: number;
  readonly failures: number;
}

/** What each piece took. Nothing says who dealt it. */
export interface ReplayDigestLedgerRow {
  readonly targetId: string;
  readonly name: string;
  readonly damage: number;
  readonly heal: number;
  readonly biggestHit: number;
  readonly biggestHitLabel: string;
}

export interface ReplayDigestAward {
  readonly key: string;
  readonly name: string;
  readonly value: number;
}

export interface ReplayDigest {
  readonly roomName: string;
  readonly startedAt: number;
  readonly numbers: ReplayDigestNumbers;
  readonly speakers: readonly ReplayDigestSpeaker[];
  readonly fortunes: readonly ReplayDigestFortune[];
  readonly ledger: readonly ReplayDigestLedgerRow[];
  readonly awards: readonly ReplayDigestAward[];
  /** A recording that kept no rolls at all, which is how the fortune says it can show nothing. */
  readonly hasDiceDetail: boolean;
  /** One that kept no changes, which is how the ledger says the same. */
  readonly hasLedger: boolean;
}

export const EMPTY_REPLAY_DIGEST: ReplayDigest = {
  roomName: '',
  startedAt: 0,
  numbers: { elapsedMs: 0, messages: 0, diceRolls: 0, effects: 0, rounds: 0, speakers: 0 },
  speakers: [],
  fortunes: [],
  ledger: [],
  awards: [],
  hasDiceDetail: false,
  hasLedger: false,
};

/** The least it takes to earn a title, so one throw does not crown anybody unluckiest. */
const MIN_ROLLS_FOR_AWARD = 3;

interface ChangeEntry {
  kind: string;
  delta: number;
  name: string;
}

/**
 * The summary of a session as one viewer may see it: how long it ran, what was said and rolled,
 * how the dice fell, what each piece took, and the titles earned.
 *
 * Only events the viewer is allowed to see are counted. With none, the digest is empty apart
 * from the room name and start time.
 */
export function buildReplayDigest(
  events: readonly ReplayEvent[],
  manifest: Pick<ReplayManifest, 'roomName' | 'startedAt' | 'endedAt' | 'actors' | 'targets'>,
  viewer: ReplayViewer
): ReplayDigest {
  const visible = events.filter((event) => canViewReplayEvent(event, viewer));
  if (visible.length < 1) return { ...EMPTY_REPLAY_DIGEST, roomName: manifest.roomName, startedAt: manifest.startedAt };

  const speakers = new Map<string, { name: string; messages: number; diceRolls: number }>();
  const fortunes = new Map<string, MutableFortune>();
  const ledger = new Map<string, MutableLedgerRow>();
  let messages = 0;
  let diceRolls = 0;
  let effects = 0;
  let rounds = 0;
  let hasDiceDetail = false;
  let hasLedger = false;

  for (const event of visible) {
    switch (event.kind) {
      case ReplayEventKind.ChatMessage:
        if (isSystemReplayChat(event)) break;
        messages++;
        countSpeech(speakers, event, manifest, 'messages');
        break;
      case ReplayEventKind.ChatDice: {
        diceRolls++;
        countSpeech(speakers, event, manifest, 'diceRolls');
        const detail = parseDiceRollDetail(asString(event.detail['dicebot']));
        if (detail && collectFortune(fortunes, event, manifest, detail)) hasDiceDetail = true;
        break;
      }
      case ReplayEventKind.EffectCast:
        effects++;
        break;
      case ReplayEventKind.TurnChange: {
        const round = Number(event.detail['round'] ?? 0);
        if (Number.isFinite(round)) rounds = Math.max(rounds, round);
        break;
      }
      case ReplayEventKind.ObjectValue: {
        // A change can be kept two ways, and only the side that can be counted together is read.
        const changes = changesOf(event.detail['changes']);
        if (changes.length < 1) break;
        if (collectLedger(ledger, event, manifest, changes)) hasLedger = true;
        break;
      }
      default:
        break;
    }
  }

  const speakerRows = [...speakers.entries()]
    .map(([userId, row]) => ({ userId, ...row }))
    .sort((a, b) => b.messages - a.messages || b.diceRolls - a.diceRolls || a.name.localeCompare(b.name));
  const fortuneRows = [...fortunes.values()].map(sealFortune).sort((a, b) => b.rolls - a.rolls);
  const ledgerRows = [...ledger.values()].map(sealLedgerRow).sort((a, b) => b.damage - a.damage || b.heal - a.heal);

  return {
    roomName: manifest.roomName,
    startedAt: manifest.startedAt,
    numbers: {
      // The length of a session is the same for everybody; time holding only unseen events is still part of it.
      elapsedMs: elapsedOf(manifest, visible),
      messages,
      diceRolls,
      effects,
      rounds,
      speakers: speakerRows.filter((row) => row.messages > 0).length,
    },
    speakers: speakerRows,
    fortunes: fortuneRows,
    ledger: ledgerRows,
    awards: buildAwards(speakerRows, fortuneRows, ledgerRows),
    hasDiceDetail,
    hasLedger,
  };
}

interface SystemRolls {
  count: number;
  total: number;
  best: number;
  worst: number;
}

interface MutableFortune {
  userId: string;
  name: string;
  rolls: number;
  bySystem: Map<string, SystemRolls>;
  criticals: number;
  fumbles: number;
  successes: number;
  failures: number;
}

interface MutableLedgerRow {
  targetId: string;
  name: string;
  damage: number;
  heal: number;
  biggestHit: number;
  biggestHitLabel: string;
}

function countSpeech(
  speakers: Map<string, { name: string; messages: number; diceRolls: number }>,
  event: ReplayEvent,
  manifest: Pick<ReplayManifest, 'actors'>,
  key: 'messages' | 'diceRolls'
): void {
  const userId = event.actorId;
  if (userId.length < 1) return;
  const row = speakers.get(userId) ?? { name: actorNameOf(manifest, event), messages: 0, diceRolls: 0 };
  row[key]++;
  if (row.name.length < 1) row.name = actorNameOf(manifest, event);
  speakers.set(userId, row);
}

function collectFortune(
  fortunes: Map<string, MutableFortune>,
  event: ReplayEvent,
  manifest: Pick<ReplayManifest, 'actors'>,
  detail: DiceRollDetail
): boolean {
  const userId = event.actorId;
  if (userId.length < 1) return false;

  const row =
    fortunes.get(userId) ??
    ({
      userId,
      name: actorNameOf(manifest, event),
      rolls: 0,
      bySystem: new Map<string, SystemRolls>(),
      criticals: 0,
      fumbles: 0,
      successes: 0,
      failures: 0,
    } satisfies MutableFortune);

  row.rolls++;
  const value = rollValueOf(detail);
  if (value !== null) {
    const rolls = row.bySystem.get(detail.system) ?? { count: 0, total: 0, best: value, worst: value };
    rolls.count++;
    rolls.total += value;
    rolls.best = Math.max(rolls.best, value);
    rolls.worst = Math.min(rolls.worst, value);
    row.bySystem.set(detail.system, rolls);
  }
  if (detail.outcome === 'critical') row.criticals++;
  if (detail.outcome === 'fumble') row.fumbles++;
  if (detail.outcome === 'success') row.successes++;
  if (detail.outcome === 'failure') row.failures++;

  fortunes.set(userId, row);
  return true;
}

/** The total of one throw. Null when no face could be read; a zero is a roll and is not flattened into a default. */
function rollValueOf(detail: DiceRollDetail): number | null {
  let total = 0;
  let counted = 0;
  for (const face of detail.faces) {
    if (!Number.isFinite(face.value)) continue;
    total += face.value;
    counted++;
  }
  return counted > 0 ? total : null;
}

function sealFortune(row: MutableFortune): ReplayDigestFortune {
  let system = '';
  let rolls: SystemRolls | null = null;
  for (const [name, entry] of row.bySystem) {
    if (rolls && entry.count <= rolls.count) continue;
    system = name;
    rolls = entry;
  }

  return {
    userId: row.userId,
    name: row.name,
    rolls: row.rolls,
    system,
    counted: rolls?.count ?? 0,
    average: rolls && rolls.count > 0 ? Number((rolls.total / rolls.count).toFixed(2)) : 0,
    best: rolls?.best ?? 0,
    worst: rolls?.worst ?? 0,
    criticals: row.criticals,
    fumbles: row.fumbles,
    successes: row.successes,
    failures: row.failures,
  };
}

function collectLedger(
  ledger: Map<string, MutableLedgerRow>,
  event: ReplayEvent,
  manifest: Pick<ReplayManifest, 'targets'>,
  changes: readonly ChangeEntry[]
): boolean {
  const targetId = event.targetId ?? '';
  if (targetId.length < 1) return false;

  const row = ledger.get(targetId) ?? {
    targetId,
    name: targetNameOf(manifest, targetId, event.seq),
    damage: 0,
    heal: 0,
    biggestHit: 0,
    biggestHitLabel: '',
  };

  let counted = false;
  for (const change of changes) {
    const amount = Math.abs(change.delta);
    if (!Number.isFinite(amount) || amount === 0) continue;
    // A change is either damage or healing, and reading an unreadable one as healing turns a punishing session into a soothing one.
    if (change.kind !== 'damage' && change.kind !== 'heal') continue;
    counted = true;
    if (change.kind === 'damage') {
      row.damage += amount;
      if (amount > row.biggestHit) {
        row.biggestHit = amount;
        row.biggestHitLabel = change.name;
      }
    } else {
      row.heal += amount;
    }
  }

  if (!counted) return false;
  ledger.set(targetId, row);
  return true;
}

function sealLedgerRow(row: MutableLedgerRow): ReplayDigestLedgerRow {
  return {
    ...row,
    damage: trim(row.damage),
    heal: trim(row.heal),
    biggestHit: trim(row.biggestHit),
  };
}

/** Adding fractional changes leaves a remainder, which is dropped before anything is shown. */
function trim(value: number): number {
  return Number(value.toFixed(2));
}

function elapsedOf(manifest: Pick<ReplayManifest, 'startedAt' | 'endedAt'>, visible: readonly ReplayEvent[]): number {
  const recorded = (manifest.endedAt ?? 0) - manifest.startedAt;
  if (recorded > 0) return recorded;
  return Math.max(0, visible[visible.length - 1].t);
}

function buildAwards(
  speakers: readonly ReplayDigestSpeaker[],
  fortunes: readonly ReplayDigestFortune[],
  ledger: readonly ReplayDigestLedgerRow[]
): ReplayDigestAward[] {
  const awards: ReplayDigestAward[] = [];
  const rolled = fortunes.filter((row) => row.rolls >= MIN_ROLLS_FOR_AWARD);

  const unlucky = pick(rolled, (row) => row.fumbles);
  if (unlucky) awards.push({ key: 'unlucky', name: unlucky.name, value: unlucky.fumbles });

  const blessed = pick(rolled, (row) => row.criticals);
  if (blessed) awards.push({ key: 'blessed', name: blessed.name, value: blessed.criticals });

  const talkative = pick(speakers, (row) => row.messages);
  if (talkative && speakers.length > 1)
    awards.push({ key: 'talkative', name: talkative.name, value: talkative.messages });

  const battered = pick(ledger, (row) => row.damage);
  if (battered) awards.push({ key: 'battered', name: battered.name, value: battered.damage });

  return awards;
}

/** The one with the most. Nothing where two are level — a title has to point at somebody. */
function pick<T>(rows: readonly T[], valueOf: (row: T) => number): T | null {
  if (rows.length < 1) return null;
  const sorted = [...rows].sort((a, b) => valueOf(b) - valueOf(a));
  const top = valueOf(sorted[0]);
  if (top < 1) return null;
  if (sorted.length > 1 && valueOf(sorted[1]) === top) return null;
  return sorted[0];
}

function actorNameOf(manifest: Pick<ReplayManifest, 'actors'>, event: ReplayEvent): string {
  return findActorAt(manifest, event.actorId, event.seq)?.name ?? '';
}

function targetNameOf(manifest: Pick<ReplayManifest, 'targets'>, identifier: string, seq: number): string {
  return findTargetAt(manifest, identifier, seq)?.name ?? '';
}

function changesOf(raw: unknown): ChangeEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: ChangeEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const delta = Number(record['delta'] ?? 0);
    if (!Number.isFinite(delta)) continue;
    entries.push({ kind: asString(record['kind']), delta, name: asString(record['name']) });
  }
  return entries;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export interface ReplayDigestLabels {
  readonly numbers: Readonly<Record<keyof ReplayDigestNumbers, string>>;
  readonly awards: string;
  readonly awardOf: (key: string) => string;
  readonly fortune: { readonly title: string; readonly columns: readonly string[] };
  readonly ledger: { readonly title: string; readonly columns: readonly string[]; readonly note: string };
  readonly elapsed: (ms: number) => string;
}

/** Writes the summary out as one page. The wording comes from the caller. */
export function buildReplayDigestMarkdown(digest: ReplayDigest, labels: ReplayDigestLabels): string {
  const parts: string[] = [`# ${digest.roomName}`, ''];

  const numbers = digest.numbers;
  parts.push(
    [
      `${labels.numbers.elapsedMs}: ${labels.elapsed(numbers.elapsedMs)}`,
      `${labels.numbers.messages}: ${numbers.messages}`,
      `${labels.numbers.diceRolls}: ${numbers.diceRolls}`,
      `${labels.numbers.effects}: ${numbers.effects}`,
      `${labels.numbers.rounds}: ${numbers.rounds}`,
      `${labels.numbers.speakers}: ${numbers.speakers}`,
    ].join(' / '),
    ''
  );

  if (digest.awards.length > 0) {
    parts.push(`## ${labels.awards}`, '');
    for (const award of digest.awards) {
      parts.push(`- ${labels.awardOf(award.key)}: ${award.name} (${award.value})`);
    }
    parts.push('');
  }

  if (digest.fortunes.length > 0) {
    parts.push(`## ${labels.fortune.title}`, '', table(labels.fortune.columns));
    for (const row of digest.fortunes) {
      parts.push(
        `| ${row.name} | ${row.rolls} | ${row.average} | ${row.best} | ${row.worst} | ${row.criticals} | ${row.fumbles} |`
      );
    }
    parts.push('');
  }

  if (digest.ledger.length > 0) {
    parts.push(`## ${labels.ledger.title}`, '', table(labels.ledger.columns));
    for (const entry of digest.ledger) {
      parts.push(`| ${entry.name} | ${entry.damage} | ${entry.heal} | ${entry.biggestHit} |`);
    }
    parts.push('', labels.ledger.note);
  }

  return parts.join('\n').trimEnd() + '\n';
}

function table(columns: readonly string[]): string {
  return `| ${columns.join(' | ')} |\n|${columns.map(() => ' --- ').join('|')}|`;
}
