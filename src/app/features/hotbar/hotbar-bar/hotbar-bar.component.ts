import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActiveCharacterService } from '@axe/application/character/active-character.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { HotbarStoreService } from '@axe/application/hotbar/hotbar-store.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { HotbarPreferenceService } from '@axe/application/ui/hotbar-preference.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { VisualNovelModeService } from '@axe/application/ui/visual-novel-mode.service';
import { WidgetLayoutService } from '@axe/application/ui/widget-layout.service';
import { WIDGET_HOTBAR } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { capturePointer } from '@axe/core/input/pointer-capture';
import { Network } from '@axe/core/network/network';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { selectControllableCharacters } from '@axe/domain/character/owned-characters';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { draftOfSlot, emptyHotbarSlotDraft, HotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { findByReference } from '@axe/domain/hotbar/hotbar-reference';
import { HotbarSet } from '@axe/domain/hotbar/hotbar-set';
import { HOTBAR_PAGES, HOTBAR_SLOTS_PER_PAGE } from '@axe/domain/hotbar/hotbar-size';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { CutIn } from '@axe/domain/media/cut-in';
import { presetSoundLabelKey, soundFileName } from '@axe/domain/media/preset-sound-labels';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { MenuCommand, menuCommandOf } from '@axe/domain/ui/menu-command';
import { HotbarService } from '@axe/features/hotbar/hotbar.service';
import { findSlotActorAmong } from '@axe/features/hotbar/hotbar-actor';
import { bindsCharacter, HotbarCellView, hotbarCellView } from '@axe/features/hotbar/hotbar-cell-view';
import { buildHotbarBarContextMenu, buildHotbarSlotContextMenu } from '@axe/features/hotbar/hotbar-context-menu';
import { HotbarSlotDrag } from '@axe/features/hotbar/hotbar-drag';
import { HotbarFailure, HotbarRunnerService } from '@axe/features/hotbar/hotbar-runner.service';
import { hotbarKeyDown, isApplePlatform, isTypingTarget, pressEmptiesSlot } from '@axe/features/hotbar/hotbar-shortcut';
import { MenuCommandService } from '@axe/features/menu/menu-command.service';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { spotBeside } from '@axe/ui/panel-spot';
import { hotbarPanelLayer, Z_CONTEXT_MENU_PINNED, Z_HOTBAR, Z_HOTBAR_MOBILE, Z_HOTBAR_PINNED } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

const FLASH_MS = 600;
/** Long enough to read the reason a slot would not run, short enough not to nag. */
const REASON_MS = 4000;
const EDITOR_WIDTH = 380;
const EDITOR_HEIGHT = 520;
const EDITOR = { width: EDITOR_WIDTH, height: EDITOR_HEIGHT };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hotbar',
  templateUrl: './hotbar-bar.component.html',
  host: { '(document:keydown)': 'onKeydown($event)' },
  imports: [DraggableDirective, WidgetPlaceDirective, TranslocoModule],
})
export class HotbarBarComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly activeCharacter = inject(ActiveCharacterService);
  private readonly runner = inject(HotbarRunnerService);
  private readonly layout = inject(WidgetLayoutService);
  protected readonly widgetName = WIDGET_HOTBAR;
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, (window.innerWidth - el.offsetWidth) / 2),
    top: Math.max(8, window.innerHeight - el.offsetHeight - 16),
  });
  private readonly panelService = inject(PanelService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly hotbarService = inject(HotbarService);
  private readonly hotbarStore = inject(HotbarStoreService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly chatSpeaker = inject(ChatSpeakerService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly menuCommands = inject(MenuCommandService);

  protected readonly widgets = inject(WidgetVisibilityService);
  protected readonly preference = inject(HotbarPreferenceService);
  protected readonly mobile = inject(MobileLayoutService);
  private readonly visualNovel = inject(VisualNovelModeService);

  private readonly barRef = viewChild<ElementRef<HTMLElement>>('bar');
  private readonly place = viewChild(WidgetPlaceDirective);
  private readonly fileRef = viewChild<ElementRef<HTMLInputElement>>('file');
  private readonly failing = transientSignal<number | null>(null, FLASH_MS);
  private readonly drag = new HotbarSlotDrag();
  /** The slot being carried to another place, which is drawn as though lifted. */
  private readonly carrying = signal<number | null>(null);
  /** Why the last slot pressed would not run, said in the strip above the bar. */
  protected readonly failure = transientSignal<HotbarFailure | null>(null, REASON_MS);

  readonly pages = Array.from({ length: HOTBAR_PAGES }, (_, page) => page);

  readonly shows = computed(() => {
    if (!this.widgets.hotbar()) return false;
    if (this.visualNovel.active()) return false;
    this.objectChange.versionOf(PeerCursor.myCursor?.identifier ?? '')();
    return PeerCursor.myRole !== PeerRole.Guest;
  });

  /** The bar is the reader's own, and the same one whichever piece they are working. */
  readonly hotbar = computed<Hotbar | null>(() => {
    this.objectChange.collectionOf(Hotbar.aliasName)();
    this.objectChange.trackMyCursor();
    const held = this.hotbarStore.own();
    if (held) this.objectChange.versionOf(held.identifier)();
    return held;
  });

  readonly cells = computed<HotbarCellView[]>(() => {
    const page = this.preference.page();
    const hotbar = this.hotbar();
    // A slot put anywhere on the bar is a slot added to the room, and that is what says so.
    this.objectChange.collectionOf(HotbarSlot.aliasName)();

    const controllable = this.controllableCharacters();
    return Array.from({ length: HOTBAR_SLOTS_PER_PAGE }, (_, slotIndex) => {
      const slot = hotbar?.slotAt(page, slotIndex) ?? null;
      if (slot) {
        this.objectChange.versionOf(slot.identifier)();
        // A rename bumps the piece's own version and nothing else, and the cell draws its name.
        if (slot.characterIdentifier) this.objectChange.versionOf(slot.characterIdentifier)();
      }
      return hotbarCellView(slot, slotIndex, {
        controllable,
        speaker: this.speaker(),
        referencedName: (named) => this.referencedName(named),
        referencedIcon: (named) => this.referencedIcon(named),
        keyOf: (index) => this.keyOf(index),
      });
    });
  });

  readonly zIndex = computed(() => {
    if (this.preference.pinned()) return Z_HOTBAR_PINNED;
    return this.mobile.isActive() ? Z_HOTBAR_MOBILE : Z_HOTBAR;
  });

  constructor() {
    effect(() => {
      if (!this.shows() || !this.mobile.isActive()) return;
      const element = this.barRef()?.nativeElement;
      if (!element) return;
      element.style.left = '0px';
      element.style.top = `${Math.max(0, window.innerHeight * this.mobile.tableRatio() - element.offsetHeight - 8)}px`;
    });
  }

  protected isFailing(slotIndex: number): boolean {
    return this.failing() === slotIndex;
  }

  /** Dragging one slot onto another trades their places. */
  protected onSlotDown(cell: HotbarCellView, event: PointerEvent): void {
    if (event.button !== 0) return;

    // An empty slot carries nothing, but the press still forgets whatever the last drag left.
    this.drag.press(cell.slot ? cell.slotIndex : null, { x: event.clientX, y: event.clientY });
    this.carrying.set(null);
    if (cell.slot) capturePointer(event.target, event.pointerId);
  }

  /** The browser took the gesture away, so nothing is carried and nothing was dropped. */
  protected onSlotCancel(): void {
    this.drag.cancel();
    this.carrying.set(null);
  }

  protected onSlotMove(event: PointerEvent): void {
    if (this.drag.move({ x: event.clientX, y: event.clientY })) this.carrying.set(this.drag.carrying);
  }

  protected onSlotUp(event: PointerEvent): void {
    const from = this.drag.release();
    this.carrying.set(null);
    if (from === null) return;

    const to = this.slotUnder(event.clientX, event.clientY);
    if (to === null || to === from) return;

    const page = this.preference.page();
    this.ownHotbar()?.move({ page, slotIndex: from }, { page, slotIndex: to });
  }

  protected isDragging(slotIndex: number): boolean {
    return this.carrying() === slotIndex;
  }

  /** Which slot the pointer let go over, where that was a slot of this bar. */
  private slotUnder(x: number, y: number): number | null {
    const held = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-testid="hotbar-slot"]');
    const slot = held?.dataset['slot'];
    return slot ? Number(slot) : null;
  }

  protected press(cell: HotbarCellView, event: MouseEvent): void {
    if (this.drag.takeDrop()) return;
    if (!cell.slot) {
      this.edit(cell);
      return;
    }
    if (pressEmptiesSlot(event, isApplePlatform())) {
      this.clear(cell);
      return;
    }
    this.fire(cell);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.shows()) return;

    const action = hotbarKeyDown(
      event.code,
      {
        typing: isTypingTarget(event.target),
        composing: event.isComposing,
        chord: event.ctrlKey || event.metaKey || event.altKey,
        shift: event.shiftKey,
        slotCount: HOTBAR_SLOTS_PER_PAGE,
        pageCount: HOTBAR_PAGES,
      },
      event.key
    );
    if (!action) return;
    if (action.preventDefault) event.preventDefault();

    if (action.command === 'gotoPage') {
      this.preference.gotoPage(action.index);
      return;
    }
    if (action.command === 'turnPage') {
      this.preference.turnPage(action.index);
      return;
    }
    this.fire(this.cells()[action.index]);
  }

  /** A key asks for what is there, and says nothing about an empty slot. */
  private fire(cell: HotbarCellView | undefined): void {
    if (!cell?.slot) return;

    if (cell.needsCharacter && !cell.actor) {
      this.flash(cell.slotIndex, 'noCharacter');
      return;
    }
    this.settleActor(cell.slot);
    const result = this.runner.run(cell.slot, cell.actor, { page: this.preference.page(), slotIndex: cell.slotIndex });
    if (!result.ok) this.flash(cell.slotIndex, result.reason);
  }

  protected openSlotMenu(cell: HotbarCellView, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const held = this.hotbarService.clipboard();
    this.contextMenuService.open(
      { x: event.clientX, y: event.clientY },
      buildHotbarSlotContextMenu(
        cell.slot != null,
        {
          onEdit: () => this.edit(cell),
          onCopy: cell.slot ? () => this.hotbarService.copy(draftOfSlot(cell.slot!)) : undefined,
          onPaste: held ? () => this.paste(cell, held) : undefined,
          onClear: cell.slot ? () => this.clear(cell) : undefined,
        },
        this.t
      ),
      this.t('feature.hotbar.toggle'),
      this.menuLayer()
    );
  }

  protected openBarMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const removed = this.hotbarService.lastRemoved();
    this.contextMenuService.open(
      { x: event.clientX, y: event.clientY },
      buildHotbarBarContextMenu(
        {
          showsLabel: this.preference.showsLabel(),
          showsHint: this.preference.showsHint(),
          pinned: this.preference.pinned(),
        },
        {
          onToggleLabel: () => this.preference.setShowsLabel(!this.preference.showsLabel()),
          onToggleHint: () => this.preference.setShowsHint(!this.preference.showsHint()),
          onTogglePin: () => this.preference.setPinned(!this.preference.pinned()),
          onResetPlace: () => this.resetPlace(),
          onLoad: () => this.pickFile(),
          onUndo: removed ? () => this.undoRemoved() : undefined,
          onUndoRead: this.hotbar()?.hasDisplaced ? () => this.undoRead() : undefined,
          onHide: () => this.widgets.hotbar.set(false),
        },
        this.t
      ),
      this.t('feature.hotbar.toggle'),
      this.menuLayer()
    );
  }

  private edit(cell: HotbarCellView): void {
    const spot = this.editorSpot(cell.slotIndex);
    const at = { page: this.preference.page(), slotIndex: cell.slotIndex };
    const draft = cell.slot ? draftOfSlot(cell.slot) : emptyHotbarSlotDraft();
    this.panelService.openLazy(
      () =>
        import('@axe/features/hotbar/hotbar-editor/hotbar-slot-editor.component').then(
          (m) => m.HotbarSlotEditorComponent
        ),
      {
        width: EDITOR_WIDTH,
        height: EDITOR_HEIGHT,
        left: spot.left,
        top: spot.top,
        layer: hotbarPanelLayer(this.preference.pinned()),
        title: this.t('feature.hotbar.editor.title'),
        single: 'hotbar-slot-editor',
      },
      (editor) => editor.setFrom(at, draft)
    );
  }

  private editorSpot(slotIndex: number): { left: number; top: number } {
    const slot = this.barRef()?.nativeElement.querySelector<HTMLElement>(`[data-slot="${slotIndex}"]`);
    const anchor = slot?.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (!anchor)
      return spotBeside({ left: 0, top: viewport.height, right: 0, bottom: viewport.height }, EDITOR, viewport);
    return spotBeside(anchor, EDITOR, viewport);
  }

  private paste(cell: HotbarCellView, draft: HotbarSlotDraft): void {
    this.ownHotbar()?.put(this.preference.page(), cell.slotIndex, draft);
  }

  private clear(cell: HotbarCellView): void {
    if (!cell.slot) return;

    const page = this.preference.page();
    this.hotbarService.rememberRemoved({ page, slotIndex: cell.slotIndex }, draftOfSlot(cell.slot));
    this.hotbar()?.clear(page, cell.slotIndex);
  }

  /** Puts back the bar a file read replaced, for a file dropped by mistake. */
  private undoRead(): void {
    this.ownHotbar()?.restoreDisplaced();
  }

  private undoRemoved(): void {
    const removed = this.hotbarService.takeRemoved();
    if (!removed) return;
    this.ownHotbar()?.put(removed.cell.page, removed.cell.slotIndex, removed.draft);
  }

  private ownHotbar(): Hotbar | null {
    return this.hotbarStore.ensureOwn();
  }

  /** The bar as a file, so a reader keeps one per game and reads in the one they want. */
  protected async saveToFile(): Promise<void> {
    const hotbar = this.ownHotbar();
    if (!hotbar) return;

    const room = Network.peerContext?.roomName?.trim() ?? '';
    await this.saveDataService.saveGameObjectAsync(HotbarSet.of(hotbar), room ? `hotbar_${room}` : 'hotbar');
  }

  private pickFile(): void {
    this.fileRef()?.nativeElement.click();
  }

  /**
   * Loads the file chosen, as a fresh load: what was answered to an earlier one, such as declining a
   * save withheld in part, holds nothing back here, and a room within is asked about as any is.
   */
  protected async loadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    try {
      this.objectStore.get<ReloadCheck>('ReloadCheck')?.reloadCheckStart(Network.peerContext.roomName !== '');
      if (files && files.length > 0) await this.fileArchiver.load(files);
    } finally {
      // Emptied either way: a box still holding the file it choked on sends no second change.
      input.value = '';
    }
  }

  private resetPlace(): void {
    this.layout.forget(WIDGET_HOTBAR);
    const element = this.barRef()?.nativeElement;
    if (!element) return;
    element.style.left = `${Math.max(8, (window.innerWidth - element.offsetWidth) / 2)}px`;
    element.style.top = `${Math.max(8, window.innerHeight - element.offsetHeight - 16)}px`;
    this.place()?.remember();
  }

  protected keyOf(slotIndex: number): string {
    return `${(slotIndex + 1) % 10}`;
  }

  /** The pieces this reader may work, sifted once for the whole bar. */
  private controllableCharacters(): GameCharacter[] {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return selectControllableCharacters(
      this.objectStore.getObjects<GameCharacter>(GameCharacter),
      PeerCursor.myCursor?.userId ?? ''
    );
  }

  /** Who a slot naming nobody acts as: whoever the chat is set to speak as. */
  private speaker(): GameCharacter | null {
    const identifier = this.chatSpeaker.identifier();
    if (!identifier) return null;

    this.objectChange.versionOf(identifier)();
    const speaking = this.objectStore.get(identifier);
    return speaking instanceof GameCharacter ? speaking : null;
  }

  /**
   * A slot that found its piece by name writes down what it found, so it settles.
   *
   * A bar read into another room, or one whose pieces were made again, points at identifiers
   * that mean nothing there. Firing such a slot once puts it right.
   */
  private settleActor(slot: HotbarSlot): void {
    if (!bindsCharacter(slot)) return;
    // A piece still in the room keeps the slot pointing at it, whether or not the reader may
    // work it today. Only a piece that is gone lets the name find another one in its place.
    if (this.objectStore.get(slot.characterIdentifier) instanceof GameCharacter) return;

    const found = findSlotActorAmong(slot, this.controllableCharacters());
    if (!found?.renamed) return;

    slot.characterIdentifier = found.character.identifier;
    slot.characterName = found.character.name;
    slot.update();
  }

  /** What a slot points at by identifier, named as it is drawn, so a rename shows through. */
  private referencedName(slot: HotbarSlot): string {
    if (slot.slotKind === 'menu') {
      const command = this.menuCommandOfSlot(slot);
      return command ? this.t(this.menuCommands.labelKeyOf(command)) : '';
    }
    if (slot.slotKind === 'scene') {
      const options = slot.options;
      if (options.kind !== 'scene') return '';
      this.objectChange.collectionOf(BoardScene.aliasName)();
      const found = findByReference(BoardScene.all(), options.scene, options.sceneName);
      return found?.thing.name ?? options.sceneName;
    }
    const identifier = slot.argument.trim();
    if (!identifier) return '';

    if (slot.slotKind === 'cutIn') {
      this.objectChange.collectionOf('cut-in')();
      const found = findByReference(this.objectStore.getObjects<CutIn>(CutIn), identifier, slot.valueName);
      return found?.thing.name ?? slot.valueName;
    }
    if (slot.slotKind !== 'sound') return '';

    this.objectChange.fileVersion();
    const audio = this.audioStorage.get(identifier);
    if (!audio) return '';
    const labelKey = presetSoundLabelKey(identifier);
    return labelKey ? this.t(labelKey) : soundFileName(audio.name);
  }

  /** The icon of the menu entry a menu slot presses, as the menu draws it just now. */
  private referencedIcon(slot: HotbarSlot): string {
    const command = this.menuCommandOfSlot(slot);
    return command ? this.menuCommands.iconOf(command) : '';
  }

  private menuCommandOfSlot(slot: HotbarSlot): MenuCommand | null {
    const options = slot.options;
    return options.kind === 'menu' ? menuCommandOf(options.command.trim()) : null;
  }

  /** A pinned bar stands above where menus go, so the menus it opens ride above it in turn. */
  private menuLayer(): { layer: number } | undefined {
    return this.preference.pinned() ? { layer: Z_CONTEXT_MENU_PINNED } : undefined;
  }

  /**
   * A slot that would not run says so twice over: the slot itself flashes, and the reason
   * stands in the strip for a moment, where the keys are otherwise explained.
   */
  private flash(slotIndex: number, reason: HotbarFailure): void {
    this.failing.show(slotIndex);
    this.failure.show(reason);
  }
}
