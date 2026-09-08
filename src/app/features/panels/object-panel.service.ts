import { inject, Injectable, Injector, ViewContainerRef } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CharacterSheetTarget } from '@axe/domain/tabletop/character-sheet-target';
import { PanelWindowService } from '@axe/features/panels/panel-window.service';

export interface ObjectPanelSize {
  width: number;
  height: number;
}

export interface ObjectPanelPlace {
  at?: { x: number; y: number };
  offset?: { x: number; y: number };
  single?: string;
}

const CHARACTER_SHEET_SIZE: ObjectPanelSize = { width: 800, height: 600 };
const CHARACTER_SHEET_OFFSET = { x: 800, y: 300 };
const CHAT_PALETTE_SIZE: ObjectPanelSize = { width: 760, height: 500 };
const REMOTE_CONTROLLER_SIZE: ObjectPanelSize = { width: 700, height: 600 };
const REMOTE_CONTROLLER_OFFSET = { x: 250, y: 175 };

/** What one of these panels needs said about it to be able to leave for a window of its own. */
interface DetachRequest {
  key: string;
  open: (host: ViewContainerRef) => void;
  restore: () => void;
  /** Whether this one is already in a window, in which case it is not offered again. */
  taken: boolean;
}

@Injectable({ providedIn: 'root' })
export class ObjectPanelService {
  private readonly panelService = inject(PanelService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly injector = inject(Injector);

  openSheet(
    object: CharacterSheetTarget,
    title: string,
    size: ObjectPanelSize,
    place: ObjectPanelPlace = {},
    host?: ViewContainerRef
  ): void {
    this.selectionSignalService.selectObject(object.identifier, object.aliasName);
    const load = () =>
      import('@axe/features/character/game-character-sheet/game-character-sheet.component').then(
        (m) => m.GameCharacterSheetComponent
      );
    const option = this.option(title, size, place, {
      key: `sheet:${object.identifier}`,
      open: (layer) => this.openSheet(object, title, size, place, layer),
      restore: () => this.openSheet(object, title, size, place),
      taken: host !== undefined,
    });
    if (host) this.panelService.openLazy(load, option, (component) => (component.tabletopObject = object), host);
    else this.panelService.openLazy(load, option, (component) => (component.tabletopObject = object));
  }

  openCharacterSheet(character: GameCharacter, place: ObjectPanelPlace = {}, host?: ViewContainerRef): void {
    const title = character.name.length
      ? this.t('feature.character.panel.sheetWithName', { name: character.name })
      : this.t('feature.character.panel.sheet');
    this.openSheet(character, title, CHARACTER_SHEET_SIZE, { offset: CHARACTER_SHEET_OFFSET, ...place }, host);
  }

  openChatPalette(character: GameCharacter, place: ObjectPanelPlace = {}, host?: ViewContainerRef): void {
    const load = () =>
      import('@axe/features/chat/chat-palette/chat-palette.component').then((m) => m.ChatPaletteComponent);
    const option = this.option(
      this.t('feature.character.panel.chatPaletteWithName', { name: character.name }),
      CHAT_PALETTE_SIZE,
      place,
      {
        key: `palette:${character.identifier}`,
        open: (layer) => this.openChatPalette(character, place, layer),
        restore: () => this.openChatPalette(character, place),
        taken: host !== undefined,
      }
    );
    if (host) this.panelService.openLazy(load, option, (component) => component.character.set(character), host);
    else this.panelService.openLazy(load, option, (component) => component.character.set(character));
  }

  openRemoteController(character: GameCharacter, place: ObjectPanelPlace = {}, host?: ViewContainerRef): void {
    const load = () =>
      import('@axe/features/controller/remote-controller/remote-controller.component').then(
        (m) => m.RemoteControllerComponent
      );
    const option = this.option(
      this.t('feature.character.panel.remoteControllerWithName', { name: character.name }),
      REMOTE_CONTROLLER_SIZE,
      { offset: REMOTE_CONTROLLER_OFFSET, ...place },
      {
        key: `controller:${character.identifier}`,
        open: (layer) => this.openRemoteController(character, place, layer),
        restore: () => this.openRemoteController(character, place),
        taken: host !== undefined,
      }
    );
    if (host) this.panelService.openLazy(load, option, (component) => component.character.set(character), host);
    else this.panelService.openLazy(load, option, (component) => component.character.set(character));
  }

  private option(title: string, size: ObjectPanelSize, place: ObjectPanelPlace, detach: DetachRequest): PanelOption {
    const at = place.at ?? this.pointerDeviceService.pointers[0];
    const offset = place.offset ?? { x: size.width / 2, y: size.height / 2 };
    const option: PanelOption = {
      title,
      width: size.width,
      height: size.height,
      left: at.x - offset.x,
      top: at.y - offset.y,
      controls: this.popOutControl(size, detach),
    };
    if (place.single) option.single = place.single;
    return option;
  }

  /**
   * The button that sends this panel to a window of its own.
   *
   * Offered only on a panel standing on the table: one already in a window has the operating
   * system's frame to close, and closing that brings the panel back here.
   */
  private popOutControl(size: ObjectPanelSize, detach: DetachRequest): PanelOption['controls'] {
    if (detach.taken) return [];
    const windows = this.injector.get(PanelWindowService);
    if (!windows.isSupported) return [];
    return [
      {
        icon: 'open_in_new',
        label: this.t('common.panel.popOut'),
        press: (owner) => {
          const went = windows.popOut({
            key: detach.key,
            width: size.width,
            height: size.height,
            open: detach.open,
            restore: detach.restore,
          });
          if (went) owner.close();
        },
      },
    ];
  }
}
