import { inject, Injectable } from '@angular/core';
import { hasChosenIconByHand, noteIconChosenByHand } from '@axe/core/storage/icon-chosen-by-hand';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { DEFAULT_CURSOR_IMAGE_IDENTIFIER, DEFAULT_CURSOR_NAME, PeerCursor } from '@axe/domain/peer/peer-cursor';

/** What of a room server's account is put on the seat's cursor. */
export interface AccountLook {
  readonly userId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
}

/**
 * Lends this seat's cursor the name and avatar of the account logged in to a room server, and takes
 * back at logout what is still as lent, so the guest seat does not go on as the account.
 */
@Injectable({ providedIn: 'root' })
export class AccountLookService {
  private readonly imageStorage = inject(ImageStorage);

  /** The account's name and avatar lent to the cursor, empty for what was not lent, to give back on logout. */
  private lent = { name: '', imageIdentifier: '' };

  /**
   * Puts the account's name on the cursor where it still has the default, and its avatar where the
   * icon is still the default and the account has never chosen one by hand in this browser. What is
   * still as lent before, as when the login moves straight on to another account or to a new
   * avatar, counts as the default, and the account's own avatar, chosen again, as lent. An icon
   * found chosen already, as one picked before the login, counts as chosen by hand from then on, so
   * the avatar does not come over it once a reload has taken it back to the default.
   */
  lend(account: AccountLook): void {
    const cursor = PeerCursor.myCursor;
    if (!cursor) return;
    const lent = this.lent;
    const nameFree = cursor.name === DEFAULT_CURSOR_NAME || (lent.name !== '' && cursor.name === lent.name);
    if (nameFree && account.name) {
      cursor.name = account.name;
      lent.name = account.name;
    }
    const icon = cursor.imageIdentifier;
    if (account.avatarUrl && icon === account.avatarUrl) {
      lent.imageIdentifier = icon;
      return;
    }
    const iconLent = lent.imageIdentifier !== '' && icon === lent.imageIdentifier;
    if (icon !== DEFAULT_CURSOR_IMAGE_IDENTIFIER && !iconLent) {
      noteIconChosenByHand(account.userId);
      return;
    }
    if (!account.avatarUrl || hasChosenIconByHand(account.userId)) {
      if (iconLent) cursor.imageIdentifier = DEFAULT_CURSOR_IMAGE_IDENTIFIER;
      lent.imageIdentifier = '';
      return;
    }
    cursor.imageIdentifier = this.imageStorage.add(account.avatarUrl).identifier;
    lent.imageIdentifier = cursor.imageIdentifier;
  }

  /** Puts the defaults back on the cursor where it still has the account's name or avatar as lent. */
  takeBack(): void {
    const cursor = PeerCursor.myCursor;
    const lent = this.lent;
    this.lent = { name: '', imageIdentifier: '' };
    if (!cursor) return;
    if (lent.name && cursor.name === lent.name) cursor.name = DEFAULT_CURSOR_NAME;
    if (lent.imageIdentifier && cursor.imageIdentifier === lent.imageIdentifier) {
      cursor.imageIdentifier = DEFAULT_CURSOR_IMAGE_IDENTIFIER;
    }
  }
}
