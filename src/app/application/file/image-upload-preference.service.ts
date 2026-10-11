import { Injectable, signal } from '@angular/core';

const EDIT_FIRST_STORAGE_KEY = 'ui-image-edit-first';

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
    try {
      localStorage.setItem(EDIT_FIRST_STORAGE_KEY, editFirst ? 'true' : 'false');
    } catch {
      // Private browsing refuses the write; the choice still holds for this session.
    }
  }
}

function storedEditFirst(): boolean {
  try {
    return localStorage.getItem(EDIT_FIRST_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
