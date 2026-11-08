import type { TableWorldCap, TableWorldWall } from '@axe/domain/tabletop/world/table-world';

/** How many cells along each side a chunk of the table's faces covers. */
export const CHUNK_CELLS = 16;

/** The faces of one block, or of the table's walls, and the chunk they are drawn in. */
export interface OwnedFaces {
  readonly chunk: string;
  readonly walls: TableWorldWall[];
  readonly caps: TableWorldCap[];
}

/**
 * The faces of the table sorted by what they belong to, a block or the table itself, as the part
 * of a face's name before its colon. Each owner's faces are drawn in the chunk its first point
 * stands in, so a block is never split between two.
 */
export function facesByOwner(
  walls: readonly TableWorldWall[],
  caps: readonly TableWorldCap[],
  gridSize: number
): Map<string, OwnedFaces> {
  const chunkPx = CHUNK_CELLS * gridSize;
  const owned = new Map<string, OwnedFaces>();
  const entryFor = (id: string, x: number, y: number) => {
    const owner = id.slice(0, id.indexOf(':'));
    let entry = owned.get(owner);
    if (!entry) {
      entry = { chunk: `${Math.floor(x / chunkPx)},${Math.floor(y / chunkPx)}`, walls: [], caps: [] };
      owned.set(owner, entry);
    }
    return entry;
  };
  for (const wall of walls) entryFor(wall.id, wall.ax, wall.ay).walls.push(wall);
  for (const cap of caps) entryFor(cap.id, cap.outline[0].x, cap.outline[0].y).caps.push(cap);
  return owned;
}

/** Each chunk's owners, each with a signature that changes whenever any of its faces does. */
export function chunkSignatures(owned: ReadonlyMap<string, OwnedFaces>): Map<string, Map<string, string>> {
  const chunks = new Map<string, Map<string, string>>();
  for (const [owner, entry] of owned) {
    const signatures = chunks.get(entry.chunk) ?? new Map<string, string>();
    signatures.set(owner, JSON.stringify([entry.walls, entry.caps]));
    chunks.set(entry.chunk, signatures);
  }
  return chunks;
}

/** The chunks to build again: those whose owners came, went, or changed, between two layouts. */
export function changedChunks(
  before: ReadonlyMap<string, ReadonlyMap<string, string>>,
  now: ReadonlyMap<string, ReadonlyMap<string, string>>
): string[] {
  return [...new Set([...before.keys(), ...now.keys()])].filter(
    (key) => !sameSignatures(before.get(key), now.get(key))
  );
}

function sameSignatures(
  before: ReadonlyMap<string, string> | undefined,
  now: ReadonlyMap<string, string> | undefined
): boolean {
  if (!before || !now) return before === now;
  if (before.size !== now.size) return false;
  for (const [owner, signature] of now) if (before.get(owner) !== signature) return false;
  return true;
}
