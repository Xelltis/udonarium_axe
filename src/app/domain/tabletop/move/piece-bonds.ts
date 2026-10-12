/** A piece as the bonds between pieces see it. */
export interface BondedPiece {
  readonly id: string;
  /** The piece holding on to it, or empty. */
  readonly grabbedBy?: string;
  /** The piece it rides, or empty. */
  readonly ridingOn?: string;
}

/**
 * The piece a piece is bound to, and so goes where it goes: the one holding on to it, or else the one
 * it rides. Empty for a piece bound to nothing, or to a piece not among those counted.
 */
export function boundTo(piece: BondedPiece, counted: ReadonlySet<string>): string {
  const holder = piece.grabbedBy ?? '';
  if (holder !== '' && holder !== piece.id && counted.has(holder)) return holder;
  const mount = piece.ridingOn ?? '';
  if (mount !== '' && mount !== piece.id && counted.has(mount)) return mount;
  return '';
}

/**
 * The pieces bound together with a piece, it among them: the one it is bound to, the ones bound to
 * it, and so on along every bond, in the order the pieces are given.
 */
export function bondGroupOf(id: string, pieces: readonly BondedPiece[]): string[] {
  const counted = new Set(pieces.map((piece) => piece.id));
  if (!counted.has(id)) return [];
  const links = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (const piece of pieces) {
    const to = boundTo(piece, counted);
    if (to !== '') link(piece.id, to);
  }
  const group = new Set([id]);
  const waiting = [id];
  while (waiting.length > 0) {
    for (const next of links.get(waiting.pop()!) ?? []) {
      if (group.has(next)) continue;
      group.add(next);
      waiting.push(next);
    }
  }
  return pieces.map((piece) => piece.id).filter((one) => group.has(one));
}

/**
 * The pieces that go where a piece goes: those bound to it, those bound to them, and so on, in the
 * order the pieces are given, it not among them. Not the piece it is itself bound to, which a move
 * of its own leaves behind.
 */
export function boundBelow(id: string, pieces: readonly BondedPiece[]): string[] {
  const counted = new Set(pieces.map((piece) => piece.id));
  const below = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const piece of pieces) {
      if (piece.id === id || below.has(piece.id)) continue;
      const to = boundTo(piece, counted);
      if (to === id || below.has(to)) {
        below.add(piece.id);
        grew = true;
      }
    }
  }
  return pieces.map((piece) => piece.id).filter((one) => below.has(one));
}
