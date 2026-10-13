/**
 * One way a room lets a piece move in a turn: as far as its movement times `factor`, and no further
 * than `capM` metres where a cap is written.
 *
 * The name is the room's own; the plain kind a room has before it writes any is nameless.
 */
export interface MoveKind {
  readonly name: string;
  readonly factor: number;
  readonly capM: number | null;
}

/** The one kind a room has before it writes its own: as far as the movement says. */
export const PLAIN_MOVE_KIND: MoveKind = { name: '', factor: 1, capM: null };

/**
 * Reads the kinds a room writes as `name:factor:cap` rows separated by commas, the cap left empty
 * for none. A row with no name, a factor that is not a positive number, a cap that is written but
 * is not one, and a name already given are left out; nothing readable gives the plain kind alone.
 */
export function parseMoveKinds(text: string): MoveKind[] {
  const kinds: MoveKind[] = [];
  for (const written of text.split(/[,、\n]/)) {
    const parts = written.split(/[:：]/).map((part) => part.trim());
    if (parts.length < 2 || parts.length > 3) continue;
    const [name, factorText, capText = ''] = parts;
    const factor = Number(factorText);
    if (name.length < 1 || factorText.length < 1 || !Number.isFinite(factor) || factor <= 0) continue;
    const cap = capText.length > 0 ? Number(capText) : null;
    if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) continue;
    if (kinds.some((kind) => kind.name === name)) continue;
    kinds.push({ name, factor, capM: cap });
  }
  return kinds.length > 0 ? kinds : [PLAIN_MOVE_KIND];
}

/** The kind of that name among a room's kinds, or the first where there is none by that name. */
export function moveKindNamed(kinds: readonly MoveKind[], name: string | null | undefined): MoveKind {
  return kinds.find((kind) => kind.name === name) ?? kinds[0] ?? PLAIN_MOVE_KIND;
}

/**
 * Added before a count of cells is rounded down, so a length a binary fraction cannot hold exactly
 * is not read as a cell short.
 */
const ROUNDING_ALLOWANCE = 1e-9;

/**
 * How many cells a piece with `walk` cells of movement goes by a kind: its movement times the
 * factor, held to the cap where there is one, in whole cells of `metresPerCell` metres.
 */
export function cellsByKind(kind: MoveKind, walk: number, metresPerCell: number): number {
  const scaled = walk * kind.factor;
  const capped = kind.capM !== null && metresPerCell > 0 ? Math.min(scaled, kind.capM / metresPerCell) : scaled;
  return Math.max(0, Math.floor(capped + ROUNDING_ALLOWANCE));
}

/**
 * How many cells, not rounded to whole ones, a piece with `walk` cells of movement goes by a kind,
 * for a move measured along a line: its movement times the factor, held to the cap where there is one.
 */
export function lengthByKind(kind: MoveKind, walk: number, metresPerCell: number): number {
  const scaled = walk * kind.factor;
  const capped = kind.capM !== null && metresPerCell > 0 ? Math.min(scaled, kind.capM / metresPerCell) : scaled;
  return Math.max(0, capped);
}
