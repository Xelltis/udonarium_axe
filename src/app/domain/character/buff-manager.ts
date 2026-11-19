import { ObjectNode } from '@axe/core/sync/object-node';
import { BuffAppearance } from '@axe/domain/character/buff-appearance';
import { buffGroupOf, isBuffGroupMember } from '@axe/domain/character/buff-group';
import { buffKindMarkOf, writeBuffKindMark } from '@axe/domain/character/buff-kind';
import {
  BuffModifier,
  BuffTextModifier,
  clearBuffModifier,
  clearBuffTextModifier,
  describeStandingModifier,
  holdsRequestedStatus,
  movesSameStatus,
  ParsedBuffModifierRequest,
  readBuffModifier,
  readBuffTextModifier,
  speaksOnlyOfHeldStatus,
  writeBuffModifier,
  writeBuffTextModifier,
} from '@axe/domain/character/buff-modifier';
import { stackBuffEffect } from '@axe/domain/character/buff-stack';
import {
  buffEffectTimingOf,
  buffExpires,
  BuffTiming,
  buffTimingOf,
  BuffTurnActor,
  isBuffDueAt,
  isBuffEffectDueAt,
  writeBuffEffectTiming,
} from '@axe/domain/character/buff-timing';
import { landingOfRequest } from '@axe/domain/character/item-landing';
import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

/** The attribute of a piece's buffs that keeps the latest order words were written at. */
const WORDS_WRITTEN = 'cs-buff-words-written';

/** Everything one buff is, as plain data, so a step of the round can be put back as it was. */
export interface BuffSnapshotEntry {
  name: string;
  value: number | string;
  info: string;
  appearance: BuffAppearance;
  modifier: BuffModifier | null;
  /** The words the buff wrote into an item while it stands, and what the item held before; none where it wrote none. */
  words?: BuffTextModifier | null;
  /**
   * Whether the item the buff moves or writes into was made by a buff for itself, which putting the
   * buff back makes again where it has gone. No other item is made again.
   */
  made?: boolean;
  /**
   * For a buff that leaves its status moved and has run out since this was taken: how far it moved
   * the status between then and going, which putting it back gives back. None where nothing says,
   * which gives back nothing, as a buff gone some other way moved nothing as it went.
   */
  lastMoved?: number;
}

export class BuffManager {
  /** How many changes to the buffs are under way, one inside another, so made items are swept once the outermost is done. */
  private changing = 0;
  /** The items buffs let go of in the change under way, which alone are swept once it is done. */
  private readonly released = new Set<string>();

  /**
   * @param buffElement The piece's buff element, or how to read it as it stands each time: a piece's
   *   own manager is kept, and reads the element the piece holds now, one that came after it was made
   *   or another put in its place included.
   */
  constructor(
    private readonly buffElement: DataElement | null | (() => DataElement | null),
    private readonly owner: () => BuffTurnActor = () => ({ identifier: '', name: '' }),
    private readonly status: () => StatusAccessor | null = () => null
  ) {}

  /** The piece's buff element as it stands. */
  private get buffDataElement(): DataElement | null {
    return typeof this.buffElement === 'function' ? this.buffElement() : this.buffElement;
  }

  /**
   * Makes a change to the piece's buffs, and once it is done, with every change it is part of, takes
   * away every item a buff made that no buff uses any more (see {@link sweepMadeItems}). Every change
   * to the buffs is made in one; a change made of several, as a buff the chat lays again is taken off
   * and laid, is made whole in one, so the item it stands on is not swept halfway.
   */
  alter<T>(change: () => T): T {
    this.changing++;
    try {
      return change();
    } finally {
      this.changing--;
      if (this.changing === 0) this.sweepMadeItems();
    }
  }

  /** The element the buffs are kept in: the first thing in the buff element that is not a buff itself. */
  private get container(): DataElement | null {
    const children = this.buffDataElement?.children ?? [];
    return (children.find((child) => !isBuffRow(child)) as DataElement | undefined) ?? null;
  }

  /**
   * Buffs left beside the container rather than in it, which an older buff panel put there. The
   * round counted none of them down.
   */
  private strays(): DataElement[] {
    const children = this.buffDataElement?.children ?? [];
    return children.filter((child) => isBuffRow(child)) as DataElement[];
  }

