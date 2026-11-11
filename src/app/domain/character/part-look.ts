import { isGaugeSpent, selectPieceGauges } from '@axe/domain/character/piece-gauge';
import type { DataElement } from '@axe/domain/data/data-element';

/**
 * Where a part's own picture is laid over its body's: its middle across and down the body's
 * picture, and its width, each as a share of the body's picture, and before or behind the body's
 * picture and the other parts' by its order, the higher over the lower, the body's picture at 0.
 */
export interface PartLayer {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly order: number;
}

/** Where a part's picture is first laid: in the middle of its body's, half as wide, over it. */
export const DEFAULT_PART_LAYER: PartLayer = { x: 0.5, y: 0.5, width: 0.5, order: 1 };

/** The narrowest and widest a part's picture may be laid, as a share of its body's picture. */
const LAYER_WIDTH_RANGE = { min: 0.02, max: 4 } as const;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A part's layer as written down, or null for one written as none or as anything that cannot be read. */
export function partLayerOf(written: string): PartLayer | null {
  if (!written) return null;
  try {
    const read = JSON.parse(written) as Partial<Record<keyof PartLayer, unknown>>;
    if (!read || typeof read !== 'object') return null;
    return {
      x: finite(read.x, DEFAULT_PART_LAYER.x),
      y: finite(read.y, DEFAULT_PART_LAYER.y),
      width: Math.min(
        LAYER_WIDTH_RANGE.max,
        Math.max(LAYER_WIDTH_RANGE.min, finite(read.width, DEFAULT_PART_LAYER.width))
      ),
      order: Math.round(finite(read.order, DEFAULT_PART_LAYER.order)),
    };
  } catch {
    return null;
  }
}

/** A part's layer as it is written down, its shares to four places. */
export function writePartLayer(layer: PartLayer): string {
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return JSON.stringify({ x: round(layer.x), y: round(layer.y), width: round(layer.width), order: layer.order });
}

/**
 * The piece of its body's picture a part stands for, painted over the picture as the cells of a
 * square grid laid over it: `cells[row * size + column]` is 1 where the part is.
 */
export interface PartMask {
  readonly size: number;
  readonly cells: Uint8Array;
}

/** How many cells across and down the grid a part's piece of its body's picture is painted on. */
export const PART_MASK_SIZE = 96;

/** A grid with nothing painted on it. */
export function emptyPartMask(size = PART_MASK_SIZE): PartMask {
  return { size, cells: new Uint8Array(size * size) };
}

/**
 * A part's piece of its body's picture as written down, `size:` and then the runs of cells along the
 * rows, unpainted first, in base 36; null for none, nothing painted, or anything that cannot be read.
 */
export function partMaskOf(written: string): PartMask | null {
  const match = /^(\d{1,3}):([0-9a-z.]*)$/.exec(written);
  if (!match) return null;
  const size = Number(match[1]);
  if (!(size > 0)) return null;
  const mask = emptyPartMask(size);
  let at = 0;
  let painted = false;
  let any = false;
  for (const run of match[2] ? match[2].split('.') : []) {
    const length = parseInt(run, 36);
    if (!Number.isFinite(length) || length < 0 || at + length > mask.cells.length) return null;
    if (painted) {
      mask.cells.fill(1, at, at + length);
      any ||= length > 0;
    }
    at += length;
    painted = !painted;
  }
  return any ? mask : null;
}

/** A part's piece of its body's picture as it is written down; empty where nothing is painted. */
export function writePartMask(mask: PartMask): string {
  const runs: number[] = [];
  let painted = 0;
  let length = 0;
  for (const cell of mask.cells) {
    if (cell === painted) {
      length++;
      continue;
    }
    runs.push(length);
    painted = cell;
    length = 1;
  }
  runs.push(length);
  if (runs.length < 2) return '';
  return `${mask.size}:${runs.map((run) => run.toString(36)).join('.')}`;
}

/**
 * Paints a round brush onto a part's piece of its body's picture, or wipes it off: centred at a point
 * across and down the picture and as wide across as given, each as a share of the picture.
 */
export function paintPartMask(mask: PartMask, x: number, y: number, width: number, paint: boolean): PartMask {
  const cells = new Uint8Array(mask.cells);
  const radius = (width * mask.size) / 2;
  const cx = x * mask.size;
  const cy = y * mask.size;
  for (let row = Math.max(0, Math.floor(cy - radius)); row < Math.min(mask.size, Math.ceil(cy + radius)); row++) {
    for (
      let column = Math.max(0, Math.floor(cx - radius));
      column < Math.min(mask.size, Math.ceil(cx + radius));
      column++
    ) {
      if (Math.hypot(column + 0.5 - cx, row + 0.5 - cy) <= radius) cells[row * mask.size + column] = paint ? 1 : 0;
    }
  }
  return { size: mask.size, cells };
}

/** Whether a point across and down its body's picture, as shares of it, lies on a part's painted piece. */
export function maskCovers(mask: PartMask, x: number, y: number): boolean {
  if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return false;
  return mask.cells[Math.floor(y * mask.size) * mask.size + Math.floor(x * mask.size)] === 1;
}

/**
 * The faces of its body's model a part stands for: for each mesh of the model, by its place in the
 * model, the triangles of it, by their place in the mesh.
 */
export type PartFaces = ReadonlyMap<number, ReadonlySet<number>>;

