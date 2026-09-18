import { BuffAppearance } from '@axe/domain/character/buff-appearance';
import {
  BuffModifier,
  clearBuffModifier,
  ParsedBuffModifierRequest,
  readBuffModifier,
  writeBuffModifier,
} from '@axe/domain/character/buff-modifier';
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
    const status = this.status();
    if (!status) return null;
    const before = status.getValue(request.target, request.slot);
    if (before == null) return null;

    const wanted = request.operator === 'set' ? request.amount - before : request.amount;
    status.changeValue(request.target, request.slot, wanted);
    const after = status.getValue(request.target, request.slot);
    const modifier: BuffModifier = {
      target: request.target,
      slot: request.slot,
      operator: request.operator,
      applied: (after ?? before) - before,
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
