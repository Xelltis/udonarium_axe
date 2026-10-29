import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PartyService } from '@axe/application/party/party.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party, PARTY_COLORS } from '@axe/domain/party/party';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'party-list-panel',
  templateUrl: './party-list-panel.component.html',
  host: { class: 'block h-full' },
  imports: [TextTooltipDirective, FormsModule, SafePipe, TranslocoModule],
})
export class PartyListPanelComponent {
  private readonly partyService = inject(PartyService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tableFocus = inject(TableFocusService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  constructor() {
    // Made a guest meanwhile, the seat may no longer write what this panel writes.
    closeWhenOffTheTable();
  }

  protected readonly colors = PARTY_COLORS;
  protected readonly parties = this.partyService.parties;
  protected readonly unassigned = this.partyService.unassigned;
  protected readonly hasCharacters = computed(() => this.partyService.characters().length > 0);

  protected members(party: Party): GameCharacter[] {
    return this.partyService.membersOf(party.identifier);
  }

  protected imageUrl(character: GameCharacter): string {
    return character.imageFile?.url ?? '';
  }

  protected displayName(character: GameCharacter): string {
    return character.name.length ? character.name : this.t('feature.gmTools.party.unnamedCharacter');
  }

  protected partyName(party: Party): string {
    return party.name.length ? party.name : this.t('common.party.unnamed');
  }

  protected addParty(): void {
    this.partyService.create(this.t('feature.gmTools.party.defaultName', { index: this.parties().length + 1 }));
  }

  protected renameParty(party: Party, name: string): void {
    this.partyService.rename(party, name);
  }

  protected recolorParty(party: Party, color: string): void {
    this.partyService.recolor(party, color);
  }

  protected async removeParty(party: Party): Promise<void> {
    const asked = await this.confirm.ask({
      message: this.t('feature.gmTools.party.removeConfirm', { name: this.partyName(party) }),
      okLabel: this.t('common.button.delete'),
      danger: true,
    });
    if (!asked) return;
    this.partyService.remove(party);
  }

  /** The other parties in the room, which are the ones this one may stand with. */
  protected others(party: Party): Party[] {
    return this.parties().filter((held) => held.identifier !== party.identifier);
  }

  protected standsWith(party: Party, other: Party): boolean {
    return this.partyService.standsWith(party, other.identifier);
  }

  protected stand(party: Party, other: Party, together: boolean): void {
    this.partyService.stand(party, other.identifier, together);
  }

  /** The players connected now, each once, who may be named among those who play a party. */
  private readonly players = computed<{ userId: string; name: string }[]>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    const seen = new Map<string, string>();
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      this.objectChange.versionOf(cursor.identifier)();
      if (cursor.isPlayer && cursor.userId.length > 0 && !seen.has(cursor.userId)) seen.set(cursor.userId, cursor.name);
    }
    return [...seen].map(([userId, name]) => ({ userId, name }));
  });

  /**
   * The players a party may be played by, ticked where it names them: those connected now, and any
   * it names who are not, so they can be taken off it.
   */
  protected playerChoices(party: Party): { userId: string; name: string; playing: boolean }[] {
    const named = party.playerIds;
    const connected = this.players();
    const away = named
      .filter((userId) => !connected.some((player) => player.userId === userId))
      .map((userId) => ({ userId, name: PeerCursor.findByUserId(userId)?.name || userId }));
    return [...connected, ...away].map((player) => ({ ...player, playing: named.includes(player.userId) }));
  }

  protected setPlayer(party: Party, userId: string, playing: boolean): void {
    this.partyService.setPlayer(party, userId, playing);
  }

  protected assign(character: GameCharacter, partyIdentifier: string): void {
    this.partyService.assign(character, partyIdentifier);
  }

  protected focusToKoma(character: GameCharacter): void {
    this.selectionSignalService.selectObject(character.identifier, character.aliasName);
    this.tableFocus.focusOn(character);
  }
}
