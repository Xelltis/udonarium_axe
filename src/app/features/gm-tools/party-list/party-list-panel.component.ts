import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PartyService } from '@axe/application/party/party.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party, PARTY_COLORS } from '@axe/domain/party/party';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'party-list-panel',
  templateUrl: './party-list-panel.component.html',
  host: { class: 'block h-full' },
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class PartyListPanelComponent {
  private readonly partyService = inject(PartyService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tableFocus = inject(TableFocusService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

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

  protected assign(character: GameCharacter, partyIdentifier: string): void {
    this.partyService.assign(character, partyIdentifier);
  }

  protected focusToKoma(character: GameCharacter): void {
    this.selectionSignalService.selectObject(character.identifier, character.aliasName);
    this.tableFocus.focusOn(character);
  }
}
