/** How large a face is drawn where there is room for every face at its full size. */
export const DOCK_FACE = 48;
/** The room after a face drawn at its full size. */
export const DOCK_GAP = 10;
/** How large the face of the piece whose turn comes next is drawn where the faces are made smaller. */
export const DOCK_NEXT_FACE = 40;
/** The least a face is drawn at; where even that leaves no room, the faces lie over one another. */
export const DOCK_LEAST_FACE = 28;
/** The room after a face drawn smaller than its full size. */
export const DOCK_TIGHT_GAP = 4;
/** The least room a face lying under the next one shows of itself, so it can still be pointed at. */
export const DOCK_LEAST_STEP = 6;

/** One thing laid along the turn order: a piece, or the heading a side's pieces stand under. */
export type DockEntry =
  | { readonly kind: 'heading'; readonly key: string }
  | { readonly kind: 'piece'; readonly key: string; readonly current: boolean; readonly next: boolean };

/** Where one thing stands along the turn order, in pixels from its start. */
export interface DockSlot {
  readonly key: string;
  readonly kind: 'heading' | 'piece';
  /** Where it begins. */
  readonly at: number;
  /** How long it is drawn: the face's size, or the heading's length. */
  readonly size: number;
  /** How far along it is the one pointed at: up to where the next thing begins, or its own end. */
  readonly reach: number;
  /** Whether the next thing lies over part of it, which leaves room for no marks on it. */
  readonly covered: boolean;
}

export interface DockLayout {
  readonly slots: readonly DockSlot[];
  /** How long the whole turn order stands. */
  readonly length: number;
}

/**
 * Lays the turn order along the room it has, every piece on it. Where there is room, every face is
 * drawn at its full size. Where there is not, the face of the piece whose turn it is keeps its full
 * size and the one whose turn comes next is drawn a little smaller, and the rest share what is left:
 * drawn smaller down to a least size, and past that lying each a little over the one before, so the
 * turn order stands no longer than its room however many pieces there are. The headings of the
 * sides keep their length. Only where even a sliver of every face would not fit does it run past.
 */
export function layDock(entries: readonly DockEntry[], room: number, headingLength: number): DockLayout {
  const pieces = entries.filter((entry) => entry.kind === 'piece');
  const headings = entries.length - pieces.length;
  const roomy = pieces.length * (DOCK_FACE + DOCK_GAP) - DOCK_GAP + headings * headingLength <= room;
  const sizes = new Map<string, { size: number; step: number }>();
  if (roomy) {
    for (const piece of pieces) sizes.set(piece.key, { size: DOCK_FACE, step: DOCK_FACE + DOCK_GAP });
  } else {
    const shared = shareRoom(entries, room, headingLength, true);
    // Where the rest come out no smaller than the next one would be drawn, it is drawn as they are.
    const laid = shared.rest.size >= DOCK_NEXT_FACE ? shareRoom(entries, room, headingLength, false) : shared;
    for (const [key, one] of laid.fixed) sizes.set(key, one);
    for (const piece of pieces) if (!sizes.has(piece.key)) sizes.set(piece.key, laid.rest);
  }

  const placed: { key: string; kind: 'heading' | 'piece'; at: number; size: number; step: number }[] = [];
  let at = 0;
  for (const entry of entries) {
    const { size, step } =
      entry.kind === 'heading' ? { size: headingLength, step: headingLength } : sizes.get(entry.key)!;
    placed.push({ key: entry.key, kind: entry.kind, at, size, step });
    at += step;
  }
  const slots = placed.map((one, index): DockSlot => {
    const following = placed[index + 1];
    const end = one.at + one.size;
    return {
      key: one.key,
      kind: one.kind,
      at: one.at,
      size: one.size,
      reach: following ? following.at - one.at : one.size,
      covered: following !== undefined && following.at < end,
    };
  });
  const last = slots[slots.length - 1];
  return { slots, length: last ? last.at + last.size : 0 };
}

/**
 * The piece a point along the turn order points at, by where it lies rather than by which face is
 * drawn on top: from where a face begins to where the next thing begins, and the last one to the
 * end. A point on a heading, or before the start or past the end, points at none.
 */
export function pieceAt(layout: DockLayout, offset: number): string | null {
  for (const slot of layout.slots) {
    if (offset >= slot.at && offset < slot.at + slot.reach) return slot.kind === 'piece' ? slot.key : null;
  }
  return null;
}

/** The faces given a size of their own where room is short, and the size and step the rest share. */
function shareRoom(
  entries: readonly DockEntry[],
  room: number,
  headingLength: number,
  nextApart: boolean
): { fixed: Map<string, { size: number; step: number }>; rest: { size: number; step: number } } {
  const fixed = new Map<string, { size: number; step: number }>();
  for (const entry of entries) {
    if (entry.kind !== 'piece') continue;
    if (entry.current) fixed.set(entry.key, { size: DOCK_FACE, step: DOCK_FACE + DOCK_TIGHT_GAP * 2 });
    else if (entry.next && nextApart) {
      fixed.set(entry.key, { size: DOCK_NEXT_FACE, step: DOCK_NEXT_FACE + DOCK_TIGHT_GAP });
    }
  }
  // Everything but the last runs on by its step; the last runs only to its own end.
  const last = entries[entries.length - 1];
  const lastShares = last?.kind === 'piece' && !fixed.has(last.key);
  let held = 0;
  let sharing = 0;
  for (const entry of entries) {
    if (entry.kind === 'piece' && !fixed.has(entry.key)) {
      sharing++;
      continue;
    }
    const one = entry.kind === 'heading' ? { size: headingLength, step: headingLength } : fixed.get(entry.key)!;
    held += entry === last ? one.size : one.step;
  }
  const stepping = sharing - (lastShares ? 1 : 0);
  const left = room - held;
  const fitting = sharing > 0 ? (left - stepping * DOCK_TIGHT_GAP) / sharing : DOCK_FACE;
  const size = Math.min(DOCK_FACE, Math.max(DOCK_LEAST_FACE, fitting));
  const step =
    fitting >= DOCK_LEAST_FACE
      ? size + DOCK_TIGHT_GAP
      : stepping > 0
        ? Math.max(DOCK_LEAST_STEP, (left - (lastShares ? size : 0)) / stepping)
        : size;
  return { fixed, rest: { size, step } };
}
