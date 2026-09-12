import { Injectable, signal } from '@angular/core';

/** Where a piece being sent up or down stands, and how far off the ground it has got to. */
export interface AltitudeGuide {
  readonly identifier: string;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly altitude: number;
  readonly gridSize: number;
}

/**
 * The height a piece is being held at while somebody is putting it there.
 *
 * A piece off the ground reads the same whether it is floating or standing on something out
 * of sight behind it, so while the height is being set the table draws what it is being set
 * to. It lasts as long as the hand on the piece does; nothing about it is kept or sent.
 */
@Injectable({ providedIn: 'root' })
export class AltitudeGuideService {
  private readonly shown = signal<AltitudeGuide | null>(null);
  readonly guide = this.shown.asReadonly();

  show(guide: AltitudeGuide): void {
    this.shown.set(guide);
  }

  hide(identifier?: string): void {
    if (identifier && this.shown()?.identifier !== identifier) return;
    this.shown.set(null);
  }
}
