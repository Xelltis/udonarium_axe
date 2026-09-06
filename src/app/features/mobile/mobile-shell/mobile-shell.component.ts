import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { Network } from '@axe/core/network/network';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { RoomPanelName } from '@axe/domain/ui/room-panel';
import { HandRailService } from '@axe/features/card/hand-rail/hand-rail.service';
import { MobileChatPaneComponent } from '@axe/features/mobile/mobile-chat-pane/mobile-chat-pane.component';
import {
  gameMasterMobileMenuItems,
  type MobileMenuAction,
  type MobileMenuItem,
  sharedMobileMenuItems,
} from '@axe/features/mobile/mobile-shell/mobile-menu-items';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { ActiveCharacterService } from '@axe/features/pl-tools/active-character.service';
import { isOwnedByUser } from '@axe/features/pl-tools/owned-character-list/owned-characters';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-mobile-shell',
  templateUrl: './mobile-shell.component.html',
  imports: [MobileChatPaneComponent, TranslocoModule],
})
export class MobileShellComponent {
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly handRail = inject(HandRailService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly tabletopService = inject(TabletopService);
  private readonly activeCharacter = inject(ActiveCharacterService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly theme = inject(ThemeService);
  protected readonly motion = inject(MotionService);
  protected readonly language = inject(LanguageService);
  protected readonly layout = inject(MobileLayoutService);
  protected readonly keyboardInset = inject(KeyboardInsetService).inset;
  private readonly selectionSignal = inject(SelectionSignalService);
  protected readonly selectionCount = this.selectionSignal.selectionSize;
  protected readonly t = inject(TRANSLATE_FN);

  protected readonly isMenuOpen = signal(false);

  protected readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  protected readonly paneTop = computed(() => {
    const ratio = this.layout.tableRatio() * 100;
    const inset = this.keyboardInset();
    return inset > 0 ? `max(0px, calc(${ratio}% - ${inset}px))` : `${ratio}%`;
  });

  protected readonly themeLabel = computed(() => {
    this.language.currentLang();
    const theme = this.theme.theme();
    if (theme === 'dark') return this.t('common.theme.dark');
    if (theme === 'light') return this.t('common.theme.light');
    return this.t('common.theme.auto');
  });

  protected readonly motionLabel = computed(() => {
    this.language.currentLang();
    const setting = this.motion.setting();
    if (setting === 'on') return this.t('common.motion.on');
    if (setting === 'off') return this.t('common.motion.off');
    return this.t('common.motion.auto');
  });

  protected readonly sharedItems: MobileMenuItem[] = sharedMobileMenuItems();
  protected readonly gameMasterItems: MobileMenuItem[] = gameMasterMobileMenuItems();
  protected readonly showGameMasterItems = computed(() => this.isGameMaster());

  private isResizing = false;

  protected toggleMenu(): void {
    this.isMenuOpen.update((open) => !open);
  }

  protected openCharacterList(): void {
    this.isMenuOpen.set(false);
    this.roomPanels.open('ownedCharacters', { title: this.t('app.fab.ownedCharacters') });
  }

  protected runMenuAction(action: MobileMenuAction): void {
    this.isMenuOpen.set(false);
    if (action === 'save') {
      void this.saveRoom();
      return;
    }
    if (action === 'visualNovel') {
      this.visualNovel.toggle();
      return;
    }
    if (action === 'hand') {
      this.handRail.toggle();
      return;
    }
    if (action === 'darkness') {
      this.toggleDarkness();
      return;
    }
    if (action === 'turnPrev') {
      this.turnOrder.prev();
      return;
    }
    if (action === 'turnNext') {
      this.turnOrder.next();
      return;
    }
    if (action === 'activePalette') {
      this.openActivePalette();
      return;
    }
    const opened = this.resolvePanel(action);
    if (opened) this.roomPanels.open(opened);
  }

  protected loadRoomFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.isMenuOpen.set(false);
    if (!this.rolePermission.canEditTabletop) {
      input.value = '';
      return;
    }
    const files = input.files;
    const reloadCheck = this.objectStore.get<ReloadCheck>('ReloadCheck');
    reloadCheck?.reloadCheckStart(Network.peerContext.roomName !== '');
    if (files && files.length) this.fileArchiver.load(files);
    input.value = '';
  }

  protected clearSelection(): void {
    this.selectionSignal.clearSelection();
  }

  protected cycleTheme(): void {
    this.theme.cycle();
  }

  protected toggleLanguage(): void {
    this.language.toggle();
  }

  protected useDesktopLayout(): void {
    this.isMenuOpen.set(false);
    this.layout.useDesktopLayout();
  }

  protected startResize(event: PointerEvent): void {
    if (this.isResizing) return;
    this.isResizing = true;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();

    const onMove = (moveEvent: PointerEvent) => {
      if (!this.isResizing) return;
      this.layout.setTableRatio(moveEvent.clientY / window.innerHeight);
    };
    const onUp = () => {
      this.isResizing = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    this.destroyRef.onDestroy(onUp);
  }

  private toggleDarkness(): void {
    const table = this.tabletopService.currentTable;
    table.darknessEnabled = !table.darknessEnabled;
    table.update();
    this.objectChange.notifyChanged(table.identifier);
  }

  private openActivePalette(): void {
    const identifier = this.activeCharacter.identifier();
    const character = identifier ? this.objectStore.get(identifier) : null;
    if (character instanceof GameCharacter && isOwnedByUser(character, PeerCursor.myCursor?.userId ?? '')) {
      this.objectPanels.openChatPalette(character);
      return;
    }
    this.openCharacterList();
  }

  private async saveRoom(): Promise<void> {
    const roomName =
      Network.peerContext && Network.peerContext.roomName.length > 0
        ? Network.peerContext.roomName
        : this.t('app.roomDataDefault');
    await this.saveDataService.saveRoomAsync(roomName);
  }

  private resolvePanel(action: MobileMenuAction): RoomPanelName | null {
    switch (action) {
      case 'peerMenu':
        return 'peerMenu';
      case 'tableSetting':
        return 'tableSetting';
      case 'roomSettings':
        return 'roomSettings';
      case 'images':
        return 'fileStorage';
      case 'jukebox':
        return 'jukebox';
      case 'cutIn':
        return 'cutInList';
      case 'effect':
        return 'effectLibrary';
      case 'inventory':
        return 'inventory';
      case 'objectList':
        return 'objectList';
      case 'party':
        return 'partyList';
      case 'mapEditor':
        return 'mapEditor';
      case 'dungeonGenerator':
        return 'dungeonGenerator';
      case 'createObject':
        return 'characterGenerator';
      case 'importCharacter':
        return 'characterImport';
      case 'roomSnapshot':
        return 'roomSnapshot';
      case 'replay':
        return 'replay';
      default:
        return null;
    }
  }
}