  /**
   * Moves any buff left beside the container into it, so that it counts down, runs out and is found
   * by name as the rest are. Run before anything that changes the buffs; reading leaves them be.
   */
  private gather(): void {
    const strays = this.strays();
    if (strays.length < 1) return;
    const container = this.ensureContainer();
    if (!container) return;
    for (const stray of strays) container.appendChild(stray);
  }

  /** Every buff the piece carries, in the order they are held, those still left beside the container last. */
  list(): DataElement[] {
    return [...((this.container?.children ?? []) as DataElement[]), ...this.strays()];
  }

  /**
   * Takes away the first buff of that name, putting back whatever it moved on the sheet, with the
   * further rows of a buff that moves several statuses. False when there is no such buff or the piece
   * has no buff container yet.
   */
  delete(name: string): boolean {
    return this.alter(() => {
      this.gather();
      const data = this.find(name);
      if (!data) return false;
      this.remove(data);
      this.removeGroupMembers(name);
      return true;
    });
  }

  /**
   * Takes away the further rows of a buff that moves several statuses, leaving its first row, so the
   * buff can be laid again with however many it moves now.
   */
  removeGroupMembers(name: string): void {
    this.alter(() => {
      this.removeWhere((data) => isBuffGroupMember(data) && buffGroupOf(data) === name);
    });
  }

  /**
   * Takes away every buff the test picks, putting back whatever each moved on the sheet, and
   * returns their names in the order they were listed.
   */
  removeWhere(test: (data: DataElement) => boolean): string[] {
    return this.alter(() => {
      this.gather();
      const container = this.container;
      if (!container) return [];
      const removed: string[] = [];
      for (const data of [...container.children]) {
        if (!test(data)) continue;
        removed.push(data.name);
        this.remove(data);
      }
      return removed;
    });
  }

  /**
   * Takes a buff away as the reader sees it: the first row of a buff that moves several statuses goes
   * with every further row of it, putting back all they moved. Any other row goes on its own.
   */
  removeWhole(data: DataElement): void {
    this.alter(() => {
      const heads = buffGroupOf(data) === data.name ? data.name : '';
      this.remove(data);
      if (heads.length > 0) this.removeGroupMembers(heads);
    });
  }

  /** Takes the buff away, putting back whatever it moved on the sheet. */
  remove(data: DataElement): void {
    this.alter(() => {
      this.revertModifier(data);
      data.destroy();
    });
  }

  /**
   * Moves a status by what the buff asks for and writes down how far it moved, so the
   * same distance goes back when the buff runs out, or writes the words it asks for into an item and
   * writes down what the item held, so that goes back. Where the value lands is the sheet's to say
   * (see {@link landingOn}): words go only into an item that takes words or among a choice's choices,
   * and an amount moves a number, or is written as words into an item holding words no number is read
   * from.
   *
   * Where the sheet has no such item and the buff is to make it, as one written in the chat is, one is
   * made at its foot for the buff, holding nothing and then moved, or holding the words, and it goes
   * again once no buff needs it. Not for a buff that leaves its status moved, nor for the far side of a
   * resource, which a made item has none of; nor for a status ailment, whose status a piece's sheet may
   * well not have. Null where the value lands nowhere, which leaves the buff a plain note.
   */
  applyModifier(
    data: DataElement,
    request: ParsedBuffModifierRequest,
    makesMissing = false
  ): BuffModifier | BuffTextModifier | null {
    return this.alter(() => {
      const status = this.status();
      if (!status) return null;
      const landing = landingOfRequest(status, request);
      if (landing.kind === 'missing') {
        if (!makesMissing || request.lasting || request.slot !== 'now') return null;
        if (!status.makeForBuff(request.target, request.text ?? 0)) return null;
        if (request.text !== undefined) return this.recordWords(data, request.target, request.text, '');
      } else if (landing.kind === 'words') {
        return this.writeWords(data, request.target, landing.words);
      } else if (landing.kind !== 'number') {
        return null;
      }
      const moved = this.moveStatus(request);
      return moved == null ? null : this.writeModifier(data, request, moved);
    });
  }

  /** Writes words into an item the sheet has for the buff, and records what the item held. */
  private writeWords(data: DataElement, target: string, words: string): BuffTextModifier | null {
    const status = this.status();
    const before = status?.getText(target);
    if (!status || before == null) return null;
    status.setText(target, words);
    return this.recordWords(data, target, words, before);
  }

