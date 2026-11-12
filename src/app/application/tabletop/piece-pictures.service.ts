import { Injectable, signal, type WritableSignal } from '@angular/core';
import type { PickPoint2 } from '@axe/domain/tabletop/pick/pick-geometry';

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
  /**
   * The parts of the picture a press takes the piece by, as polygons in its pixels from its top left
   * corner, where only what is painted takes it; the whole picture where not given.
   */
  readonly pickAreas?: readonly (readonly PickPoint2[])[];
}

/**
 * The pictures of the parts of pieces the page lays out itself, which the canvas draws those pieces
 * with: a note's text, or a mask cut to its open cells, is laid out by the page, so the page's piece
 * takes a picture of its own part and hands the picture here.
 */
@Injectable({ providedIn: 'root' })
export class PiecePicturesService {
  private readonly held = new Map<string, PiecePicture>();
  /**
   * The picture of each piece something has read, followed piece by piece, so that taking one
   * piece's picture again wakes only what reads that piece's.
   */
  private readonly followed = new Map<string, WritableSignal<PiecePicture | null>>();
  private pending = 0;

  /** The picture of a piece, or null while there is none. Follows the pictures handed over for that piece. */
  pictureOf(identifier: string): PiecePicture | null {
    let one = this.followed.get(identifier);
    if (!one) {
      one = signal(this.held.get(identifier) ?? null);
      this.followed.set(identifier, one);
    }
    return one();
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
    const before = this.held.get(identifier);
    if (before?.url === picture.url) return;
    this.held.set(identifier, picture);
    this.followed.get(identifier)?.set(picture);
    if (before) URL.revokeObjectURL(before.url);
  }

  /** Lets go of the picture of a piece, as once the piece is gone or the page draws it itself again. */
  forget(identifier: string): void {
    const before = this.held.get(identifier);
    if (!before) return;
    this.held.delete(identifier);
    this.followed.get(identifier)?.set(null);
    URL.revokeObjectURL(before.url);
  }
}
