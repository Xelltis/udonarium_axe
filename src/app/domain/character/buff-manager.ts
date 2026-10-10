import { BuffAppearance } from '@axe/domain/character/buff-appearance';
import {
  BuffModifier,
  clearBuffModifier,
  ParsedBuffModifierRequest,
  readBuffModifier,
  writeBuffModifier,
} from '@axe/domain/character/buff-modifier';
import { stackBuffEffect } from '@axe/domain/character/buff-stack';
import { buffExpires, BuffTiming, buffTimingOf, BuffTurnActor, isBuffDueAt } from '@axe/domain/character/buff-timing';
import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

/** Everything one buff is, as plain data, so a step of the round can be put back as it was. */
export interface BuffSnapshotEntry {
  name: string;
  value: number | string;
  info: string;
  appearance: BuffAppearance;
  modifier: BuffModifier | null;
}

export class BuffManager {
  constructor(
    private readonly buffDataElement: DataElement | null,
    private readonly owner: () => BuffTurnActor = () => ({ identifier: '', name: '' }),
    private readonly status: () => StatusAccessor | null = () => null
  ) {}

  private get container(): DataElement | null {
    return this.buffDataElement?.children[0] ?? null;
  }

  /**
   * Takes away the first buff of that name, putting back whatever it moved on the sheet. False when
   * there is no such buff or the piece has no buff container yet.
   */
  delete(name: string): boolean {
    const container = this.container;
    if (!container) return false;
    const data = container.getFirstElementByName(name);
    if (!data) return false;
    this.remove(data);
    return true;
  }

  /**
   * Takes away every buff the test picks, putting back whatever each moved on the sheet, and
   * returns their names in the order they were listed.
   */
  removeWhere(test: (data: DataElement) => boolean): string[] {
    const container = this.container;
    if (!container) return [];
    const removed: string[] = [];
    for (const data of [...container.children]) {
      if (!test(data)) continue;
      removed.push(data.name);
      this.remove(data);
    }
    return removed;
  }

  /** Takes the buff away, putting back whatever it moved on the sheet. */
  remove(data: DataElement): void {
    this.revertModifier(data);
    data.destroy();
  }

  /**
   * Moves a status by what the buff asks for and writes down how far it moved, so the
   * same distance goes back when the buff runs out. Null where the sheet has no such
   * status, which leaves the buff a plain note.
   */
  applyModifier(data: DataElement, request: ParsedBuffModifierRequest): BuffModifier | null {
    const moved = this.moveStatus(request);
    if (moved == null) return null;
    return this.writeModifier(data, request, moved);
  }