  /**
   * Records on the buff the words it wrote and what the item held before, as the latest to write, and
   * notes on the item that the buffs leave those words there (see {@link writtenByHand}).
   */
  private recordWords(data: DataElement, target: string, words: string, before: string): BuffTextModifier {
    const modifier: BuffTextModifier = { target, text: words, before, order: this.nextWordsOrder() };
    writeBuffTextModifier(data, modifier);
    this.status()?.noteWordsLeft(target, words);
    return modifier;
  }

  /**
   * The order the next buff of the piece to write words writes them at: past every order handed out
   * before, kept on the piece, so a buff laid after another went never shares its order should that
   * one come back.
   */
  private nextWordsOrder(): number {
    const container = this.ensureContainer();
    const handed = Number(container?.getAttribute(WORDS_WRITTEN) ?? 0);
    const standing = this.list().reduce((latest, row) => Math.max(latest, readBuffTextModifier(row)?.order ?? 0), 0);
    const next = Math.max(Number.isFinite(handed) ? handed : 0, standing) + 1;
    container?.setAttribute(WORDS_WRITTEN, String(next));
    return next;
  }

  /**
   * Lets go of the words a buff wrote. Where a buff wrote words into the same item after it, that one
   * now stands on what this one found there, so it puts that back when it goes. Where none did, the item
   * goes back to what it held, unless someone wrote into it by hand (see {@link writtenByHand}), and
   * what it holds then is what the buffs left, even once none writes into it: words written after,
   * while none stands, are told as written by hand should one of them be put back.
   */
  private revertWords(data: DataElement, words: BuffTextModifier): void {
    clearBuffTextModifier(data);
    this.released.add(words.target);
    const status = this.status();
    if (!status) return;
    const above = this.nextWordsOn(words.target, words.order, data.identifier);
    if (above) {
      writeBuffTextModifier(above.row, { ...above.written, before: words.before });
      return;
    }
    if (this.writtenByHand(words.target)) return;
    status.setText(words.target, words.before);
    status.noteWordsLeft(words.target, words.before);
  }

  /**
   * Whether someone wrote into an item by hand since buffs last wrote into it: it holds other words
   * than those the buffs last left there, as noted on the item. What was written by hand stays as it
   * is, whichever of the buffs goes or comes back, until a buff writes into the item again.
   */
  private writtenByHand(target: string): boolean {
    const status = this.status();
    const left = status?.wordsLeftIn(target) ?? null;
    return left !== null && status?.getText(target) !== left;
  }

  /**
   * Takes away every item a buff made for itself that a buff let go of in the change just done and no
   * buff of the piece moves or writes into any more, one that leaves what it moved included, and the
   * section such items are kept in once it holds none. An item the sheet had all along is never taken,
   * nor one no buff let go of here, as one another device has just made for a buff that has yet to reach
   * this one. Nothing is taken where the buffs cannot be read, as on a device the piece's buffs have not
   * reached yet: the container they are kept in, made with the first buff and never taken away, is not
   * there.
   */
  private sweepMadeItems(): void {
    const released = new Set(this.released);
    this.released.clear();
    const status = this.status();
    if (released.size < 1 || !this.container || !status?.keepsBuffItems()) return;
    const used = new Set<string>();
    for (const row of this.list()) {
      const target = readBuffModifier(row)?.target ?? readBuffTextModifier(row)?.target;
      if (target !== undefined) used.add(target);
    }
    for (const name of status.madeItemNames()) {
      if (released.has(name) && !used.has(name)) status.dropMadeByBuff(name);
    }
    status.tidyBuffItems();
  }

  /**
   * Moves a status again on top of what the standing buff already moved, and remembers the two
   * distances added together, so taking the buff away puts back everything it did in all.
   *
   * A buff standing on some other status, or giving back what this one leaves moved or the other way
   * about, has nothing in common with this one, so what it moved goes back before the new one is
   * laid, which leaves this the same as applying it fresh. One
   * holding the same status at a value keeps holding it there, and nothing is moved. Null where the
   * sheet has no such status, as for a buff laid fresh.
   */
  stackModifier(
    data: DataElement,
    request: ParsedBuffModifierRequest,
    makesMissing = false
  ): BuffModifier | BuffTextModifier | null {
    return this.alter(() => {
      const standing = readBuffModifier(data);
      if (!standing || !movesSameStatus(standing, request)) {
        this.revertModifier(data);
        return this.applyModifier(data, request, makesMissing);
      }
      if (holdsRequestedStatus(standing, request)) {
        return this.status()?.getValue(request.target, request.slot) == null ? null : standing;
      }

      const moved = this.moveStatus(request);
      if (moved == null) return null;
      return this.writeModifier(data, { ...request, step: request.step ?? standing.step }, standing.applied + moved);
    });
  }