/**
 * A part's faces of its body's model as written down, each mesh as `mesh:` and its triangles as
 * runs `first-last` or single ones, joined by `,`, the meshes joined by `;`; empty for none.
 */
export function partFacesOf(written: string): PartFaces {
  const faces = new Map<number, Set<number>>();
  for (const entry of written.split(';')) {
    const match = /^(\d+):([\d,-]+)$/.exec(entry.trim());
    if (!match) continue;
    const triangles = faces.get(Number(match[1])) ?? new Set<number>();
    for (const run of match[2].split(',')) {
      const [first, last] = run.split('-').map(Number);
      if (!Number.isInteger(first)) continue;
      const end = Number.isInteger(last) && last >= first ? last : first;
      if (end - first > 1_000_000) continue;
      for (let triangle = first; triangle <= end; triangle++) triangles.add(triangle);
    }
    if (triangles.size > 0) faces.set(Number(match[1]), triangles);
  }
  return faces;
}

/** A part's faces of its body's model as they are written down; empty where it has none. */
export function writePartFaces(faces: PartFaces): string {
  const meshes: string[] = [];
  for (const mesh of [...faces.keys()].sort((a, b) => a - b)) {
    const triangles = [...(faces.get(mesh) ?? [])].sort((a, b) => a - b);
    if (triangles.length < 1) continue;
    const runs: string[] = [];
    let first = triangles[0];
    let last = first;
    for (const triangle of triangles.slice(1)) {
      if (triangle === last + 1) {
        last = triangle;
        continue;
      }
      runs.push(first === last ? `${first}` : `${first}-${last}`);
      first = last = triangle;
    }
    runs.push(first === last ? `${first}` : `${first}-${last}`);
    meshes.push(`${mesh}:${runs.join(',')}`);
  }
  return meshes.join(';');
}

/** The faces of several parts together, as the faces their body leaves out where they are lost. */
export function joinedPartFaces(all: readonly PartFaces[]): PartFaces {
  const joined = new Map<number, Set<number>>();
  for (const faces of all) {
    for (const [mesh, triangles] of faces) {
      const set = joined.get(mesh) ?? new Set<number>();
      for (const triangle of triangles) set.add(triangle);
      joined.set(mesh, set);
    }
  }
  return joined;
}

/** A part as whether it is lost reads it. */
export interface LosablePart {
  readonly detailDataElement: DataElement | null | undefined;
  readonly downed: string;
}

/**
 * Whether a part is lost, as a head cut off or an arm broken: the first resource it shows on its
 * piece, as its life most often is, has run out, or it is marked down. Healed, or the mark taken off,
 * it is whole again.
 */
export function isPartLost(part: LosablePart): boolean {
  if (part.downed === '1') return true;
  const first = part.detailDataElement ? selectPieceGauges(part.detailDataElement)[0] : undefined;
  return first ? isGaugeSpent(first.current, first.max, first.inverted) : false;
}

/** A part of a body as the place on the body's picture a press lands on reads it. */
export interface PartOnPicture {
  readonly id: string;
  readonly layer: PartLayer | null;
  /** How tall its own picture is for its width, where it has one laid over the body's. */
  readonly aspect: number;
  readonly mask: PartMask | null;
  readonly lost: boolean;
  /** How tall the body's picture is for its width. */
  readonly bodyAspect: number;
}

/**
 * Whether anything is drawn at a point of a body's own picture, and of each part's own, from 0 to 1
 * across and down it: null where that is not known, as for a picture not read yet.
 */
export interface PartPictureOpacity {
  readonly body: (x: number, y: number) => boolean | null;
  readonly part: (id: string, u: number, v: number) => boolean | null;
}

/** Nothing known of what is drawn where, which leaves each picture laid to be landed on all over its box. */
const OPACITY_UNKNOWN: PartPictureOpacity = { body: () => null, part: () => null };

/**
 * The part a point across and down its body's picture, as shares of it, lands on: the picture laid
 * over the body's highest there, then the piece painted on the body's picture, then a picture laid
 * behind it where the body's own picture does not hide it; null where it lands on none. A picture
 * laid is landed on only where it is drawn, its clear margins passing the press on, where `opacity`
 * knows that. A lost part is not there to land on.
 */
export function partAtPicturePoint(
  parts: readonly PartOnPicture[],
  x: number,
  y: number,
  opacity: PartPictureOpacity = OPACITY_UNKNOWN
): string | null {
  const shows = (part: PartOnPicture) => {
    const layer = part.layer!;
    const halfWidth = layer.width / 2;
    const halfHeight = (layer.width * part.aspect) / part.bodyAspect / 2;
    if (Math.abs(x - layer.x) > halfWidth || Math.abs(y - layer.y) > halfHeight) return false;
    const u = (x - layer.x + halfWidth) / (2 * halfWidth);
    const v = (y - layer.y + halfHeight) / (2 * halfHeight);
    return opacity.part(part.id, u, v) !== false;
  };
  const standing = parts.filter((part) => !part.lost);
  const layered = standing.filter((part) => part.layer !== null).sort((a, b) => b.layer!.order - a.layer!.order);
  const over = layered.find((part) => part.layer!.order > 0 && shows(part));
  if (over) return over.id;
  const painted = standing.find((part) => part.mask !== null && maskCovers(part.mask, x, y));
  if (painted) return painted.id;
  // The body's own picture is drawn over what is laid behind it.
  if (opacity.body(x, y) === true) return null;
  return layered.find((part) => part.layer!.order <= 0 && shows(part))?.id ?? null;
}
