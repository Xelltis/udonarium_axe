/**
 * What a range stands up as, over the flat shape it is drawn with.
 *
 * - `''` — flat, as every range was before it could stand up
 * - `column` — the flat shape raised straight up through a height, whatever the shape
 * - `sphere` — a ball as wide as a circle reaches, for a circle only
 * - `cone` — a round cone opening from its tip as far and as wide as a fan reaches, for a fan only
 * - `beam` — a square bar as long and as wide as a line, for a line only
 */
export const SOLID_KINDS = ['', 'column', 'sphere', 'cone', 'beam'] as const;

export type SolidKind = (typeof SOLID_KINDS)[number];

/** How tall a range stands as a column until it is told otherwise, in its squares. */
export const DEFAULT_SOLID_HEIGHT = 3;
/** How far round the piece it follows a sphere or a column may be put until told otherwise, in its squares. */
export const DEFAULT_SOLID_REACH = 6;

/** The solid kinds that point somewhere, from a tip, rather than standing round a point. */
const AIMED_KINDS: readonly SolidKind[] = ['cone', 'beam'];

/** The one flat shape each round kind belongs to; a column fits them all. */
const SHAPE_OF_KIND: Partial<Record<SolidKind, string>> = {
  sphere: 'CIRCLE',
  cone: 'CORN',
  beam: 'LINE',
};

/** The value as a solid kind, flat for anything else, so that a value nobody knows reads as flat. */
export function asSolidKind(value: unknown): SolidKind {
  return typeof value === 'string' && (SOLID_KINDS as readonly string[]).includes(value) ? (value as SolidKind) : '';
}

/** Whether a range of the flat shape can stand up as the kind. */
export function solidFitsShape(kind: SolidKind, type: string): boolean {
  if (kind === '' || kind === 'column') return true;
  return SHAPE_OF_KIND[kind] === type;
}

/** The kinds a range of the flat shape can stand up as, flat first. */
export function solidKindsFor(type: string): SolidKind[] {
  return SOLID_KINDS.filter((kind) => solidFitsShape(kind, type));
}

/**
 * The kind a range stands up as once its flat shape is known: the kind it was set to where it fits
 * that shape, and a column otherwise, which every shape can be, so that changing the shape of a solid
 * range leaves it standing.
 */
export function solidKindOf(kind: SolidKind, type: string): SolidKind {
  if (kind === '') return '';
  return solidFitsShape(kind, type) ? kind : 'column';
}

/** Whether the kind points from a tip towards a point aimed at. */
export function isAimedSolid(kind: SolidKind): kind is 'cone' | 'beam' {
  return AIMED_KINDS.includes(kind);
}
