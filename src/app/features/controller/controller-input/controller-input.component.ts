import { NgClass, NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  model,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { chatColorOf, DEFAULT_CHAT_COLOR } from '@axe/domain/chat/chat-color';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PortraitChoice, PortraitPickerComponent } from '@axe/ui/components/portrait-picker/portrait-picker.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'controller-input',
  templateUrl: './controller-input.component.html',
  imports: [
    NgClass,
    NgSelectComponent,
    FormsModule,
    NgOptionComponent,
    NgSelectWindowDirective,
    NgStyle,
    PortraitPickerComponent,
    SafePipe,
    TranslocoModule,
  ],
})
export class ControllerInputComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);

  readonly sendFrom = model(PeerCursor.myCursor ? PeerCursor.myCursor.identifier : '');
  readonly sendTo = model('');

  readonly portraitIndex = linkedSignal(() => {
    this.objectChange.versionOf(this.sendFrom())();
    const object = this.objectStore.get(this.sendFrom());
    return object instanceof GameCharacter ? object.selectedPortraitIndex : 0;
  });

  /**
   * Switches the speaking character to one of its portraits, written on the character, from the
   * portrait picker.
   */
  setPortraitIndex(num: number) {
    const object = this.objectStore.get(this.sendFrom());
    if (object instanceof GameCharacter) object.selectedPortraitIndex = num;
    this.portraitIndex.set(num);
  }

  /** Whether a whisper target is chosen, which tints the input to show the message is private. */
  get isDirect(): boolean {
    return this.sendTo() != null && this.sendTo().length > 0;
  }

  private _colorSelectNo: number = 0;

  /** Which of the speaker's three chat colours is picked, held between 0 and 2. */
  get colorSelectNo(): number {
    return this._colorSelectNo;
  }

  set colorSelectNo(num: number) {
    this._colorSelectNo = Math.max(0, Math.min(2, num));
  }

  /**
   * The inline style for one colour swatch, drawn with a thicker, rounded border when it is the
   * picked one.
   */
  colorSelectorStyle(index: number): Record<string, string> {
    const selected = index === this.colorSelectNo;
    return {
      'background-color': this.characterChatColor(index),
      border: `solid ${selected ? '3px' : '1px'} #666666`,
      'border-radius': selected ? '9px' : '0px',
    };
  }

  /** The current speaker's picked chat colour, which the remote controller sends its messages in. */
  get selectChatColor(): string {
    return this.characterChatColor(this.colorSelectNo);
  }

  readonly selectedPortrait = computed((): DataElement | null => {
    this.objectChange.versionOf(this.sendFrom())();
    const object = this.objectStore.get(this.sendFrom());
    if (object instanceof GameCharacter) {
      if (object.imageDataElement && object.imageDataElement.children.length > this.portraitIndex()) {
        return object.imageDataElement.children[this.portraitIndex()] ?? null;
      }
    }
    return null;
  });

  readonly portraitChoices = computed<PortraitChoice[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.versionOf(this.sendFrom())();
    const object = this.objectStore.get(this.sendFrom());
    if (!(object instanceof GameCharacter)) return [];
    const children = (object.imageDataElement?.children ?? []) as DataElement[];
    return children.map((element, index) => ({
      index,
      name: portraitNameOf(element),
      url: this.imageStorage.get(element.value as string)?.url ?? '',
    }));
  });

  readonly imageFile = computed((): ImageFile => {
    this.objectChange.fileVersion();
    if (this.selectedPortrait()) {
      const imageFile = this.imageStorage.get(this.selectedPortrait()!.value as string);
      return imageFile ? imageFile : ImageFile.Empty;
    }
    const object = this.objectStore.get(this.sendFrom());
    let image: ImageFile | null = null;
    if (object instanceof GameCharacter) {
      image = object.imageFile;
    } else if (object instanceof PeerCursor) {
      image = object.image;
    }
    return image ? image : ImageFile.Empty;
  });

  readonly gameCharacters = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const all = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const c of all) this.objectChange.versionOf(c.identifier)();
    return all.filter((character) => this.isVisibleToMe(character));
  });

  /** The reader's own cursor, which is spoken as when no character is chosen. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  readonly onlyCharacters = input(false);
  readonly chatTabidentifier = input('');
  readonly selectNum = input(0);
  readonly allBox = output<{ check: boolean }>();

  /** Picks one of the speaker's three chat colours from its swatch. */
  setColorNum(num: number) {
    this.colorSelectNo = num;
  }

  /**
   * The chat colour in one slot of the speaking character, or the default colour when the speaker
   * is not a character.
   */
  characterChatColor(num: number) {
    const object = this.objectStore.get(this.sendFrom());
    return object instanceof GameCharacter ? chatColorOf(object, num) : DEFAULT_CHAT_COLOR;
  }

  /**
   * Opens the chat colour settings panel for the speaking character near the pointer; does nothing
   * when the speaker is not a character.
   */
  shoeColorSetting() {
    const object = this.objectStore.get(this.sendFrom());
    if (object instanceof GameCharacter) {
      const coordinate = this.pointerDeviceService.pointers[0];
      const title = object.name.length
        ? this.t('feature.controller.input.colorSettingWithName', { name: object.name })
        : this.t('feature.controller.input.colorSetting');
      const option: PanelOption = {
        title,
        left: coordinate.x + 50,
        top: coordinate.y - 150,
        width: 300,
        height: 120,
      };
      this.panelService.openLazy(
        () =>
          import('@axe/features/chat/chat-color-setting/chat-color-setting.component').then(
            (m) => m.ChatColorSettingComponent
          ),
        option,
        (component) => (component.tabletopObject = object)
      );
    }
  }

  constructor() {
    this.objectChange.onObjectChangedForAlias(
      [GameCharacter.aliasName],
      (event) => {
        if (event.identifier !== this.sendFrom()) return;
        const gameCharacter = this.objectStore.get<GameCharacter>(event.identifier);
        if (gameCharacter && !this.isVisibleToMe(gameCharacter)) {
          if (0 < this.gameCharacters().length && this.onlyCharacters()) {
            this.sendFrom.set(this.gameCharacters()[0].identifier);
          } else {
            this.sendFrom.set(this.myPeer.identifier);
          }
        }
      },
      this.destroyRef
    );

    this.objectChange.peerDisconnect$.subscribe((event) => {
      const object = this.objectStore.get(this.sendTo());
      if (object instanceof PeerCursor && object.peerId === event.peerId) {
        this.sendTo.set('');
      }
    }, this.destroyRef);
  }

  /** Asks the parent to tick every character when none is selected, or to untick them all otherwise. */
  allBoxCheck() {
    if (this.selectNum() > 0) {
      this.allBox.emit({ check: false });
    } else {
      this.allBox.emit({ check: true });
    }
  }

  /**
   * Whether this piece can be seen from here.
   *
   * The name suggests who may speak, but what it reads is where the piece is and whether
   * it is hidden: one hidden from the list stays off even on the table, as does one in somebody else's hands.
   */
  private isVisibleToMe(gameCharacter: GameCharacter): boolean {
    const locationName = gameCharacter.location.name;
    if (locationName === 'table') return !gameCharacter.hideInventory;
    if (locationName === this.myPeer?.peerId) return true;
    if (locationName === 'graveyard') return false;
    for (const conn of Network.peerContexts) {
      if (conn.isOpen && locationName === conn.peerId) return false;
    }
    return true;
  }
}
