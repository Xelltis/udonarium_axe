import { Injectable, signal } from '@angular/core';
import { asCompassFace, CompassFace, DEFAULT_COMPASS_FACE } from '@axe/domain/ui/compass-face';

/** Where this screen's choice of face is kept. */
export const COMPASS_FACE_STORAGE_KEY = 'axe.compass.face';

/**
 * Which face this screen draws its compass with.
 *
 * Kept in the browser rather than in the room: what a compass looks like is a matter of taste,
 * and one player wanting brass and enamel does not hand it to everybody else.
 */
@Injectable({ providedIn: 'root' })
export class CompassFaceService {
  readonly face = signal<CompassFace>(stored());

  /** Chooses the face and writes it down in this browser. */
  choose(face: CompassFace): void {
    this.face.set(face);
    try {
      localStorage.setItem(COMPASS_FACE_STORAGE_KEY, face);
    } catch {
      // A browser set to block site data still has to draw something; the choice holds for now.
    }
  }
}

function stored(): CompassFace {
  try {
    return asCompassFace(localStorage.getItem(COMPASS_FACE_STORAGE_KEY)) ?? DEFAULT_COMPASS_FACE;
  } catch {
    return DEFAULT_COMPASS_FACE;
  }
}
