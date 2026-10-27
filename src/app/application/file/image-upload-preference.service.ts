import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/**
 * Whether pictures chosen to upload open in the image editor before they are added.
 *
 * Kept in this browser rather than in the room, since it is a way of working: one player crops
 * every portrait, another adds a folder of maps as they are. Left off, pictures go straight in as
 * they always have, and only one over the size limit opens in the editor to be made to fit.
 */
@Injectable({ providedIn: 'root' })
export class ImageUploadPreferenceService {
  private readonly stored = signal(storedEditFirst());

  /** Whether every picture chosen opens in the editor first. */
  readonly editFirst = this.stored.asReadonly();

  /** Sets whether every picture chosen opens in the editor first, and writes it down. */
  setEditFirst(editFirst: boolean): void {
    this.stored.set(editFirst);
    writeLocal(STORAGE_KEYS.imageEditFirst, editFirst ? 'true' : 'false');
  }
}

function storedEditFirst(): boolean {
  return readLocal(STORAGE_KEYS.imageEditFirst) === 'true';
}