  /**
   * Moves a status again on top of what the standing buff already moved, and remembers the two
   * distances added together, so taking the buff away puts back everything it did in all.
   *
   * A buff standing on some other status has nothing in common with this one, so what it moved
   * goes back before the new one is laid, which leaves this the same as applying it fresh.
   */
  stackModifier(data: DataElement, request: ParsedBuffModifierRequest): BuffModifier | null {
    const standing = readBuffModifier(data);
    if (!standing || standing.target !== request.target || standing.slot !== request.slot) {
      this.revertModifier(data);
      return this.applyModifier(data, request);
    }

    const moved = this.moveStatus(request);
    if (moved == null) return null;
    return this.writeModifier(data, request, standing.applied + moved);
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
    };
    writeBuffModifier(data, modifier);
    return modifier;
  }

  private revertModifier(data: DataElement): void {
    const modifier = readBuffModifier(data);
    if (!modifier) return;
    this.status()?.changeValue(modifier.target, modifier.slot, -modifier.applied);
    clearBuffModifier(data);
  }

  /**
   * Counts every buff that expires down by one round, by hand and whatever its timing.
   *
   * Nothing is removed here, even at zero; `deleteZeroRound` does that. A buff held until cleared
   * is left alone.
   */
  decreaseRound(): void {
    const container = this.container;
    if (!container) return;
    for (const data of container.children) {
      if (!buffExpires(data)) continue;
      const sum = parseInt(String(data.value)) - 1;
      data.value = sum;
    }
  }

  /**
   * Gives every buff that expires one more round, the reverse of `decreaseRound`. A buff held until
   * cleared is left alone.
   */
  increaseRound(): void {
    const container = this.container;
    if (!container) return;
    for (const data of container.children) {
      if (!buffExpires(data)) continue;
      const sum = parseInt(String(data.value)) + 1;
      data.value = sum;
    }
  }

  /**
   * Removes every buff that expires and has no rounds left, putting back what each moved on the
   * sheet. A buff held until cleared stays whatever its count reads.
   */
  deleteZeroRound(): void {
    const container = this.container;
    if (!container) return;
    for (const data of [...container.children]) {
      if (!buffExpires(data)) continue;
      if (parseInt(String(data.value)) <= 0) {
        this.remove(data);
      }
    }
  }

  /** Counts the rounds down, removes the buffs that ran out and returns their names. */
  expireOneRound(): string[] {
    return this.expireAt('roundEnd', { identifier: '', name: '' });
  }

  /**
   * Counts down the buffs whose moment this is, removes the ones that ran out and returns
   * their names. `acting` is whose turn it is, which a buff pinned to a trigger character
   * waits for; it is unused at the end of a round, where everything counts down.
   */
  expireAt(timing: BuffTiming, acting: BuffTurnActor): string[] {
    const container = this.container;
    if (!container) return [];

    const owner = this.owner();
    const expired: string[] = [];
    for (const data of [...container.children]) {
      if (!isBuffDueAt(data, timing, owner, acting)) continue;
      const round = parseInt(String(data.value)) - 1;
      data.value = round;
      if (round <= 0) {
        expired.push(data.name);
        this.remove(data);
      }
    }
    return expired;
  }

  /**
   * Every buff as it stands, in the order they are held.
   *
   * The names alone would not put a buff back: what it moved on the sheet has to go back
   * with it, and a buff that only reads as a note has no number to find it by.
   */
  snapshot(): BuffSnapshotEntry[] {
    const container = this.container;
    if (!container) return [];
    return container.children.map((child) => {
      const data = child as DataElement;
      return {
        name: data.name,
        value: data.value,
        info: `${data.currentValue ?? ''}`,
        appearance: readAppearance(data),
        modifier: readBuffModifier(data),
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
      const data = this.find(entry.name) ?? this.appendBuff(entry.name, entry.value, entry.info);
      if (!data) continue;
      data.value = entry.value;
      data.currentValue = entry.info;
      applyAppearance(data, entry.appearance);
      this.restoreModifier(data, entry.modifier);
      restored.push(data);
    }
    this.reorder(restored);
  }

  /** Lays the buffs back in the order they were held, which is the order they are read in. */
  private reorder(wanted: readonly DataElement[]): void {
    const container = this.container;
    if (!container) return;
    const standing = container.children;
    if (wanted.length === standing.length && wanted.every((data, index) => standing[index] === data)) return;
    for (const data of wanted) container.appendChild(data);
  }

  private appendBuff(name: string, value: number | string, info: string): DataElement | null {
    const container = this.ensureContainer();
    if (!container) return null;
    const created = DataElement.create(name, value, {
      type: DataElementType.NUMBER_RESOURCE,
      currentValue: info,
    });
    container.appendChild(created);
    return created;
  }

  /** Moves the sheet by what the buff has yet to move, which is nothing when it already stands. */
  private restoreModifier(data: DataElement, wanted: BuffModifier | null): void {
    const standing = readBuffModifier(data);
    if (standing && (!wanted || standing.target !== wanted.target || standing.slot !== wanted.slot)) {
      this.revertModifier(data);
    }
    if (!wanted) return;
    const applied = readBuffModifier(data)?.applied ?? 0;
    if (applied !== wanted.applied) {
      this.status()?.changeValue(wanted.target, wanted.slot, wanted.applied - applied);
    }
    writeBuffModifier(data, wanted);
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
    return this.container?.getFirstElementByName(name) ?? null;
  }

  /**
   * Puts a buff of that name on the piece for a number of rounds, or starts an existing one over.
   *
   * Starting over first puts back whatever the old one moved on the sheet, then writes the new
   * rounds, effect and appearance. The buff container is made when the piece has none yet; a piece
   * with no buff element at all is left untouched.
   */
  addRound(name: string, info: string = '', round: number = 3, appearance: BuffAppearance = {}): void {
    const container = this.ensureContainer();
    if (!container) return;
    const data = this.buffDataElement?.getFirstElementByName(name);
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
  }

  /**
   * Puts a buff of that name on top of one already standing, adding the numbers the two notes
   * carry together instead of starting the buff over.
   *
   * `攻撃+2` laid twice reads `攻撃+4`. Where the two notes do not say the same thing about the
   * same number there is nothing to add up, and the new note is written as it stands. The rounds
   * become whichever count is longer, so a short second helping never cuts a long one short, and
   * a buff held until cleared is left held. A name no buff goes by yet is simply granted.
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
    const data = this.buffDataElement?.getFirstElementByName(name);
    if (!data) {
      this.addRound(name, info, round, appearance);
      return;
    }

    const stacked = stackBuffEffect(`${data.currentValue ?? ''}`, info);
    if (stacked !== null) data.currentValue = stacked;
    else if (info.length > 0) data.currentValue = info;
    applyAppearance(data, appearance);

    if (round === undefined || !buffExpires(data)) return;
    const standing = parseInt(String(data.value), 10);
    data.value = Number.isFinite(standing) ? settle(standing, round) : round;
  }
}

function readAppearance(data: DataElement): BuffAppearance {
  return {
    timing: buffTimingOf(data),
    trigger: data.getAttribute(DataElementAttribute.BUFF_TRIGGER) ?? '',
    color: data.getAttribute(DataElementAttribute.BUFF_COLOR) ?? '',
    icon: data.getAttribute(DataElementAttribute.BUFF_ICON) ?? '',
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
  if (appearance.color !== undefined) {
    if (appearance.color.length > 0) data.setAttribute(DataElementAttribute.BUFF_COLOR, appearance.color);
    else data.removeAttribute(DataElementAttribute.BUFF_COLOR);
  }
  if (appearance.icon !== undefined) {
    if (appearance.icon.length > 0) data.setAttribute(DataElementAttribute.BUFF_ICON, appearance.icon);
    else data.removeAttribute(DataElementAttribute.BUFF_ICON);
  }
}