  /** Moves the status by what the request asks for and answers how far it actually went. */
  private moveStatus(request: ParsedBuffModifierRequest): number | null {
    const status = this.status();
    if (!status) return null;
    const before = status.getValue(request.target, request.slot);
    if (before == null) return null;

    const wanted = request.operator === 'set' ? request.amount - before : request.amount;
    status.changeValue(request.target, request.slot, wanted);
    const after = status.getValue(request.target, request.slot);
    return (after ?? before) - before;
  }

  private writeModifier(data: DataElement, request: ParsedBuffModifierRequest, applied: number): BuffModifier {
    const modifier: BuffModifier = {
      target: request.target,
      slot: request.slot,
      operator: request.operator,
      applied,
      ...(request.step ? { step: request.step } : {}),
      ...(request.lasting ? { lasting: request.lasting } : {}),
    };
    writeBuffModifier(data, modifier);
    return modifier;
  }

  /**
   * Moves the status again by what the buff moves it at every count, as it is counted down, and
   * writes down the distance it now stands moved, on the record and, for a buff that gives it back,
   * on the badge.
   *
   * At the count it runs out at, a buff that gives back what it moved is left alone, since all of it
   * is about to go back; one that leaves its status moved moves it then too, so poison laid for three
   * rounds bites three times.
   */
  private stepModifier(data: DataElement, runsOut = false): number | null {
    const modifier = readBuffModifier(data);
    if (!modifier?.step || modifier.operator !== 'add') return null;
    if (runsOut && !modifier.lasting) return null;
    const moved = this.moveStatus({
      target: modifier.target,
      slot: modifier.slot,
      operator: 'add',
      amount: modifier.step,
    });
    if (moved == null) return null;
    const standing = { ...modifier, applied: modifier.applied + moved };
    writeBuffModifier(data, standing);
    if (!modifier.lasting) data.currentValue = describeStandingModifier(standing);
    return moved;
  }

  /**
   * Lets go of what the buff moved, moving it back unless the buff leaves it moved, and of the words
   * it wrote, putting back what the item held. An item made for the buff is left for
   * {@link sweepMadeItems}, run once the change this is part of is done (see {@link alter}).
   */
  private revertModifier(data: DataElement): void {
    const words = readBuffTextModifier(data);
    if (words) this.revertWords(data, words);
    const modifier = readBuffModifier(data);
    if (!modifier) return;
    if (!modifier.lasting) this.status()?.changeValue(modifier.target, modifier.slot, -modifier.applied);
    clearBuffModifier(data);
    this.released.add(modifier.target);
  }

  /**
   * Counts every buff that expires down by one round, by hand and whatever its timing, moving the
   * status of one that moves at every count as the round's own countdown does, down to the count it
   * runs out at and no further.
   *
   * A buff held until cleared keeps its count and moves its status once all the same, as it does at
   * the end of a round. One whose effect has a moment of its own is counted and nothing more, since
   * that moment is the clock's to bring.
   *
   * Nothing is removed here, even at zero; `deleteZeroRound` does that.
   */
  decreaseRound(): void {
    this.alter(() => {
      this.gather();
      const container = this.container;
      if (!container) return;
      for (const data of container.children) {
        const movesByCount = buffEffectTimingOf(data) === null;
        if (!buffExpires(data)) {
          if (movesByCount) this.stepModifier(data);
          continue;
        }
        const sum = parseInt(String(data.value)) - 1;
        data.value = sum;
        if (sum >= 0 && movesByCount) this.stepModifier(data, sum === 0);
      }
    });
  }

  /**
   * Gives every buff that expires one more round, the reverse of `decreaseRound`. A buff held until
   * cleared is left alone.
   */
  increaseRound(): void {
    this.alter(() => {
      this.gather();
      const container = this.container;
      if (!container) return;
      for (const data of container.children) {
        if (!buffExpires(data)) continue;
        const sum = parseInt(String(data.value)) + 1;
        data.value = sum;
      }
    });
  }

