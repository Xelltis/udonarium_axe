import { signal } from '@angular/core';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';

/** What multi-select reads of the inventory panel it picks pieces in, and asks of the room. */
export interface InventoryMultiSelectHost {
  /** Whether this seat may edit the table, which every change to the picked pieces takes. */
  canEdit(): boolean;
  /** The identifiers of the rows listed on the tab on view, after the search and the filters. */
  listedIdentifiers(): readonly string[];
  /** The object an identifier names, or nothing where there is none. */
  objectOf(identifier: string): unknown;
  /** Gives every resource of a piece a slider, or takes every one away. */
  setResourceSliders(character: GameCharacter, shown: boolean): void;
  /** Tells the inventory its listing changed, as hiding a piece from it does. */
  notifyInventoryUpdate(): void;
  /** Asks whether that many pieces are to be deleted, resolving true for a yes. */
  confirmDelete(count: number): Promise<boolean>;
  /** Deletes a piece. */
  delete(character: GameCharacter): void;
}

/**
 * The multi-select of an inventory panel: whether it is on, which pieces are picked, and what is
 * done to all of them at once.
 *
 * Leaving multi-select drops every pick. Each change to the picked pieces is ignored for a seat that
 * may not edit the table.
 */
export class InventoryMultiSelect {
  /** The identifiers of the picked pieces. */
  readonly targets = signal(new Set<string>());
  /** Whether multi-select is on. */
  readonly active = signal(false);

  constructor(private readonly host: InventoryMultiSelectHost) {}

  /** Enters or leaves multi-select; leaving drops every pick. */
  toggle(): void {
    if (this.active()) this.targets.set(new Set());
    this.active.update((active) => !active);
  }

  /** Whether any row listed on the tab is picked. */
  anyListedPicked(): boolean {
    const targets = this.targets();
    return this.host.listedIdentifiers().some((identifier) => targets.has(identifier));
  }

  /** Picks or unpicks a piece from its row's checkbox. */
  setPickedFrom(event: Event, piece: { identifier: string }): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.setPicked(piece.identifier, event.target.checked);
  }

  /** Picks a piece that is not picked, and unpicks one that is. */
  flip(identifier: string): void {
    this.setPicked(identifier, !this.targets().has(identifier));
  }

  /** Adds pieces to the picks. */
  pick(identifiers: Iterable<string>): void {
    this.targets.update((current) => new Set([...current, ...identifiers]));
  }

  /** Takes pieces out of the picks. */
  drop(identifiers: ReadonlySet<string>): void {
    this.targets.update((targets) => new Set([...targets].filter((target) => !identifiers.has(target))));
  }

  /** Unpicks every listed row when any of them is picked, and otherwise picks them all. */
  flipListed(): void {
    const listed = this.host.listedIdentifiers();
    const unpick = this.anyListedPicked();
    this.targets.update((current) => {
      const next = new Set(current);
      for (const identifier of listed) {
        if (unpick) next.delete(identifier);
        else next.add(identifier);
      }
      return next;
    });
  }

  /** Moves every picked character to a location for every peer. */
  move(location: string): void {
    if (!this.host.canEdit()) return;
    this.moveTo(this.targets(), location);
  }

  /** Moves the characters among the identifiers to a location for every peer, passing over anything else. */
  moveTo(identifiers: Iterable<string>, location: string): void {
    for (const character of this.charactersOf(identifiers)) character.setLocation(location);
  }

  /** Moves every picked character to a location, leaves multi-select and plays the piece-put sound. */
  moveAndClose(location: string): void {
    this.move(location);
    this.toggle();
    SoundEffect.play(PresetSound.piecePut);
  }

  /** Hides every picked character from the inventory or shows them again, then leaves multi-select. */
  setHideInventory(hide: boolean): void {
    if (!this.host.canEdit()) return;
    for (const character of this.charactersOf(this.targets())) character.hideInventory = hide;
    this.host.notifyInventoryUpdate();
    this.toggle();
    SoundEffect.play(PresetSound.sweep);
  }

  /**
   * Gives every resource of the picked pieces a slider, or takes every one away, whatever the room's
   * default, and leaves multi-select.
   */
  setResourceSliders(shown: boolean): void {
    if (!this.host.canEdit()) return;
    for (const character of this.charactersOf(this.targets())) this.host.setResourceSliders(character, shown);
    this.toggle();
    SoundEffect.play(PresetSound.sweep);
  }

  /** Deletes the picked pieces in the graveyard, leaving multi-select only when something was deleted. */
  async deleteAndClose(): Promise<void> {
    if (!(await this.delete())) return;
    this.toggle();
    SoundEffect.play(PresetSound.sweep);
  }

  /**
   * Deletes the picked pieces that are in the graveyard, once the user confirms.
   *
   * Picks anywhere else are left alone. Resolves false when nothing was deleted: no picks in the
   * graveyard, a refusal, or a seat that may not edit the table.
   */
  async delete(): Promise<boolean> {
    if (!this.host.canEdit()) return false;
    const inGraveyard = this.charactersOf(this.targets()).filter(
      (character) => character.location.name === 'graveyard'
    );
    if (inGraveyard.length < 1) return false;
    if (!(await this.host.confirmDelete(inGraveyard.length))) return false;
    for (const character of inGraveyard) this.host.delete(character);
    return true;
  }

  private setPicked(identifier: string, picked: boolean): void {
    this.targets.update((current) => {
      const next = new Set(current);
      if (picked) next.add(identifier);
      else next.delete(identifier);
      return next;
    });
  }

  private charactersOf(identifiers: Iterable<string>): GameCharacter[] {
    const characters = new Set<GameCharacter>();
    for (const identifier of identifiers) {
      const object = this.host.objectOf(identifier);
      if (object instanceof GameCharacter) characters.add(object);
    }
    return [...characters];
  }
}
