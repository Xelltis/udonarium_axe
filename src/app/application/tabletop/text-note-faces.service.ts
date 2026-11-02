import { Injectable, signal } from '@angular/core';

/** A note's panel as a picture: where the picture is, and how big the page lays the panel out. */
export interface TextNoteFace {
  readonly url: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * The pictures of the notes' panels, which the canvas draws a note with: a note's text is laid out
 * by the page, so the page's note pictures its own panel and hands the picture here.
 */
@Injectable({ providedIn: 'root' })
export class TextNoteFacesService {
  private readonly faces = signal<ReadonlyMap<string, TextNoteFace>>(new Map());

  /** The picture of a note's panel, or null while there is none. Follows the pictures handed over. */
  faceOf(identifier: string): TextNoteFace | null {
    return this.faces().get(identifier) ?? null;
  }

  /** Takes the picture of a note's panel, letting go of the one it had. */
  show(identifier: string, face: TextNoteFace): void {
    const before = this.faces().get(identifier);
    if (before?.url === face.url) return;
    const next = new Map(this.faces());
    next.set(identifier, face);
    this.faces.set(next);
    if (before) URL.revokeObjectURL(before.url);
  }

  /** Lets go of the picture of a note's panel, as once the note is gone. */
  forget(identifier: string): void {
    const before = this.faces().get(identifier);
    if (!before) return;
    const next = new Map(this.faces());
    next.delete(identifier);
    this.faces.set(next);
    URL.revokeObjectURL(before.url);
  }
}