  /**
   * Removes every buff that expires and has no rounds left, putting back what each moved on the
   * sheet. A buff held until cleared stays whatever its count reads.
   */
  deleteZeroRound(): void {
    this.alter(() => {
      this.gather();
      const container = this.container;
      if (!container) return;
      for (const data of [...container.children]) {
        if (!buffExpires(data)) continue;
        if (parseInt(String(data.value)) <= 0) {
          this.remove(data);
        }
      }
    });
  }

  /** Counts the rounds down, removes the buffs that ran out and returns their names. */
  expireOneRound(): string[] {
    return this.expireAt('roundEnd', { identifier: '', name: '' });
  }

  /**
   * Counts down the buffs whose moment this is, removes the ones that ran out and returns
   * their names. `acting` is whose turn it is, which a buff pinned to a trigger character
   * waits for; it is unused at the end of a round, where everything counts down.
   *
   * Each buff in turn first moves its status where this is the moment its effect moves at, a moment
   * of its own or, for one never counted down, the end of the round; then it is counted down. A buff
   * whose effect has a moment of its own does not move it by being counted, and one that has run
   * out of rounds no longer moves it at all.
   *
   * A buff that leaves its status moved and runs out here is written into `ranOut`, where given,
   * with how far it stood moved in all as it went, for a record taken before to give back exactly
   * what was moved since.
   */
  expireAt(timing: BuffTiming, acting: BuffTurnActor, ranOut?: Map<string, number>): string[] {
    return this.alter(() => {
      this.gather();
      const container = this.container;
      if (!container) return [];

      const owner = this.owner();
      const expired: string[] = [];
      for (const data of [...container.children]) {
        if (this.effectMovesAt(data, timing, owner, acting)) this.stepModifier(data);
        if (!isBuffDueAt(data, timing, owner, acting)) continue;
        const movesByCount = buffEffectTimingOf(data) === null;
        const round = parseInt(String(data.value)) - 1;
        data.value = round;
        if (round <= 0) {
          if (!isBuffGroupMember(data)) expired.push(data.name);
          // Only the count that brings it to nought is its last; one already standing there has had it.
          if (round === 0 && movesByCount) this.stepModifier(data, true);
          const standing = readBuffModifier(data);
          if (standing?.lasting) ranOut?.set(data.name, standing.applied);
          this.remove(data);
        } else if (movesByCount) {
          this.stepModifier(data);
        }
      }
      return expired;
    });
  }

  /** Whether the clock moves the buff's effect at this moment, which it never does once its rounds are spent. */
  private effectMovesAt(data: DataElement, timing: BuffTiming, owner: BuffTurnActor, acting: BuffTurnActor): boolean {
    if (!isBuffEffectDueAt(data, timing, owner, acting)) return false;
    return !buffExpires(data) || parseInt(String(data.value)) > 0;
  }

  /**
   * The buffs whose moment this is, to be counted down or to move their status, as they stand before
   * either, for a turn's opening to give them back should the piece wait.
   */
  dueAt(timing: BuffTiming, acting: BuffTurnActor): BuffSnapshotEntry[] {
    const owner = this.owner();
    return this.snapshotOf(
      this.list().filter(
        (data) => isBuffDueAt(data, timing, owner, acting) || this.effectMovesAt(data, timing, owner, acting)
      )
    );
  }

  /**
   * Puts these buffs back as they stood, one by one, leaving every other buff as it is: one counted
   * down gets its rounds back, one that ran out comes back, and what each moves on the sheet is moved
   * again by the difference alone.
   */
  putBack(entries: readonly BuffSnapshotEntry[]): void {
    this.alter(() => {
      this.gather();
      for (const entry of entries) {
        const found = this.find(entry.name);
        const data = found ?? this.append(entry.name, entry.value, entry.info);
        if (!data) continue;
        data.value = entry.value;
        data.currentValue = entry.info;
        applyAppearance(data, entry.appearance);
        this.restoreModifier(data, entry.modifier, found == null ? (entry.lastMoved ?? 0) : null, entry.made ?? false);
        this.restoreWords(data, entry.words ?? null, entry.made ?? false);
      }
    });
  }

