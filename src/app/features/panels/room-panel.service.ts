import { inject, Injectable, Type } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { panelLabelKey, RoomPanelName, STATUS_AILMENT_PANEL } from '@axe/domain/ui/room-panel';

interface RoomPanel {
  load: () => Promise<Type<unknown>>;
  option: PanelOption;
}

@Injectable({ providedIn: 'root' })
export class RoomPanelService {
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);
  private opened = 0;

  open<T = unknown>(name: RoomPanelName, extra: PanelOption = {}, setup?: (instance: T) => void): void {
    const panel = this.panelOf(name);
    const option: PanelOption = {
      title: this.t(panelLabelKey(name)),
      ...panel.option,
      top: ((this.opened % 10) + 1) * 20,
      left: 100 + ((this.opened % 20) + 1) * 5,
      ...extra,
    };
    this.opened += 1;
    if (setup) this.panelService.openLazy(panel.load, option, setup as (instance: unknown) => void);
    else this.panelService.openLazy(panel.load, option);
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
    }
  }
}
