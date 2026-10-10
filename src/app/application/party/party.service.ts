import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { nextPartyColor, Party, writeAllies } from '@axe/domain/party/party';
import { membersOfParty, membersWithoutParty } from '@axe/domain/party/party-membership';

@Injectable({ providedIn: 'root' })
export class PartyService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  readonly parties = computed<Party[]>(() => {
    this.objectChange.collectionOf(Party.aliasName)();
    const parties = this.objectStore.getObjects<Party>(Party);
    for (const party of parties) this.objectChange.versionOf(party.identifier)();
    return parties;
  });

  readonly characters = computed<GameCharacter[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const characters = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const character of characters) this.objectChange.versionOf(character.identifier)();
    return characters;
  });

  readonly unassigned = computed<GameCharacter[]>(() =>
    membersWithoutParty(
      this.characters(),
      this.parties().map((party) => party.identifier)
    )
  );

  /** The characters assigned to a party. */
  membersOf(partyIdentifier: string): GameCharacter[] {
    return membersOfParty(this.characters(), partyIdentifier);
  }

  /** The party a character belongs to, or null when it has none or its party no longer exists. */
  partyOf(character: GameCharacter): Party | null {
    if (!character.partyIdentifier) return null;
    return this.parties().find((party) => party.identifier === character.partyIdentifier) ?? null;
  }

  /** The other members of a character's party. Empty when it belongs to none. */
  companionsOf(character: GameCharacter): GameCharacter[] {
    const party = this.partyOf(character);
    if (!party) return [];
    return this.membersOf(party.identifier).filter((member) => member.identifier !== character.identifier);
  }

  /** Creates a party in the room, coloured with the next colour no party is using yet. */
  create(name: string): Party {
    const party = new Party();
    party.name = name;
    party.color = nextPartyColor(this.parties().map((existing) => existing.color));
    party.initialize();
    return party;
  }

  /** Renames a party, and tells the views following it at once. */
  rename(party: Party, name: string): void {
    party.name = name;
    this.objectChange.notifyChanged(party.identifier);
  }

  /** Changes the colour a party is marked with, and tells the views following it at once. */
  recolor(party: Party, color: string): void {
    party.color = color;
    this.objectChange.notifyChanged(party.identifier);
  }

  /** Deletes a party from the room, leaving its members without one first. */
  remove(party: Party): void {
    for (const character of this.membersOf(party.identifier)) this.assign(character, '');
    for (const other of this.parties()) {
      if (other.identifier === party.identifier) continue;
      if (other.alliedWith.includes(party.identifier)) this.stand(other, party.identifier, false);
    }
    party.destroy();
  }

  /** Whether two parties stand together, either of them saying so being enough. */
  standsWith(party: Party, other: string): boolean {
    if (other.length < 1 || other === party.identifier) return false;
    if (party.alliedWith.includes(other)) return true;
    const theirs = this.parties().find((held) => held.identifier === other);
    return theirs?.alliedWith.includes(party.identifier) === true;
  }

  /**
   * Puts a party in or out of another's company.
   *
   * Written to the one whose list was touched. Breaking it takes the answer out of both, since
   * either side saying so is what makes an alliance and leaving the other half written would
   * leave it standing.
   */
  stand(party: Party, other: string, together: boolean): void {
    if (other.length < 1 || other === party.identifier) return;
    this.write(party, together ? [...party.alliedWith, other] : party.alliedWith.filter((held) => held !== other));
    if (together) return;
    const theirs = this.parties().find((held) => held.identifier === other);
    if (theirs)
      this.write(
        theirs,
        theirs.alliedWith.filter((held) => held !== party.identifier)
      );
  }

  private write(party: Party, allies: readonly string[]): void {
    const written = writeAllies(allies);
    if (party.allies === written) return;
    party.allies = written;
    this.objectChange.notifyChanged(party.identifier);
  }

  /** Puts a character in a party, or in none with an empty identifier. Nothing happens when it is already there. */
  assign(character: GameCharacter, partyIdentifier: string): void {
    if (character.partyIdentifier === partyIdentifier) return;
    character.partyIdentifier = partyIdentifier;
    this.objectChange.notifyChanged(character.identifier);
  }
}