  /**
   * Every buff as it stands, in the order they are held.
   *
   * The names alone would not put a buff back: what it moved on the sheet has to go back
   * with it, and a buff that only reads as a note has no number to find it by.
   */
  snapshot(): BuffSnapshotEntry[] {
    return this.snapshotOf(this.list());
  }

  private snapshotOf(rows: readonly DataElement[]): BuffSnapshotEntry[] {
    return rows.map((data) => ({
      name: data.name,
      value: data.value,
      info: `${data.currentValue ?? ''}`,
      appearance: readAppearance(data),
      modifier: readBuffModifier(data),
      words: readBuffTextModifier(data),
      made: this.makesItsItem(data),
    }));
  }

  /**
   * Puts the buffs back exactly as the snapshot found them.
   *
   * Anything not in it goes, anything missing from it comes back, and what a buff moved on
   * the sheet is moved again by the difference alone, so putting the same state back twice
   * moves nothing the second time.
   */
  restore(entries: readonly BuffSnapshotEntry[]): void {
    this.alter(() => {
      this.gather();
      const container = this.container;
      if (container) {
        const wanted = new Set(entries.map((entry) => entry.name));
        for (const child of [...container.children]) {
          const data = child as DataElement;
          if (!wanted.has(data.name)) this.remove(data);
        }
      }
      const restored: DataElement[] = [];
      for (const entry of entries) {
        const found = this.find(entry.name);
        const data = found ?? this.append(entry.name, entry.value, entry.info);
        if (!data) continue;
        data.value = entry.value;
        data.currentValue = entry.info;
        applyAppearance(data, entry.appearance);
        this.restoreModifier(data, entry.modifier, found == null ? (entry.lastMoved ?? 0) : null, entry.made ?? false);
        this.restoreWords(data, entry.words ?? null, entry.made ?? false);
        restored.push(data);
      }
      this.reorder(restored);
    });
  }

  /** Lays the buffs back in the order they were held, which is the order they are read in. */
  private reorder(wanted: readonly DataElement[]): void {
    const container = this.container;
    if (!container) return;
    const standing = container.children;
    if (wanted.length === standing.length && wanted.every((data, index) => standing[index] === data)) return;
    for (const data of wanted) container.appendChild(data);
  }

