import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/**
 * Whether the card that opens on a piece shows its memo rather than its status, where it has a memo.
 * Kept in this browser alone, as one reader switching it moves nobody else's card.
 */
@Injectable({ providedIn: 'root' })
export class OverviewMemoPreferenceService {
  private readonly _showsMemo = signal(readLocal(STORAGE_KEYS.overviewMemo) === 'memo');
  readonly showsMemo = this._showsMemo.asReadonly();

  /** Switches the card between the status and the memo, and remembers it. */
  toggle(): void {
    const next = !this._showsMemo();
    this._showsMemo.set(next);
    writeLocal(STORAGE_KEYS.overviewMemo, next ? 'memo' : 'status');
  }
}
