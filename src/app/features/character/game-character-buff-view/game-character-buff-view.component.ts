import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { GameDataElementBuffComponent } from '@axe/features/character/game-data-element-buff/game-data-element-buff.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-character-buff-view',
  templateUrl: './game-character-buff-view.component.html',
  host: { class: 'block h-full' },
  imports: [GameDataElementBuffComponent, TranslocoModule],
})
export class GameCharacterBuffViewComponent {
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);

  readonly character = signal<GameCharacter | null>(null);
  readonly isEdit = signal(false);

  /** Follows the children of the buff element. */
  protected readonly buffChildren = computed<DataElement[]>(() => {
    const char = this.character();
    const buffEl = char?.buffDataElement;
    if (!buffEl) return [];
    this.objectChange.versionOf(buffEl.identifier)();
    return buffEl.children.slice() as DataElement[];
  });

  /**
   * Adds a new buff row to the character, from the panel's add button.
   *
   * The buff starts with the default name and one round, and the character is given a buff list
   * first when it has none. Does nothing before a character is set.
   */
  addBuff() {
    const char = this.character();
    if (!char) return;
    if (!char.buffDataElement) {
      char.addBuffDataElement();
    }
    char.buffDataElement?.appendChild(
      DataElement.create(this.t('feature.character.buff.defaultName'), 1, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: '0',
      })
    );
  }
}
