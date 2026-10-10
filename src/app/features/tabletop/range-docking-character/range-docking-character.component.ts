import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { RangeArea } from '@axe/domain/tabletop/range';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

@Component({
  selector: 'range-docking-character',
  templateUrl: './range-docking-character.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgSelectComponent, FormsModule, NgOptionComponent, NgSelectWindowDirective, SafePipe, TranslocoModule],
})
export class RangeDockingCharacterComponent {
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectChange = inject(ObjectChangeService);

  tabletopObject: RangeArea | null = null;

  readonly sendFrom = signal('');

  readonly gameCharacters = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const all = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const c of all) this.objectChange.versionOf(c.identifier)();
    return all.filter((character) => character.isVisibleOnTable);
  });

  constructor() {
    this.sendFrom.set(this.gameCharacters().length >= 1 ? this.gameCharacters()[0].identifier : '');
  }

  readonly imageFile = computed((): ImageFile => {
    this.objectChange.fileVersion();
    this.objectChange.versionOf(this.sendFrom())();
    const object = this.objectStore.get(this.sendFrom());
    if (object instanceof GameCharacter) {
      const image = this.imageStorage.get(object.imageDataElement?.children[0]?.value as string);
      return image ? image : ImageFile.Empty;
    }
    return ImageFile.Empty;
  });

  readonly portraitCount = computed((): number => {
    this.objectChange.versionOf(this.sendFrom())();
    const object = this.objectStore.get(this.sendFrom());
    if (object instanceof GameCharacter) {
      return object.imageDataElement?.children.length ?? 0;
    }
    return 0;
  });

  /**
   * Docks the range to the character picked in the list, so it follows that piece about the table,
   * and closes the panel. With no character picked the panel only closes.
   */
  followring() {
    if (!this.tabletopObject) return;
    const object = this.objectStore.get(this.sendFrom());
    if (object instanceof GameCharacter) {
      if (GameCharacter) {
        SoundEffect.play(PresetSound.lock);
        this.tabletopObject.followingCharacterIdentifier = object.identifier;
        this.tabletopObject.following();
      }
    }
    this.panelService.close();
  }

  /** Closes the panel without docking the range. */
  cancel() {
    this.panelService.close();
  }
}
