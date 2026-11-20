import { ObjectNode } from '@axe/core/sync/object-node';
import { BuffAppearance } from '@axe/domain/character/buff-appearance';
import { buffGroupOf, isBuffGroupMember } from '@axe/domain/character/buff-group';
import { buffKindMarkOf, writeBuffKindMark } from '@axe/domain/character/buff-kind';
import {
  holdsHandWords,
  isWrittenOtherwise,
  type ItemLayer,
  moveGround,
  numberIn,
  settleItem,
  shownOn,
  takeInItem,
} from '@axe/domain/character/buff-layers';
import { adoptBuffItem, dropBuffItem } from '@axe/domain/character/buff-made-items';
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
import {
  type BuffRequestOutcome,
  type BuffTarget,
  landingOfRequest,
  laysLayersOn,
  makesItemFor,
  outcomeOfLanding,
} from '@axe/domain/character/item-landing';
import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';

/** The attribute of a piece's buffs that keeps the latest order a layer was laid at (see `buff-layers`). */
const LAST_LAID = 'cs-buff-laid';

/** Everything one buff is, as plain data, so a step of the round can be put back as it was. */
export interface BuffSnapshotEntry {
  name: string;
  value: number | string;
  info: string;
  appearance: BuffAppearance;
  modifier: BuffModifier | null;
  /** The words the buff writes into an item while it stands, and how late it laid them; none where it writes none. */
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
  /** How many changes to the buffs are under way, one inside another, so items are laid out once the outermost is done. */
  private changing = 0;
  /**
   * The names of the items buffs let go of in the change under way: a buff's record names its item, so
   * the items a buff made that go by these names are the only ones swept once it is done.
   */
  private readonly released = new Set<string>();
  /**
   * The items holding words or a choice whose layers the change under way lays again, as found when it
   * first touched each, by the name the buffs record; each is laid out once it is done.
   */
  private readonly touched = new Map<string, BuffTarget>();

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
   * Makes a change to the piece's buffs, and once it is done, with every change it is part of, lays out
   * again every item holding words or a choice whose layers it changed (see `settleItem`), then takes
   * away every item a buff made that no buff uses any more (see {@link sweepMadeItems}). Every change
   * to the buffs is made in one; a change made of several, as a buff the chat lays again is taken off
   * and laid, is made whole in one, so the item it stands on is neither laid out nor swept halfway. A
   * change that fails partway lays out and sweeps nothing, and its error is the one thrown.
   */
  alter<T>(change: () => T): T {
    this.changing++;
    let done = false;
    try {
      const made = change();
      done = true;
      return made;
    } finally {
      this.changing--;
      if (this.changing === 0) {
        if (done) {
          this.settleTouched();
          this.sweepMadeItems();
        } else {
          this.touched.clear();
          this.released.clear();
        }
      }
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
   * Moves a status by what the buff asks for and writes down how far it moved, so the same distance
   * goes back when the buff runs out, or lays the words it asks for on an item. Where the value lands is
   * the sheet's to say (see `landingOn`): words go only into an item that takes words or among a
   * choice's choices, and an amount moves a number, or is laid as words on an item holding words no
   * number is read from. The item is found once, by the name the request gives (see `BuffTarget`).
   *
   * Where the sheet has no such item and the buff is to make it, as one written in the chat is, one is
   * made at its foot for the buff (see `makesItemFor`), and it goes again once no buff needs it. An item
   * a buff made that this change let go of and no buff uses is made again for a buff that needs it of
   * the other kind, as one laid again with words where it moved a number. Answers what laying it came to.
   */
  applyModifier(data: DataElement, asked: ParsedBuffModifierRequest, makesMissing = false): BuffRequestOutcome {
    return this.alter(() => {
      const status = this.status();
      if (!status) return { kind: 'missing' };
      return this.lay(data, this.free(status.targetOf(asked.target), asked), asked, makesMissing);
    });
  }

  /** Lays a request on the item found for it (see {@link applyModifier}). */
  private lay(
    data: DataElement,
    found: BuffTarget | null,
    asked: ParsedBuffModifierRequest,
    makesMissing: boolean
  ): BuffRequestOutcome {
    const request = found ? { ...asked, target: found.name } : asked;
    const landing = landingOfRequest(found, request);
    if (landing.kind === 'missing') {
      const made =
        makesItemFor(request, makesMissing) &&
        this.status()?.makeForBuff(request.target, request.text !== undefined ? 'words' : 'number');
      if (!made) return { kind: 'missing' };
      if (request.text !== undefined) this.layWords(data, made, request.text);
      else if (!this.layMove(data, made, request)) return { kind: 'noNumber' };
      return { kind: 'makes' };
    }
    if (landing.kind === 'words') {
      this.layWords(data, found!, landing.words);
      return { kind: 'lands' };
    }
    const outcome = outcomeOfLanding(landing, true, false);
    if (landing.kind !== 'number') return outcome;
    return this.layMove(data, found!, request) ? outcome : { kind: 'noNumber' };
  }

  /**
   * The item found for a request, or none where it is an item a buff made that this change let go of,
   * that no buff uses, and that holds the other kind than the request needs, words for a number or a
   * number for words: that one is taken away, to be made again of the kind needed.
   */
  private free(found: BuffTarget | null, asked: ParsedBuffModifierRequest): BuffTarget | null {
    const [item] = found?.items ?? [];
    if (!found?.made || !item || !this.released.has(found.name) || this.isUsed(found.name)) return found;
    if (laysLayersOn(found) === (asked.text !== undefined)) return found;
    this.touched.delete(found.name);
    dropBuffItem(item);
    return null;
  }

  /** Lays words on an item as the latest layer, written down on the buff. */
  private layWords(data: DataElement, target: BuffTarget, words: string): void {
    this.touch(target);
    writeBuffTextModifier(data, { target: target.name, text: words, order: this.nextOrder() });
  }

  /** Moves the item by what the request asks for and writes down how far it moved; false where it holds no number. */
  private layMove(data: DataElement, target: BuffTarget, request: ParsedBuffModifierRequest): boolean {
    this.touch(target);
    const moved = this.moveStatus(target, request);
    if (moved == null) return false;
    this.writeModifier(data, target, request, moved, laysLayersOn(target) ? this.nextOrder() : undefined);
    return true;
  }

  /**
   * The order the next layer laid on an item of the piece is laid at: past every order handed out
   * before, kept on the piece, so a layer laid after another went never shares its order should that
   * one come back.
   */
  private nextOrder(): number {
    const container = this.ensureContainer();
    const handed = Number(container?.getAttribute(LAST_LAID) ?? 0);
    const standing = this.list().reduce(
      (latest, row) => Math.max(latest, readBuffTextModifier(row)?.order ?? 0, readBuffModifier(row)?.order ?? 0),
      0
    );
    const next = Math.max(Number.isFinite(handed) ? handed : 0, standing) + 1;
    container?.setAttribute(LAST_LAID, String(next));
    return next;
  }

  /** The layers the piece's buffs lay on an item, by the name they record it by. */
  private layersOn(name: string): ItemLayer[] {
    const layers: ItemLayer[] = [];
    for (const row of this.list()) {
      const words = readBuffTextModifier(row);
      if (words?.target === name)
        layers.push({ kind: 'words', text: words.text, order: words.order, tie: row.identifier });
      const modifier = readBuffModifier(row);
      if (modifier?.target === name) {
        layers.push({ kind: 'move', by: modifier.applied, order: modifier.order ?? 0, tie: row.identifier });
      }
    }
    return layers;
  }

  /** Whether any buff of the piece moves or writes into the item that goes by a name. */
  private isUsed(name: string): boolean {
    return this.list().some((row) => (readBuffModifier(row)?.target ?? readBuffTextModifier(row)?.target) === name);
  }

  /**
   * Marks an item holding words or a choice as one whose layers this change lays again, the first time
   * it does, taking in what it holds before any layer changes (see `takeInItem`): words written into it
   * otherwise since become a layer of their own. It is laid out once the change is done.
   */
  private touch(target: BuffTarget): void {
    const [item] = target.items;
    if (!item || !laysLayersOn(target) || this.touched.has(target.name)) return;
    this.touched.set(target.name, target);
    takeInItem(item, this.layersOn(target.name), () => this.nextOrder());
  }

  /** Lays out again every item the change just done laid layers on, as it found them, from the layers standing now. */
  private settleTouched(): void {
    const touched = [...this.touched.values()];
    this.touched.clear();
    for (const target of touched) settleItem(target.items, this.layersOn(target.name));
  }

  /**
   * Takes away every item a buff made for itself that a buff let go of in the change just done and no
   * buff of the piece moves or writes into any more, one that leaves what it moved included, and the
   * section such items are kept in once it holds none. One written into otherwise since the buffs left
   * what they did in it, by hand or by a command, is kept as the sheet's own (see `isWrittenOtherwise`).
   * Each is taken as itself, not by name. An item the sheet had all along is never taken, nor one no
   * buff let go of here, as one another device has just made for a buff that has yet to reach this one.
   * Nothing is taken where the buffs cannot be read, as on a device the piece's buffs have not reached
   * yet: the container they are kept in, made with the first buff and never taken away, is not there.
   */
  private sweepMadeItems(): void {
    const released = new Set(this.released);
    this.released.clear();
    const status = this.status();
    if (released.size < 1 || !this.container || !status) return;
    for (const item of status.madeItems()) {
      if (!released.has(item.name) || this.isUsed(item.name)) continue;
      if (isWrittenOtherwise(item) || holdsHandWords(item)) adoptBuffItem(item);
      else dropBuffItem(item);
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
   * holding the same status at a value keeps holding it there, and nothing is moved. Answers what
   * laying it came to, as {@link applyModifier} does.
   */
  stackModifier(data: DataElement, asked: ParsedBuffModifierRequest, makesMissing = false): BuffRequestOutcome {
    return this.alter(() => {
      const status = this.status();
      if (!status) return { kind: 'missing' };
      const found = status.targetOf(asked.target);
      const request = found ? { ...asked, target: found.name } : asked;
      const standing = readBuffModifier(data);
      if (!standing || !movesSameStatus(standing, request)) {
        this.revertModifier(data);
        return this.lay(data, this.free(found, request), request, makesMissing);
      }
      if (!found) return { kind: 'missing' };
      this.touch(found);
      if (holdsRequestedStatus(standing, request)) {
        return this.valueNow(found, request.slot) == null ? { kind: 'noNumber' } : { kind: 'lands' };
      }
      const moved = this.moveStatus(found, request);
      if (moved == null) return { kind: 'noNumber' };
      this.writeModifier(
        data,
        found,
        { ...request, step: request.step ?? standing.step },
        standing.applied + moved,
        standing.order
      );
      return { kind: 'lands' };
    });
  }

  /**
   * The number a slot of the item holds now: for one holding words or a choice taken in by the change
   * under way, what its layers show (see `shownOn`), which it is written with once the change is done.
   */
  private valueNow(target: BuffTarget, slot: ResourceSlot): number | null {
    const [item] = target.items;
    if (!item || !laysLayersOn(target) || !this.touched.has(target.name))
      return this.status()?.valueOf(target, slot) ?? null;
    return slot === 'now' ? numberIn(shownOn(item, this.layersOn(target.name))) : null;
  }

  /**
   * Moves the status by what the request asks for and answers how far it went: on a number, as far as
   * its bounds let it; on an item holding words or a choice, all of it, laid as a layer once the change
   * is done. Null where the item holds no number there.
   */
  private moveStatus(
    target: BuffTarget,
    request: Pick<ParsedBuffModifierRequest, 'slot' | 'operator' | 'amount'>
  ): number | null {
    const before = this.valueNow(target, request.slot);
    if (before == null) return null;
    const wanted = request.operator === 'set' ? request.amount - before : request.amount;
    if (laysLayersOn(target)) return wanted;
    const status = this.status()!;
    status.changeByBuff(target, request.slot, wanted);
    return (status.valueOf(target, request.slot) ?? before) - before;
  }

  private writeModifier(
    data: DataElement,
    target: BuffTarget,
    request: ParsedBuffModifierRequest,
    applied: number,
    order: number | undefined
  ): BuffModifier {
    const modifier: BuffModifier = {
      target: target.name,
      slot: request.slot,
      operator: request.operator,
      applied,
      ...(request.step ? { step: request.step } : {}),
      ...(request.lasting ? { lasting: request.lasting } : {}),
      ...(order !== undefined ? { order } : {}),
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
    const target = this.status()?.targetOf(modifier.target);
    if (!target) return null;
    this.touch(target);
    const moved = this.moveStatus(target, { slot: modifier.slot, operator: 'add', amount: modifier.step });
    if (moved == null) return null;
    const standing = { ...modifier, applied: modifier.applied + moved };
    writeBuffModifier(data, standing);
    if (!modifier.lasting) data.currentValue = describeStandingModifier(standing);
    return moved;
  }

  /**
   * Lets go of what the buff moved, moving it back unless the buff leaves it moved, and of the words it
   * wrote: their layers go, and the item is laid out again from those left once the change is done
   * (see {@link alter}). A move left in place as its buff goes is moved into the ground of an item
   * holding words or a choice. An item made for the buff is left for {@link sweepMadeItems}, run once
   * the change this is part of is done.
   */
  private revertModifier(data: DataElement): void {
    this.revertWords(data);
    this.revertMove(data);
  }

  /** Lets go of the words the buff wrote: its layer goes (see {@link revertModifier}). */
  private revertWords(data: DataElement): void {
    const words = readBuffTextModifier(data);
    if (!words) return;
    const target = this.status()?.targetOf(words.target);
    if (target) this.touch(target);
    this.released.add(words.target);
    clearBuffTextModifier(data);
  }

  /** Lets go of what the buff moved, moving it back unless the buff leaves it moved (see {@link revertModifier}). */
  private revertMove(data: DataElement): void {
    const status = this.status();
    const modifier = readBuffModifier(data);
    if (!modifier) return;
    const target = status?.targetOf(modifier.target);
    if (target) {
      this.touch(target);
      if (laysLayersOn(target)) {
        if (modifier.lasting && target.items[0]) moveGround(target.items[0], modifier.applied);
      } else if (!modifier.lasting) {
        status!.changeByBuff(target, modifier.slot, -modifier.applied);
      }
    }
    this.released.add(modifier.target);
    clearBuffModifier(data);
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
      for (const entry of entries) this.putEntryBack(entry);
    });
  }

  /**
   * Puts one buff back as the entry found it, by {@link putBack} and {@link restore} alike: its row,
   * made again where it has gone, gets its rounds, its note and its look back, lets go of what it holds
   * that the entry does not (see {@link letGoOfStale}), and moves and writes on the sheet what the entry
   * did, by the difference alone. Null where the piece has no buff element to hold the row.
   */
  private putEntryBack(entry: BuffSnapshotEntry): DataElement | null {
    const found = this.find(entry.name);
    const data = found ?? this.append(entry.name, entry.value, entry.info);
    if (!data) return null;
    data.value = entry.value;
    data.currentValue = entry.info;
    applyAppearance(data, entry.appearance);
    this.letGoOfStale(data, entry);
    this.restoreModifier(data, entry.modifier, found == null ? (entry.lastMoved ?? 0) : null, entry.made ?? false);
    this.restoreWords(data, entry.words ?? null, entry.made ?? false);
    return data;
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
    const made = new Set(
      this.status()
        ?.madeItems()
        .map((item) => item.name) ?? []
    );
    return rows.map((data) => {
      const modifier = readBuffModifier(data);
      const words = readBuffTextModifier(data);
      const target = modifier?.target ?? words?.target;
      return {
        name: data.name,
        value: data.value,
        info: `${data.currentValue ?? ''}`,
        appearance: readAppearance(data),
        modifier,
        words,
        made: target !== undefined && made.has(target),
      };
    });
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
        const data = this.putEntryBack(entry);
        if (data) restored.push(data);
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
   * the count it ran out at moved the status, has that given back as well. On an item holding words
   * or a choice, where such a move went into the ground as it went, it comes out of the ground again
   * as its layer comes back. An item a buff made, made again here as it has gone, has had nothing
   * moved on it yet, whatever the row says it moved. What the row moved that the record does not is
   * let go of first (see {@link letGoOfStale}).
   */
  private restoreModifier(
    data: DataElement,
    wanted: BuffModifier | null,
    cameBackMoving: number | null,
    made: boolean
  ): void {
    if (!wanted) return;
    const status = this.status();
    const found = status?.targetOf(wanted.target) ?? null;
    const target = found ?? (made ? (status?.makeForBuff(wanted.target, 'number') ?? null) : null);
    if (target) {
      this.touch(target);
      const left = wanted.lasting ? wanted.applied + (cameBackMoving ?? 0) : 0;
      const standing = found ? readBuffModifier(data)?.applied : undefined;
      if (laysLayersOn(target)) {
        if (standing === undefined && left !== 0 && target.items[0]) moveGround(target.items[0], -left);
      } else {
        const applied = standing ?? left;
        if (applied !== wanted.applied) status!.changeByBuff(target, wanted.slot, wanted.applied - applied);
      }
    }
    writeBuffModifier(data, target ? { ...wanted, target: target.name } : wanted);
  }

  /**
   * Lets go of what a row holds now that the record it is put back to does not, before either is laid
   * again: words on another item or none, or a number it no longer moves, as a buff laid again under
   * the same name with other words or a move holds. Each goes back as it would as the buff goes.
   */
  private letGoOfStale(data: DataElement, entry: BuffSnapshotEntry): void {
    const words = readBuffTextModifier(data);
    if (words && (!entry.words || words.target !== entry.words.target)) this.revertWords(data);
    const modifier = readBuffModifier(data);
    if (modifier && (!entry.modifier || !movesSameStatus(modifier, entry.modifier))) this.revertMove(data);
  }

  /**
   * Lays the words a buff wrote back on the item as the record has them, at the order it laid them,
   * among the layers standing there however they were put back. An item made by a buff for these words
   * is made again where it has gone; any other gone stays gone, and the words with it.
   */
  private restoreWords(data: DataElement, wanted: BuffTextModifier | null, made: boolean): void {
    if (!wanted) return;
    const status = this.status();
    const target =
      status?.targetOf(wanted.target) ?? (made ? (status?.makeForBuff(wanted.target, 'words') ?? null) : null);
    if (!target) {
      clearBuffTextModifier(data);
      return;
    }
    this.touch(target);
    writeBuffTextModifier(data, { ...wanted, target: target.name });
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

      if (!speaksOnlyOfHeldStatus(readBuffModifier(data), info, this.status())) {
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
