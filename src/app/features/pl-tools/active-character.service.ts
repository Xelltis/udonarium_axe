import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ActiveCharacterService {
  readonly identifier = signal<string | null>(null);

  /** Makes the character with this identifier the one this user's player tools act for. */
  select(identifier: string): void {
    this.identifier.set(identifier);
  }

  /** Leaves the player tools acting for no character. */
  clear(): void {
    this.identifier.set(null);
  }

  /**
   * Makes the character the one the player tools act for, or lets go of it when it already is, from
   * the owned character list.
   */
  toggle(identifier: string): void {
    this.identifier.update((current) => (current === identifier ? null : identifier));
  }

  /** Whether the character with this identifier is the one the player tools act for. */
  isActive(identifier: string): boolean {
    return this.identifier() === identifier;
  }
}
