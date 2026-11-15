import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { type BuffRemovalRule, countBuffRemoval, removeBuffsAcross } from '@axe/domain/character/buff-bulk-removal';
import type { BuffSnapshotEntry } from '@axe/domain/character/buff-manager';
import {
  countOwnItemsOffDefault,
  type DefaultField,
  type FieldsHeld,
  fieldsHeldBy,
  resetPieceToDefaults,
  sheetItemsOf,
} from '@axe/domain/character/default-value';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { StatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

/** What a reset does to the pieces it is given: which buffs it takes off, and whether it puts values back. */
export interface ResetRequest {
  /** The buffs to take off, or null to leave every buff on. */
  readonly rule: BuffRemovalRule | null;
  /** Whether the values that keep a default go back to it, once the buffs are off. */
  readonly values: boolean;
}

/** How far a reset reached: the pieces it changed anything on, the buffs it took and the values it wrote. */
export interface ResetCount {
  readonly characters: number;
  readonly buffs: number;
  readonly items: number;
}

/** One place on one item of a sheet a reset left changed, with what it held before and holds after. */
export interface ResetFieldChange {
  /** The identifier of the item. */
  readonly identifier: string;
  readonly field: DefaultField;
  readonly before: number | string;
  readonly after: number | string;
}

/** What a reset did to one piece, a part being a piece of its own, kept so it can be taken back. */
export interface PieceResetRecord {
  /** The identifier of the piece. */
  readonly piece: string;
  /** The buffs the piece wore before the reset, and those it was left with. */
  readonly buffsBefore: readonly BuffSnapshotEntry[];
  readonly buffsAfter: readonly BuffSnapshotEntry[];
  /** What every item of the sheet held before the reset, by the item's identifier. */
  readonly held: Readonly<Record<string, FieldsHeld>>;
  /** The places the reset left changed, whether a buff going moved them or a default was written. */
  readonly changes: readonly ResetFieldChange[];
}

/** What one reset did, piece by piece; only the pieces it changed anything on are kept. */
export interface ResetRecord {
  readonly pieces: readonly PieceResetRecord[];
}

/** How taking a reset back ended: the pieces put back as they were, and those left as they are. */
export interface ResetUndoOutcome {
  readonly restored: number;
  /** The pieces changed since the reset, or gone, which were left alone. */
  readonly skipped: number;
}

const FIELDS_IN_ORDER: readonly DefaultField[] = ['minCorrection', 'maxCorrection', 'value', 'currentValue'];

function same(left: unknown, right: unknown): boolean {
  return `${left ?? ''}` === `${right ?? ''}`;
}

function sameBuffs(left: readonly BuffSnapshotEntry[], right: readonly BuffSnapshotEntry[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function heldOn(piece: GameCharacter): Record<string, FieldsHeld> {
  const held: Record<string, FieldsHeld> = {};
  for (const element of sheetItemsOf(piece)) held[element.identifier] = fieldsHeldBy(element);
  return held;
}

interface Watched {
  readonly piece: GameCharacter;
  readonly buffs: BuffSnapshotEntry[];
  readonly held: Record<string, FieldsHeld>;
}

/**
 * Remembers how pieces stood before a reset, and tells afterwards what the reset did to each.
 *
 * A piece is watched just before the first thing that resets it, and read again when everything is
 * done, so one record covers a line of chat that clears buffs and puts values back in several steps.
 * A part is a piece of its own and is watched as one.
 */
export class ResetRecorder {
  private readonly watched = new Map<string, Watched>();

  /** Remembers how each of these pieces stands now, unless it is already remembered. */
  watch(pieces: readonly GameCharacter[]): void {
    for (const piece of pieces) {
      if (this.watched.has(piece.identifier)) continue;
      this.watched.set(piece.identifier, { piece, buffs: piece.buffs.snapshot(), held: heldOn(piece) });
    }
  }

  /** What changed on each piece watched since it was first watched; a piece nothing changed on is left out. */
  finish(): ResetRecord {
    const pieces: PieceResetRecord[] = [];
    for (const { piece, buffs, held } of this.watched.values()) {
      const buffsAfter = piece.buffs.snapshot();
      const changes: ResetFieldChange[] = [];
      for (const element of sheetItemsOf(piece)) {
        const before = held[element.identifier];
        if (!before) continue;
        const after = fieldsHeldBy(element);
        for (const field of FIELDS_IN_ORDER) {
          if (same(before[field], after[field])) continue;
          changes.push({ identifier: element.identifier, field, before: before[field], after: after[field] });
        }
      }
      if (changes.length < 1 && sameBuffs(buffs, buffsAfter)) continue;
      pieces.push({ piece: piece.identifier, buffsBefore: buffs, buffsAfter, held, changes });
    }
    return { pieces };
  }
}

/**
 * Resets every piece given, each on its own: first the buffs the request names come off all of them,
 * each putting back what it moved on its sheet, and then, where the request asks, the values of each
 * go back to their defaults. A part is reset only where it is among the pieces given.
 *
 * The buffs go first because a buff that moved a status puts that back as it goes, and a value put
 * back first would have it taken from it a second time. `ailments` are the states the room keeps,
 * which tell a debuff from a buff where the rule asks.
 */
export function resetAcross(
  pieces: readonly GameCharacter[],
  request: ResetRequest,
  ailments: readonly StatusAilment[] = []
): ResetCount {
  return GameObject.batch(() => {
    const reached = new Set<GameCharacter>();
    let buffs = 0;
    let items = 0;
    if (request.rule) {
      for (const piece of pieces) {
        const removed = removeBuffsAcross([piece], request.rule, ailments).buffs;
        if (removed > 0) reached.add(piece);
        buffs += removed;
      }
    }
    if (request.values) {
      for (const piece of pieces) {
        const changes = resetPieceToDefaults(piece).changes.length;
        if (changes > 0) reached.add(piece);
        items += changes;
      }
    }
    return { characters: reached.size, buffs, items };
  });
}

/**
 * Counts what a reset would reach on the pieces given, each on its own as {@link resetAcross} takes
 * them, changing nothing: the buffs it would take, and the items that keep a default and do not stand
 * at it now. The values are counted as they stand, so
 * an item a buff holds off its default counts although taking the buff off will put it back, and the
 * count a reset reports once it is done may differ.
 */
export function countReset(
  pieces: readonly GameCharacter[],
  request: ResetRequest,
  ailments: readonly StatusAilment[] = []
): ResetCount {
  const reached = new Set<GameCharacter>();
  let buffs = 0;
  let items = 0;
  for (const piece of pieces) {
    const taken = request.rule ? countBuffRemoval([piece], request.rule, ailments).buffs : 0;
    const off = request.values ? countOwnItemsOffDefault(piece) : 0;
    if (taken > 0 || off > 0) reached.add(piece);
    buffs += taken;
    items += off;
  }
  return { characters: reached.size, buffs, items };
}

function writeField(element: DataElement, field: DefaultField, value: number | string): void {
  if (field === 'value' || field === 'currentValue') {
    element[field] = value;
    return;
  }
  const attribute =
    field === 'maxCorrection' ? DataElementAttribute.MAX_CORRECTION : DataElementAttribute.MIN_CORRECTION;
  if (Number(value) === 0) element.removeAttribute(attribute);
  else element.setAttribute(attribute, String(value));
}

/**
 * Whether a piece still stands as a reset left it: it wears the buffs it was left with, as they were
 * left, and every place the reset changed holds what the reset left there.
 */
function standsAsLeft(piece: GameCharacter, record: PieceResetRecord, items: ReadonlyMap<string, DataElement>) {
  if (!sameBuffs(piece.buffs.snapshot(), record.buffsAfter)) return false;
  return record.changes.every((change) => {
    const element = items.get(change.identifier);
    return element != null && same(fieldsHeldBy(element)[change.field], change.after);
  });
}

function undoOnPiece(record: PieceResetRecord): boolean {
  const piece = ObjectStore.instance.get<GameCharacter>(record.piece);
  if (!(piece instanceof GameCharacter)) return false;
  const items = new Map(sheetItemsOf(piece).map((element) => [element.identifier, element]));
  if (!standsAsLeft(piece, record, items)) return false;

  const stood = new Map([...items].map(([identifier, element]) => [identifier, fieldsHeldBy(element)]));
  piece.buffs.restore(record.buffsBefore);
  for (const [identifier, element] of items) {
    const before = record.held[identifier];
    const standing = stood.get(identifier);
    if (!before || !standing) continue;
    for (const field of FIELDS_IN_ORDER) {
      const now = fieldsHeldBy(element)[field];
      if (same(now, before[field])) continue;
      const changedByReset = record.changes.some(
        (change) => change.identifier === identifier && change.field === field
      );
      const movedByBuffsAlone = !same(now, standing[field]) && same(standing[field], before[field]);
      if (changedByReset || movedByBuffsAlone) writeField(element, field, before[field]);
    }
  }
  return true;
}

/**
 * Takes a reset back, piece by piece, and answers how many pieces were put back and how many left.
 *
 * A piece is put back only while it stands as the reset left it: gone from the room, wearing other
 * buffs than it was left with, or holding another value where the reset wrote one, it is left alone,
 * since putting the buffs back takes off every buff that was not worn before. The buffs come back
 * first, each moving its status again, and then every place the reset changed is written with what
 * it held before, the corrections first, the maximum next and what is left last; a place a buff
 * coming back moved off what it held before is written the same way, so no status is moved twice.
 */
export function undoReset(record: ResetRecord): ResetUndoOutcome {
  return GameObject.batch(() => {
    let restored = 0;
    for (const piece of record.pieces) {
      if (undoOnPiece(piece)) restored += 1;
    }
    return { restored, skipped: record.pieces.length - restored };
  });
}
