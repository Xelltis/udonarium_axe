import { Injectable, signal } from '@angular/core';

/** The piece somebody has hold of: where it is, how high, and whether height means anything to it. */
export interface HeldPiece {
  readonly identifier: string;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly altitude: number;
  readonly gridSize: number;
  /** Whether height is this piece's to have, which is a thing of the floor rather than a wall. */
  readonly liftable: boolean;
}

/**
 * The piece this reader has hold of, for as long as they have hold of it.
 *
 * What a drag can be turned into - stepping through what the piece can stand on, sending it
 * up into the air - is worth saying while the piece is in hand and worth nothing afterwards,
 * and a piece off the ground reads the same whether it is floating or standing on something
 * out of sight behind it. Both are drawn from here. Nothing about it is kept or sent.
 */
@Injectable({ providedIn: 'root' })
export class HeldPieceService {
  private readonly inHand = signal<HeldPiece | null>(null);
  readonly held = this.inHand.asReadonly();

  take(piece: HeldPiece): void {
    this.inHand.set(piece);
  }

  letGo(identifier?: string): void {
    if (identifier && this.inHand()?.identifier !== identifier) return;
    this.inHand.set(null);
  }
}
