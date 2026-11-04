import { Injectable, signal } from '@angular/core';

/**
 * A part of a piece as a picture: where the picture is, how big the page lays the part out, and
 * where its top left corner lies off the piece's own corner, which is nowhere off it where not given.
 */
export interface PiecePicture {
  readonly url: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/**
 * The pictures of the parts of pieces the page lays out itself, which the canvas draws those pieces
 * with: a note's text, or a mask cut to its open cells, is laid out by the page, so the page's piece
 * takes a picture of its own part and hands the picture here.
 */
@Injectable({ providedIn: 'root' })
export class PiecePicturesService {
  private readonly pictures = signal<ReadonlyMap<string, PiecePicture>>(new Map());
  private pending = 0;

  /** The picture of a piece, or null while there is none. Follows the pictures handed over. */
  pictureOf(identifier: string): PiecePicture | null {
    return this.pictures().get(identifier) ?? null;
  }

  /** How many pictures of pieces are being taken now, each to be handed over once it is. */
  taking(): number {
    return this.pending;
  }

  /** Counts a picture as being taken until it is, or until taking it fails. */
  async whileTaking<T>(picture: Promise<T>): Promise<T> {
    this.pending++;
    try {
      return await picture;
    } finally {
      this.pending--;
    }
  }

  /** Takes the picture of a piece, letting go of the one it had. */
  show(identifier: string, picture: PiecePicture): void {
    const before = this.pictures().get(identifier);
    if (before?.url === picture.url) return;
    const next = new Map(this.pictures());
    next.set(identifier, picture);
    this.pictures.set(next);
    if (before) URL.revokeObjectURL(before.url);
  }

  /** Lets go of the picture of a piece, as once the piece is gone or the page draws it itself again. */
  forget(identifier: string): void {
    const before = this.pictures().get(identifier);
    if (!before) return;
    const next = new Map(this.pictures());
    next.delete(identifier);
    this.pictures.set(next);
    URL.revokeObjectURL(before.url);
  }
}
