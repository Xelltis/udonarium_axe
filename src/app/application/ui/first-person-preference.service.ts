import { Injectable, signal } from '@angular/core';

export const FIRST_PERSON_PIECE_STORAGE_KEY = 'ui-first-person-piece';

@Injectable({ providedIn: 'root' })
export class FirstPersonPreferenceService {
  readonly piece = signal<string>(stored());

  choose(piece: string): void {
    const chosen = typeof piece === 'string' ? piece.trim() : '';
    this.piece.set(chosen);
    try {
      if (chosen) localStorage.setItem(FIRST_PERSON_PIECE_STORAGE_KEY, chosen);
      else localStorage.removeItem(FIRST_PERSON_PIECE_STORAGE_KEY);
    } catch {
      // Private browsing refuses the write; the choice still holds for this session.
    }
  }

  forget(): void {
    this.choose('');
  }
}

function stored(): string {
  try {
    const held = localStorage.getItem(FIRST_PERSON_PIECE_STORAGE_KEY);
    return typeof held === 'string' ? held.trim() : '';
  } catch {
    return '';
  }
}
