import { Injectable } from '@angular/core';
import { generateUuid } from '@axe/core/util/uuid';
import { Hotbar } from '@axe/domain/hotbar/hotbar';

const OWNER_KEY = 'ui-hotbar-owner';

/**
 * Whose bar is on screen, and how to reach it.
 *
 * The reader is named by a mark kept in their browser rather than by the id a connection
 * hands out. The connection's id arrives late and is gone again when a room is left, and a
 * slot written in between would land on a bar nobody could find afterwards.
 */
@Injectable({ providedIn: 'root' })
export class HotbarStoreService {
  readonly ownerId = readOwnerId();

  constructor() {
    Hotbar.ownerId = this.ownerId;
  }

  /** This reader's hotbar, or null while they have never put anything on one. */
  own(): Hotbar | null {
    return Hotbar.forUser(this.ownerId);
  }

  /** This reader's hotbar, made and added to the room the first time it is needed. */
  ensureOwn(): Hotbar | null {
    return Hotbar.ensureForUser(this.ownerId);
  }
}

function readOwnerId(): string {
  try {
    const held = localStorage.getItem(OWNER_KEY);
    if (held && held.length > 0) return held;

    const made = generateUuid();
    localStorage.setItem(OWNER_KEY, made);
    return made;
  } catch {
    /* storage unavailable — the bar still works for as long as the page is open */
    return generateUuid();
  }
}
