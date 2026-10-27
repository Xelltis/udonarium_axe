import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { asCompassFace, CompassFace, DEFAULT_COMPASS_FACE } from '@axe/domain/ui/compass-face';

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
    writeLocal(STORAGE_KEYS.compassFace, face);
  }
}

function stored(): CompassFace {
  return asCompassFace(readLocal(STORAGE_KEYS.compassFace)) ?? DEFAULT_COMPASS_FACE;
}
