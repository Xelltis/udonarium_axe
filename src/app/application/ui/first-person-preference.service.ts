import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

@Injectable({ providedIn: 'root' })
export class FirstPersonPreferenceService {
  readonly piece = signal<string>(stored());

  choose(piece: string): void {
    const chosen = typeof piece === 'string' ? piece.trim() : '';
    this.piece.set(chosen);
    writeLocal(STORAGE_KEYS.firstPersonPiece, chosen || null);
  }

  forget(): void {
    this.choose('');
  }
}

function stored(): string {
  const held = readLocal(STORAGE_KEYS.firstPersonPiece);
  return typeof held === 'string' ? held.trim() : '';
}
