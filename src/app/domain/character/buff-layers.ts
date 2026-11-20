import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

/**
 * A layer laid on an item that holds words or a choice: words a buff writes over what is beneath, a
 * number a buff moves what is beneath by, or words written into the item otherwise, by hand or by a
 * command, over the layers laid before them. Each is laid at its order; two at one order, as two
 * devices laying one each at once may, go by `tie`, the same way on every device.
 */
export type ItemLayer =
  | { readonly kind: 'words'; readonly text: string; readonly order: number; readonly tie: string }
  | { readonly kind: 'move'; readonly by: number; readonly order: number; readonly tie: string }
  | { readonly kind: 'hand'; readonly text: string; readonly order: number; readonly tie: string };

/** The number words hold, read as a line of text is read for a number: its leading whole number, or none. */
export function numberIn(text: string): number | null {
  const number = parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

/**
 * What an item shows with layers laid on its ground, the lowest first: words put what they say in
 * place of what is beneath, a move adds to the number beneath where there is one and leaves words
 * that hold none as they are.
 */
export function composeLayers(ground: string, layers: readonly ItemLayer[]): string {
  return [...layers]
    .sort((a, b) => a.order - b.order || (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0))
    .reduce((beneath, layer) => {
      if (layer.kind !== 'move') return layer.text;
      const number = numberIn(beneath);
      return number === null ? beneath : String(number + layer.by);
    }, ground);
}

/** What an item holds, as text: a resource's amount left, anything else's value. */
export function heldTextOf(item: DataElement): string {
  return `${item.type === DataElementType.NUMBER_RESOURCE ? item.currentValue : item.value}`;
}

/**
 * Writes one of the records an item keeps of the buffs, a note after a `>` so a note of nothing is
 * told from none, or wipes it for null, only where that changes what it holds.
 */
function keepNote(item: DataElement, name: string, text: string | null): void {
  const held = `${item.getAttribute(name)}`;
  if (text === null) {
    if (held !== '') item.removeAttribute(name);
  } else if (held !== `>${text}`) {
    item.setAttribute(name, `>${text}`);
  }
}

/** A note an item keeps after a `>`, or null where it keeps none. */
function readNote(item: DataElement, name: string): string | null {
  const noted = item.getAttribute(name) ?? '';
  return noted.startsWith('>') ? noted.slice(1) : null;
}

/** Notes on an item what it holds now as what the buffs left there. */
export function noteLeftByBuffs(item: DataElement): void {
  keepNote(item, DataElementAttribute.BUFF_LEFT, heldTextOf(item));
}

/**
 * Whether an item was written into otherwise, by hand or by a command, since buffs last left what
 * they did in it: it holds anything but what was noted then. Never for one no buff has touched.
 */
export function isWrittenOtherwise(item: DataElement): boolean {
  const noted = readNote(item, DataElementAttribute.BUFF_LEFT);
  return noted !== null && heldTextOf(item) !== noted;
}

/** Whether buffs have noted on an item what they left in it, as on one a buff writes words into. */
export function isNotedByBuffs(item: DataElement): boolean {
  return readNote(item, DataElementAttribute.BUFF_LEFT) !== null;
}

/** What an item holds beneath the layers laid on it, or null where none is kept, as none stands. */
export function groundOf(item: DataElement): string | null {
  return readNote(item, DataElementAttribute.BUFF_GROUND);
}

/** The words written into an item otherwise over the layers laid before them, as a layer; null for none. */
export function handOf(item: DataElement): ItemLayer | null {
  const text = readNote(item, DataElementAttribute.BUFF_HAND);
  if (text === null) return null;
  const order = Number(item.getAttribute(DataElementAttribute.BUFF_HAND_ORDER) ?? '');
  return { kind: 'hand', text, order: Number.isFinite(order) ? order : 0, tie: '' };
}

/** Whether words were written into an item otherwise over buffs' layers, which keeps a made item the sheet's. */
export function holdsHandWords(item: DataElement): boolean {
  return handOf(item) !== null;
}

/**
 * Takes in an item before a change lays its layers again: words written into it otherwise since the
 * buffs last left it become the layer laid at `order()`, over every layer laid before them and beneath
 * any laid after, and the ground is found where none is kept, as what the item holds beneath the
 * layers standing. A move a version before layers laid, which shows in what the item holds, is worked
 * back out of it.
 */
export function takeInItem(item: DataElement, standing: readonly ItemLayer[], order: () => number): void {
  if (isWrittenOtherwise(item)) {
    const text = heldTextOf(item);
    keepNote(item, DataElementAttribute.BUFF_HAND, text);
    item.setAttribute(DataElementAttribute.BUFF_HAND_ORDER, String(order()));
  }
  if (groundOf(item) !== null) return;
  const held = heldTextOf(item);
  const moved = standing.reduce((sum, layer) => sum + (layer.kind === 'move' ? layer.by : 0), 0);
  const number = numberIn(held);
  const wordsStand = standing.some((layer) => layer.kind === 'words') || handOf(item) !== null;
  keepNote(
    item,
    DataElementAttribute.BUFF_GROUND,
    wordsStand || moved === 0 || number === null ? held : String(number - moved)
  );
}

/**
 * What an item taken in shows now, its ground with the layers standing and the words written
 * otherwise laid on it; what it holds where it was never taken in.
 */
export function shownOn(item: DataElement, standing: readonly ItemLayer[]): string {
  const ground = groundOf(item);
  if (ground === null) return heldTextOf(item);
  const hand = handOf(item);
  return composeLayers(ground, hand ? [...standing, hand] : standing);
}

/**
 * Lays an item out again from its ground and the layers standing on it, writes what it shows into it
 * and into the items its name stands for with it, as a number into one holding a number, and notes
 * that as what the buffs left. Once no
 * buff's layer stands, what it shows is its own: the ground goes, and words written otherwise stay
 * laid, so a buff given back from before them stays beneath them.
 */
export function settleItem(items: readonly DataElement[], standing: readonly ItemLayer[]): void {
  const [item] = items;
  if (!item || groundOf(item) === null) return;
  const shown = shownOn(item, standing);
  for (const each of items) {
    if (heldTextOf(each) === shown) continue;
    const resource = each.type === DataElementType.NUMBER_RESOURCE;
    const held = resource ? each.currentValue : each.value;
    const written =
      typeof held === 'number' && shown.trim() !== '' && Number.isFinite(Number(shown)) ? Number(shown) : shown;
    if (resource) each.currentValue = written;
    else each.value = written;
  }
  noteLeftByBuffs(item);
  if (standing.length < 1) keepNote(item, DataElementAttribute.BUFF_GROUND, null);
}

/**
 * Moves the ground of an item taken in by a number, as a move left in place as its buff goes is
 * left: where the ground holds a number, and otherwise not at all.
 */
export function moveGround(item: DataElement, by: number): void {
  const ground = groundOf(item);
  const number = ground === null ? null : numberIn(ground);
  if (number === null || by === 0) return;
  keepNote(item, DataElementAttribute.BUFF_GROUND, String(number + by));
}
