import { inject, Injectable, Injector, Type, ViewContainerRef } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { panelLabelKey, RoomPanelName, STATUS_AILMENT_PANEL } from '@axe/domain/ui/room-panel';
import { PanelWindowService } from '@axe/features/panels/panel-window.service';

interface RoomPanel {
  load: () => Promise<Type<unknown>>;
  option: PanelOption;
}

@Injectable({ providedIn: 'root' })
export class RoomPanelService {
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly injector = inject(Injector);

  private opened = 0;

  open<T = unknown>(
    name: RoomPanelName,
    extra: PanelOption = {},
    setup?: (instance: T) => void,
    host?: ViewContainerRef
  ): void {
    const panel = this.panelOf(name);
    const option: PanelOption = {
      title: this.t(panelLabelKey(name)),
      windowed: host !== undefined,
      controls: host ? [] : this.popOutControl(name, extra, setup),
      ...panel.option,
      top: ((this.opened % 10) + 1) * 20,
      left: 100 + ((this.opened % 20) + 1) * 5,
      ...extra,
    };
    this.opened += 1;
    // Passed on exactly as far as there is something to pass: a trailing `undefined` is a
    // different call to anything watching, and nothing here needs to make one.
    if (host) this.panelService.openLazy(panel.load, option, setup as (instance: unknown) => void, host);
    else if (setup) this.panelService.openLazy(panel.load, option, setup as (instance: unknown) => void);
    else this.panelService.openLazy(panel.load, option);
  }

  /**
   * The button that sends a panel to a window of its own.
   *
   * It is offered only on a panel standing on the table: one already in a window has the
   * operating system's own frame to close, and closing it brings the panel back here.
   */
  private popOutControl<T>(
    name: RoomPanelName,
    extra: PanelOption,
    setup?: (instance: T) => void
  ): PanelOption['controls'] {
    const windows = this.injector.get(PanelWindowService);
    if (!windows.isSupported) return [];
    return [
      {
        icon: 'open_in_new',
        label: this.t('common.panel.popOut'),
        press: (owner) => {
          if (owner.windowed()) return;
          const frame = owner.standingFrame;
          if (frame && frame.panelCount() > 1) {
            windows.popOutGroup(frame, this.panelService);
            return;
          }
          const went = windows.popOut({
            key: `room:${name}`,
            // Opened again the way it was opened here, so a panel asked for at a size, with a
            // title of its own or something to set up keeps all of it on the way out and back.
            open: (host) => this.open(name, { ...extra, left: 0, top: 0 }, setup, host),
            restore: () => this.open(name, extra, setup),
          });
          // Closed only once the window is really there: one the browser refuses would
          // otherwise take the panel with it.
          if (went) owner.close();
        },
      },
    ];
  }