  /**
   * Adds a buff row of its own, whatever else goes by that name, in the container the round counts
   * down. The container is made when the piece has none yet; null for a piece with no buff element.
   */
  append(name: string, value: number | string, info: string): DataElement | null {
    return this.alter(() => {
      const container = this.ensureContainer();
      if (!container) return null;
      const created = DataElement.create(name, value, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: info,
      });
      container.appendChild(created);
      return created;
    });
  }

  /**
   * Moves the sheet by what the buff has yet to move, which is nothing when it already stands.
   *
   * A buff that leaves its status moved left it moved when it went, so a record of it gone is taken
   * to stand where it last moved it. One that comes back after going, `cameBackMoving` being how far
   * the count it ran out at moved the status, has that given back as well.
   */
  private restoreModifier(
    data: DataElement,
    wanted: BuffModifier | null,
    cameBackMoving: number | null,
    made: boolean
  ): void {
    const standing = readBuffModifier(data);
    if (standing && (!wanted || !movesSameStatus(standing, wanted))) {
      this.revertModifier(data);
    }
    if (!wanted) return;
    if (made) this.status()?.makeForBuff(wanted.target, 0);
    const left = wanted.lasting ? wanted.applied + (cameBackMoving ?? 0) : 0;
    const applied = readBuffModifier(data)?.applied ?? left;
    if (applied !== wanted.applied) {
      this.status()?.changeValue(wanted.target, wanted.slot, wanted.applied - applied);
    }
    writeBuffModifier(data, wanted);
  }

  /**
   * Writes the words a buff wrote back as they stood, and lays the buffs that write into that item in
   * the order they wrote again (see {@link relinkWords}). Words it no longer writes are let go of. An
   * item made by a buff for these words is made again where it has gone; any other gone stays gone,
   * and the words with it.
   */
  private restoreWords(data: DataElement, wanted: BuffTextModifier | null, made: boolean): void {
    const standing = readBuffTextModifier(data);
    if (standing && (!wanted || standing.target !== wanted.target)) this.revertWords(data, standing);
    if (!wanted) return;
    const status = this.status();
    if (!status) return;
    if (status.getText(wanted.target) == null && !(made && status.makeForBuff(wanted.target, wanted.text))) {
      clearBuffTextModifier(data);
      return;
    }
    writeBuffTextModifier(data, wanted);
    this.relinkWords(wanted.target);
  }

  /**
   * Lays the buffs that write into an item in the order they wrote: the first stands on what the item
   * held before any of them, each later one on the words of the one before it, and the item shows the
   * words of the last, unless someone wrote into it by hand (see {@link writtenByHand}). Run as buffs
   * are put back, whichever of them were and in whatever order.
   */
  private relinkWords(target: string): void {
    const chain = this.wordsOn(target);
    if (chain.length < 1) return;
    let below = chain[0].written.before;
    for (const { row, written } of chain) {
      if (written.before !== below) writeBuffTextModifier(row, { ...written, before: below });
      below = written.text;
    }
    const status = this.status();
    if (!status || this.writtenByHand(target)) return;
    if (status.getText(target) !== below) status.setText(target, below);
    status.noteWordsLeft(target, below);
  }

  /**
   * The buffs that write into an item, in the order they wrote, with what each wrote. Two that wrote at
   * the same order, as two devices laying one each at once may, go by their rows' identifiers, the
   * same way on every device.
   */
  private wordsOn(target: string): { row: DataElement; written: BuffTextModifier }[] {
    return this.list()
      .map((row) => ({ row, written: readBuffTextModifier(row) }))
      .filter((each): each is { row: DataElement; written: BuffTextModifier } => each.written?.target === target)
      .sort((a, b) => a.written.order - b.written.order || compareIdentifiers(a.row, b.row));
  }

  /**
   * The buff that wrote words into the item next after one that wrote at an order, its row the one
   * named, in the order {@link wordsOn} lays them; none where none did.
   */
  private nextWordsOn(
    target: string,
    order: number,
    identifier: string
  ): { row: DataElement; written: BuffTextModifier } | null {
    return (
      this.wordsOn(target).find(
        ({ row, written }) => written.order > order || (written.order === order && row.identifier > identifier)
      ) ?? null
    );
  }

  /** Whether the item a buff moves or writes into was made by a buff for itself. */
  private makesItsItem(data: DataElement): boolean {
    const target = readBuffModifier(data)?.target ?? readBuffTextModifier(data)?.target;
    return target !== undefined && (this.status()?.madeByBuff(target) ?? false);
  }

  private ensureContainer(): DataElement | null {
    if (!this.buffDataElement) return null;
    const container = this.container;
    if (container) return container;
    const created = DataElement.create('バフ/デバフ', '', {}, `${this.buffDataElement.identifier}_container`);
    this.buffDataElement.appendChild(created);
    return created;
  }

  /** The buff that goes by this name, once it is there to be found. */
  find(name: string): DataElement | null {
    return this.container?.getFirstElementByName(name) ?? this.strays().find((data) => data.name === name) ?? null;
  }

  /**
   * Puts a buff of that name on the piece for a number of rounds, or starts an existing one over.
   *
   * Starting over first puts back whatever the old one moved on the sheet, then writes the new
   * rounds, effect and appearance. The buff container is made when the piece has none yet; a piece
   * with no buff element at all is left untouched.
   */
  addRound(name: string, info: string = '', round: number = 3, appearance: BuffAppearance = {}): void {
    this.alter(() => {
      this.gather();
      const container = this.ensureContainer();
      if (!container) return;
      const data = this.find(name);
      if (data) {
        // Putting the same buff on again starts it over, so whatever it moved goes back first.
        this.revertModifier(data);
        data.value = round;
        data.currentValue = info;
        applyAppearance(data, appearance);
      } else {
        const created = DataElement.create(name, round, {
          type: DataElementType.NUMBER_RESOURCE,
          currentValue: info,
        });
        applyAppearance(created, appearance);
        container.appendChild(created);
      }
    });
  }

  /**
   * Puts a buff of that name on top of one already standing, adding the numbers the two notes
   * carry together instead of starting the buff over.
   *
   * `攻撃+2` laid twice reads `攻撃+4`. Where the two notes do not say the same thing about the
   * same number there is nothing to add up, and the new note is written as it stands. The rounds
   * become whichever count is longer, so a short second helping never cuts a long one short, and
   * a buff held until cleared is left held. A name no buff goes by yet is simply granted. A buff
   * holding a status at a value keeps the note that says so where the new note speaks of that status
   * alone, since holding it there twice is still holding it there.
   */
  stackRound(name: string, info: string = '', round?: number, appearance: BuffAppearance = {}): void {
    this.pileOn(name, info, round, appearance, (standing, asked) => Math.max(standing, asked));
  }

  /**
   * The same second helping, but carrying the buff further as well: the rounds asked for are added
   * to the ones standing rather than measured against them.
   *
   * Three rounds laid on a buff with two left leaves five. A buff held until cleared has no count
   * to lengthen and is left alone, and an empty note lengthens a buff without touching what it
   * says, which is how a spell is cast again to hold rather than to strengthen.
   */
  extendRound(name: string, info: string = '', round?: number, appearance: BuffAppearance = {}): void {
    this.pileOn(name, info, round, appearance, (standing, asked) => standing + asked);
  }

  private pileOn(
    name: string,
    info: string,
    round: number | undefined,
    appearance: BuffAppearance,
    settle: (standing: number, asked: number) => number
  ): void {
    this.alter(() => {
      this.gather();
      const data = this.find(name);
      if (!data) {
        this.addRound(name, info, round, appearance);
        return;
      }

      if (!speaksOnlyOfHeldStatus(readBuffModifier(data), info)) {
        const stacked = stackBuffEffect(`${data.currentValue ?? ''}`, info);
        if (stacked !== null) data.currentValue = stacked;
        else if (info.length > 0) data.currentValue = info;
      }
      applyAppearance(data, appearance);

      if (round === undefined || !buffExpires(data)) return;
      const standing = parseInt(String(data.value), 10);
      data.value = Number.isFinite(standing) ? settle(standing, round) : round;
    });
  }
}

