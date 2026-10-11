export interface FirstPersonTargetContext {
  shared: string;
  seat: string;
  isGameMaster: boolean;
  gmPresent: boolean;
}

export interface FirstPersonTarget {
  piece: string;
  shared: boolean;
}

export function sharedViewPieceOf(table: { sharedViewPiece?: unknown } | null | undefined): string {
  const held = table?.sharedViewPiece;
  return typeof held === 'string' ? held.trim() : '';
}

export function firstPersonTarget(
  context: FirstPersonTargetContext,
  usable: (piece: string) => boolean
): FirstPersonTarget | null {
  const shared = context.shared.trim();
  if (shared && !context.isGameMaster && context.gmPresent && usable(shared)) {
    return { piece: shared, shared: true };
  }
  const seat = context.seat.trim();
  if (seat && usable(seat)) return { piece: seat, shared: false };
  return null;
}