  private panelOf(name: RoomPanelName): RoomPanel {
    switch (name) {
      case 'chatWindow':
        return {
          load: () => import('@axe/features/chat/chat-window/chat-window.component').then((m) => m.ChatWindowComponent),
          option: { width: 700, height: 500, minWidth: 300, minHeight: 460 },
        };
      case 'peerMenu':
        return {
          load: () => import('@axe/features/lobby/peer-menu/peer-menu.component').then((m) => m.PeerMenuComponent),
          option: { width: 420, height: 300 },
        };
      case 'tableSetting':
        return {
          load: () =>
            import('@axe/features/tabletop/game-table-setting/game-table-setting.component').then(
              (m) => m.GameTableSettingComponent
            ),
          option: { width: 630, height: 500 },
        };
      case 'roomSettings':
        return {
          load: () =>
            import('@axe/features/room-settings/room-settings-panel/room-settings-panel.component').then(
              (m) => m.RoomSettingsPanelComponent
            ),
          option: { width: 560, height: 620 },
        };
      case 'inventory':
        return {
          load: () =>
            import('@axe/features/inventory/game-object-inventory/game-object-inventory.component').then(
              (m) => m.GameObjectInventoryComponent
            ),
          option: { width: 450, height: 600, minimizeToContent: true },
        };
      case 'objectList':
        return {
          load: () =>
            import('@axe/features/gm-object-list/game-object-list-panel.component').then(
              (m) => m.GameObjectListPanelComponent
            ),
          option: { width: 460, height: 620 },
        };
      case 'fileStorage':
        return {
          load: () =>
            import('@axe/features/file/file-storage/file-storage.component').then((m) => m.FileStorageComponent),
          option: { width: 450, height: 600 },
        };
      case 'jukebox':
        return {
          load: () => import('@axe/features/media/jukebox/jukebox.component').then((m) => m.JukeboxComponent),
          option: { width: 450, height: 600 },
        };
      case 'cutInList':
        return {
          load: () => import('@axe/features/media/cut-in-list/cut-in-list.component').then((m) => m.CutInListComponent),
          option: { width: 980, height: 760 },
        };
      case 'characterGenerator':
        return {
          load: () =>
            import('@axe/features/character/game-character-generator/game-character-generator.component').then(
              (m) => m.GameCharacterGeneratorComponent
            ),
          option: { width: 500, height: 300 },
        };
      case 'characterImport':
        return {
          load: () =>
            import('@axe/features/character/import-character/import-character.component').then(
              (m) => m.ImportCharacterComponent
            ),
          option: { width: 480, height: 460 },
        };
      case 'ownedCharacters':
        return {
          load: () =>
            import('@axe/features/pl-tools/owned-character-list/owned-character-list-panel.component').then(
              (m) => m.OwnedCharacterListPanelComponent
            ),
          option: { width: 420, height: 560 },
        };
      case 'partyList':
        return {
          load: () =>
            import('@axe/features/gm-tools/party-list/party-list-panel.component').then(
              (m) => m.PartyListPanelComponent
            ),
          option: { width: 460, height: 620 },
        };
      case 'buffManager':
        return {
          load: () =>
            import('@axe/features/buff/buff-manager-panel/buff-manager-panel.component').then(
              (m) => m.BuffManagerPanelComponent
            ),
          option: { width: 560, height: 420 },
        };
      case 'statusAilment':
        return {
          load: () =>
            import('@axe/features/status-ailment/status-ailment-panel/status-ailment-panel.component').then(
              (m) => m.StatusAilmentPanelComponent
            ),
          option: { width: 380, height: 460, single: STATUS_AILMENT_PANEL },
        };
      case 'effectLibrary':
        return {
          load: () =>
            import('@axe/features/effect/effect-library-panel/effect-library-panel.component').then(
              (m) => m.EffectLibraryPanelComponent
            ),
          option: { width: 360, height: 480 },
        };
      case 'mapEditor':
        return {
          load: () =>
            import('@axe/features/map-editor/editor/map-editor-panel.component').then((m) => m.MapEditorPanelComponent),
          option: { width: 1100, height: 740 },
        };
      case 'dungeonGenerator':
        return {
          load: () =>
            import('@axe/features/tabletop/dungeon-generator/dungeon-generator.component').then(
              (m) => m.DungeonGeneratorComponent
            ),
          option: { width: 460, height: 660, minWidth: 400, minHeight: 520 },
        };
      case 'roomSnapshot':
        return {
          load: () =>
            import('@axe/features/room-archive/room-snapshot-panel/room-snapshot-panel.component').then(
              (m) => m.RoomSnapshotPanelComponent
            ),
          option: { width: 460, height: 460 },
        };
      case 'replay':
        return {
          load: () =>
            import('@axe/features/replay/replay-workspace/replay-workspace.component').then(
              (m) => m.ReplayWorkspaceComponent
            ),
          option: { width: 900, height: 640, minWidth: 600, minHeight: 420 },
        };
      case 'tabletopDisplay':
        return {
          load: () =>
            import('@axe/features/tabletop/tabletop-display-setting/tabletop-display-setting.component').then(
              (m) => m.TabletopDisplaySettingComponent
            ),
          option: { width: 480, height: 640, minWidth: 380, minHeight: 420 },
        };
      case 'skin':
        return {
          load: () => import('@axe/features/skin/skin-panel/skin-panel.component').then((m) => m.SkinPanelComponent),
          option: { width: 720, height: 860, minWidth: 460, minHeight: 520 },
        };
    }
  }
}
