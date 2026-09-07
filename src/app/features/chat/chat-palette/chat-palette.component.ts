import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatTickerSelectionService } from '@axe/application/chat/chat-ticker-selection.service';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { ChatPalette, PaletteIndex } from '@axe/domain/chat/chat-palette';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PaletteRow, paletteRowsOf } from '@axe/domain/chat/palette-rows';
import { DataElement } from '@axe/domain/data/data-element';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatInputComponent } from '@axe/features/chat/chat-input/chat-input.component';
import { editsTextInPlace } from '@axe/features/chat/chat-input/chat-input-helpers';
import { ChatPaletteRegistryService } from '@axe/features/chat/chat-palette/chat-palette-registry.service';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { HotbarFillService } from '@axe/features/hotbar/hotbar-fill.service';
import { BadgeComponent } from '@axe/ui/components/badge/badge.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-palette',
  templateUrl: './chat-palette.component.html',
  host: {
    class: 'block h-full',
    tabindex: '-1',
    '(keydown.control.arrowleft)': 'switchTabByKey($event, -1)',
    '(keydown.control.arrowright)': 'switchTabByKey($event, 1)',
  },
  imports: [FormsModule, BadgeComponent, ChatInputComponent, GameDataElementComponent, TranslocoModule],
})
export class ChatPaletteComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly hotbarFill = inject(HotbarFillService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  chatMessageService = inject(ChatMessageService);
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly characterMacro = inject(CharacterMacroService);
  private readonly chatTickerSelection = inject(ChatTickerSelectionService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatPaletteRegistry = inject(ChatPaletteRegistryService);
  private readonly t = inject(TRANSLATE_FN);

  readonly rootElementRef = viewChild.required<ElementRef<HTMLElement>>('root');
  readonly chatInputComponent = viewChild.required<ChatInputComponent>('chatInput');
  readonly paletteListRef = viewChild<ElementRef<HTMLDivElement>>('paletteList');
  readonly completeSelectRef = viewChild<ElementRef<HTMLSelectElement>>('completeSelect');
  readonly editTextRef = viewChild<ElementRef<HTMLTextAreaElement>>('editText');
  readonly character = signal<GameCharacter | null>(null);

  readonly selectedLine = signal<number>(-1);

  readonly paletteRows = computed((): PaletteRow[] => {
    const char = this.character();
    const palette = char?.chatPalette ?? null;
    if (!palette) return [];
    this.objectChange.versionOf(palette.identifier)();
    return paletteRowsOf(palette.getPalette());
  });

  get palette(): ChatPalette | null {
    return this.character()?.chatPalette ?? null;
  }

  private readonly _gameType = linkedSignal(() => this.character()?.chatPalette?.dicebot ?? '');
  private _paletteIndex: PaletteIndex[] = [];
  private _timeId: string = '';
  private _autoCompleteEnable = false;

  get gameType(): string {
    return this._gameType();
  }
  set gameType(gameType: string) {
    this._gameType.set(gameType);
    const char = this.character();
    if (char?.chatPalette) char.chatPalette.dicebot = gameType;
  }

  get sendFrom(): string {
    return this.character()?.identifier ?? '';
  }
  set sendFrom(sendFrom: string) {
    this.onSelectedCharacter(sendFrom);
  }

  readonly chatTabidentifier = signal('');
  readonly text = signal<string>('');
  sendTo: string = '';

  readonly autoCompleteListSignal = computed<string[]>(() => {
    const t = this.text();
    if (t.length <= 1) return [];
    const palette = this.character()?.chatPalette ?? null;
    if (!palette) return [];
    this.objectChange.versionOf(palette.identifier)();
    return palette.paletteMatch(t);
  });

  readonly isEdit = signal(false);
  readonly editPalette = signal('');
  readonly viewMode = signal<'palette' | 'character'>('palette');

  readonly chatTabsVersion = computed(() => {
    this.objectChange.collectionOf('chat-tab')();
    this.objectChange.versionOf(ChatTabList.instance.identifier)();
    const tabs = this.chatMessageService.chatTabs;
    for (const tab of tabs) this.objectChange.versionOf(tab.identifier)();
    return [...tabs];
  });

  private doubleClickTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly diceBotCatalog = inject(DiceBotCatalogService);

  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }

  get chatTab(): ChatTab {
    return this.objectStore.get<ChatTab>(this.chatTabidentifier())!;
  }
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }
  get otherPeers(): PeerCursor[] {
    return this.objectStore.getObjects(PeerCursor);
  }

  setCharacterById(identifier: string): void {
    this.onSelectedCharacter(identifier);
  }

  constructor() {
    this.chatPaletteRegistry.register(this);
    queueMicrotask(() => this.updatePanelTitle());
    this.chatTabidentifier.set(this.chatMessageService.chatTabs[0]?.identifier ?? '');
    this._timeId = Date.now() + '_chat-palette';
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.character() && this.character()!.identifier === e.identifier) {
        this.panelService.close();
      }
      if (this.chatTabidentifier() === e.identifier) {
        this.chatTabidentifier.set(this.chatMessageService.chatTabs[0]?.identifier ?? '');
      }
    }, this.destroyRef);
    effect(() => {
      const req = this.uiSignalService.jumpIndexRequest();
      if (!req || this._timeId != req.targetId) return;
      this.japmIndex(req.lineNo);
    });
    this.destroyRef.onDestroy(() => {
      this.chatPaletteRegistry.unregister(this);
      if (this.isEdit()) this.toggleEditMode();
    });
  }

  updatePanelTitle() {
    this.panelService.title = this.character()
      ? this.t('feature.chat.palette.panelTitleWith', { name: this.character()!.name })
      : this.t('feature.chat.palette.panelTitle');
  }

  onSelectedCharacter(identifier: string) {
    if (this.isEdit()) this.toggleEditMode();
    const object = this.objectStore.get(identifier);
    if (object instanceof GameCharacter) {
      this.character.set(object);
      const char = this.character()!;
      const gameType = char.chatPalette ? char.chatPalette.dicebot : '';
      if (0 < gameType.length) this.gameType = gameType;
    }
    this.updatePanelTitle();
  }

  resizeChatInput() {
    this.chatInputComponent().kickCalcFitHeight();
  }

  /** On the panel rather than on the input, so it keeps working wherever focus sits inside it. */
  switchTabByKey(event: Event, direction: number): void {
    if (editsTextInPlace(event.target)) return;
    event.preventDefault();
    this.chatTabSwitchRelative(direction);
  }

  chatTabSwitchRelative(direction: number) {
    const chatTabs = this.chatMessageService.chatTabs;
    const index = chatTabs.findIndex((elm) => elm.identifier == this.chatTabidentifier());
    if (index < 0) {
      return;
    }

    let nextIndex: number;
    if (index == chatTabs.length - 1 && direction == 1) {
      nextIndex = 0;
    } else if (index == 0 && direction == -1) {
      nextIndex = chatTabs.length - 1;
    } else {
      nextIndex = index + direction;
    }
    this.chatTabidentifier.set(chatTabs[nextIndex].identifier);
  }

  autoCompleteSwitchRelative(direction: number) {
    const selectObj = this.completeSelectRef()?.nativeElement;
    if (!selectObj) {
      return;
    }

    const optionNum = selectObj.length;
    let newIndex = selectObj.selectedIndex;
    newIndex += direction;
    if (newIndex <= -1) {
      return;
    }
    if (newIndex >= optionNum) {
      newIndex = optionNum - 1;
    }
    selectObj.selectedIndex = newIndex;
  }

  autoCompleteDoRelative(index: number) {
    const selectObj = this.completeSelectRef()?.nativeElement;
    if (!selectObj || index != selectObj.selectedIndex) return;
    this.selectAutoComplete(this.text(), selectObj.value);
  }

  selectPalette(line: string) {
    const multiLine = line.replace(/\\n/g, '\n');
    this.text.set(multiLine);
    const selectObj = this.completeSelectRef()?.nativeElement;
    if (selectObj) {
      selectObj.selectedIndex = -1;
    }
  }

  selectAutoComplete(text: string, selectText: string) {
    const selectObj = this.completeSelectRef()?.nativeElement;
    if (!selectObj || !this.palette) return;
    const lineNo = this.palette.paletteMatchLine(text, selectObj.selectedIndex);
    this.japmIndex(lineNo);
    this.selectPalette(selectText);
  }

  completeIndex(): number {
    const selectObj = this.completeSelectRef()?.nativeElement;
    return selectObj ? selectObj.selectedIndex : -1;
  }

  autoCompleteList(): string[] {
    return this.autoCompleteListSignal();
  }

  clickPalette(line: string) {
    const multiLine = line.replace(/\\n/g, '\n');
    if (this.doubleClickTimer && this.text() === multiLine) {
      clearTimeout(this.doubleClickTimer);
      this.doubleClickTimer = null;
      this.chatInputComponent().sendChat(null);
    } else {
      this.text.set(multiLine);
      this.doubleClickTimer = setTimeout(() => {
        this.doubleClickTimer = null;
      }, 400);
    }
  }

  sendChat(value: ChatOutgoing) {
    const character = this.character();
    if (!this.chatTab || !character || !this.palette) return;

    const sent = this.characterMacro.send(character, value.text, {
      tab: this.chatTab,
      gameSystem: value.gameSystem,
      sendFrom: value.sendFrom,
      sendTo: value.sendTo,
      portraitIndex: value.portraitIndex,
      color: value.messColor,
      replyTo: value.replyTo,
      quoteOf: value.quoteOf,
      bubbles: { light: value.messBubbleLight ?? '', dark: value.messBubbleDark ?? '' },
    });
    // The palette carries the same input as the chat window, ticker switch and all, so a line
    // sent from it goes to the ticker on the same terms.
    if (sent && value.toTicker) this.chatTickerSelection.showMessage(sent.identifier);
  }

  onClickPaletteRow(row: PaletteRow): void {
    this.selectedLine.set(row.lineIndex);
    this.clickPalette(row.text);
  }

  /**
   * A line worth pressing twice belongs on the bar, where it can be reached without this panel.
   *
   * Only a line that is actually said: a heading names a group and a variable line sets a
   * number, and putting either on the bar would send the palette's own syntax to the room.
   * The browser's own menu is left alone where nothing of ours is offered in its place.
   */
  onPaletteRowMenu(row: PaletteRow, event: MouseEvent): void {
    if (row.kind !== 'command') return;
    if (!this.rolePermission.canEditTabletop) return;
    event.preventDefault();
    event.stopPropagation();

    const character = this.character();
    this.contextMenuService.open(
      { x: event.clientX, y: event.clientY },
      [
        {
          name: this.t('feature.hotbar.menu.fillFromHere'),
          action: () => {
            const draft = emptyHotbarSlotDraft('chat');
            draft.value = row.text.trim();
            draft.characterIdentifier = character?.identifier ?? '';
            draft.characterName = character?.name ?? '';
            this.hotbarFill.fill(draft);
          },
        },
      ],
      row.text.trim()
    );
  }

  resetPaletteSelect() {
    this.selectedLine.set(-1);
  }

  toggleCharacterDataView() {
    if (this.isEdit()) this.toggleEditMode();
    this.viewMode.update((m) => (m === 'palette' ? 'character' : 'palette'));
  }

  readonly characterDetailChildren = computed<DataElement[]>(() => {
    const char = this.character();
    if (!char?.detailDataElement) return [];
    this.objectChange.versionOf(char.detailDataElement.identifier)();
    return [...char.detailDataElement.children];
  });

  toggleEditMode() {
    this.isEdit.update((v) => !v);
    if (!this.palette) return;
    if (this.isEdit()) {
      const listEl = this.paletteListRef()?.nativeElement;
      this.editPalette.set(this.palette.value + '');
      const listTop = listEl?.scrollTop ?? 0;
      const listHeight = listEl?.scrollHeight ?? 1;
      setTimeout(() => {
        const textEl = this.editTextRef()?.nativeElement;
        if (textEl) {
          textEl.scrollTop = (listTop * textEl.scrollHeight) / listHeight;
        }
      }, 10);
    } else {
      this.palette.setPalette(this.editPalette());
    }
  }

  moveTest() {
    const textEl = this.editTextRef()?.nativeElement;
    if (!textEl) return;
    textEl.focus();
    setTimeout(() => {
      textEl.setSelectionRange(600, 600);
    }, 10);
  }

  japmIndex(lineNo: number) {
    this.selectedLine.set(lineNo);
    const el = this.paletteListRef()?.nativeElement;
    if (!el) return;
    const row = el.querySelector<HTMLElement>(`[data-line="${lineNo}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }

  onSelectAutoComplete(text: string, event: Event): void {
    this.selectAutoComplete(text, (event.target as HTMLInputElement).value);
  }

  indexBtn() {
    if (!this.palette) return;
    const panel: HTMLElement = this.rootElementRef().nativeElement;
    const panelBox = panel.getBoundingClientRect();

    const position = this.pointerDeviceService.pointers[0];
    position.x = panelBox.left - 8;
    position.y = panelBox.top - 8;

    this._paletteIndex = this.palette.paletteIndex;

    const index = [];
    for (const list of this._paletteIndex) {
      index.push({ name: list.name, line: list.line, id: this._timeId, action: () => {} });
    }

    this.contextMenuService.open(position, index, this.t('feature.chat.palette.indexTitle'));
  }
}
