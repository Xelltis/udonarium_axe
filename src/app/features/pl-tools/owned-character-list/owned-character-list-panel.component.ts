import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PartyService } from '@axe/application/party/party.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { matchesSearchText, normalizeSearchText, splitSearchTerms } from '@axe/core/util/text-search';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Party } from '@axe/domain/party/party';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatPaletteRegistryService } from '@axe/features/chat/chat-palette/chat-palette-registry.service';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { ActiveCharacterService } from '@axe/features/pl-tools/active-character.service';
import { resourceElementsOf, resourceMax } from '@axe/features/pl-tools/owned-character-list/character-resources';
import { isOnTable, selectOwnedCharacters } from '@axe/features/pl-tools/owned-character-list/owned-characters';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'owned-character-list-panel',
  templateUrl: './owned-character-list-panel.component.html',
  host: { class: 'block h-full' },
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class OwnedCharacterListPanelComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tableFocus = inject(TableFocusService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly registry = inject(ChatPaletteRegistryService);
  private readonly partyService = inject(PartyService);
  protected readonly activeCharacter = inject(ActiveCharacterService);
  private readonly t = inject(TRANSLATE_FN);

  readonly characters = computed<GameCharacter[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.trackMyCursor();
    const userId = PeerCursor.myCursor?.userId ?? '';
    const all = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const character of all) this.objectChange.versionOf(character.identifier)();
    return selectOwnedCharacters(all, userId);
  });

  readonly search = signal('');

  readonly filteredCharacters = computed<GameCharacter[]>(() => {
    const terms = splitSearchTerms(this.search());
    if (terms.length < 1) return this.characters();
    return this.characters().filter((character) =>
      matchesSearchText(normalizeSearchText(this.displayName(character)), terms)
    );
  });

  protected imageUrl(character: GameCharacter): string {
    return character.imageFile?.url ?? '';
  }

  protected canFocus(character: GameCharacter): boolean {
    return isOnTable(character);
  }

  protected resources(character: GameCharacter): DataElement[] {
    this.objectChange.versionOf(character.identifier)();
    return resourceElementsOf(character);
  }

  protected resourceMax(element: DataElement): number {
    return resourceMax(element);
  }

  protected onResourceChanged(character: GameCharacter): void {
    this.objectChange.notifyChanged(character.identifier);
  }

  protected displayName(character: GameCharacter): string {
    return character.name.length ? character.name : this.t('feature.plTools.ownedCharacters.unnamed');
  }

  protected party(character: GameCharacter): Party | null {
    return this.partyService.partyOf(character);
  }

  protected partyName(party: Party): string {
    return party.name.length ? party.name : this.t('common.party.unnamed');
  }

  protected partyTooltip(character: GameCharacter): string {
    const party = this.party(character);
    if (!party) return '';
    const companions = this.partyService.companionsOf(character).map((member) => this.displayName(member));
    const params = { party: this.partyName(party), names: companions.join(', ') };
    return companions.length
      ? this.t('feature.plTools.ownedCharacters.partyWith', params)
      : this.t('feature.plTools.ownedCharacters.partyAlone', params);
  }

  protected setActive(character: GameCharacter): void {
    this.activeCharacter.toggle(character.identifier);
    if (!this.activeCharacter.isActive(character.identifier)) return;
    this.registry.active()?.setCharacterById(character.identifier);
  }

  protected openChatPalette(character: GameCharacter): void {
    this.objectPanels.openChatPalette(character);
  }

  protected openSheet(character: GameCharacter): void {
    this.objectPanels.openCharacterSheet(character);
  }

  protected openRemoteController(character: GameCharacter): void {
    this.objectPanels.openRemoteController(character);
  }

  protected focusToKoma(character: GameCharacter): void {
    if (!this.canFocus(character)) return;
    this.selectionSignalService.selectObject(character.identifier, character.aliasName);
    this.tableFocus.focusOn(character);
  }
}