/** Two buff rows in the order of their identifiers. */
function compareIdentifiers(a: DataElement, b: DataElement): number {
  return a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0;
}

/** Whether this is one buff rather than something buffs are kept in. */
function isBuffRow(node: ObjectNode): boolean {
  return node instanceof DataElement && node.isNumberResource && node.children.length < 1;
}

function readAppearance(data: DataElement): BuffAppearance {
  const group = buffGroupOf(data);
  const effectTiming = buffEffectTimingOf(data);
  return {
    timing: buffTimingOf(data),
    trigger: data.getAttribute(DataElementAttribute.BUFF_TRIGGER) ?? '',
    color: data.getAttribute(DataElementAttribute.BUFF_COLOR) ?? '',
    icon: data.getAttribute(DataElementAttribute.BUFF_ICON) ?? '',
    kind: buffKindMarkOf(data) ?? '',
    ...(group.length > 0 ? { group } : {}),
    ...(effectTiming ? { effectTiming } : {}),
  };
}

function applyAppearance(data: DataElement, appearance: BuffAppearance): void {
  if (appearance.timing !== undefined) {
    data.setAttribute(DataElementAttribute.BUFF_TIMING, appearance.timing);
  }
  if (appearance.trigger !== undefined) {
    if (appearance.trigger.length > 0) data.setAttribute(DataElementAttribute.BUFF_TRIGGER, appearance.trigger);
    else data.removeAttribute(DataElementAttribute.BUFF_TRIGGER);
  }
  if (appearance.effectTiming !== undefined) writeBuffEffectTiming(data, appearance.effectTiming);
  if (appearance.color !== undefined) {
    if (appearance.color.length > 0) data.setAttribute(DataElementAttribute.BUFF_COLOR, appearance.color);
    else data.removeAttribute(DataElementAttribute.BUFF_COLOR);
  }
  if (appearance.icon !== undefined) {
    if (appearance.icon.length > 0) data.setAttribute(DataElementAttribute.BUFF_ICON, appearance.icon);
    else data.removeAttribute(DataElementAttribute.BUFF_ICON);
  }
  if (appearance.kind !== undefined) writeBuffKindMark(data, appearance.kind);
  if (appearance.group !== undefined) {
    if (appearance.group.length > 0) data.setAttribute(DataElementAttribute.BUFF_GROUP, appearance.group);
    else data.removeAttribute(DataElementAttribute.BUFF_GROUP);
  }
}
