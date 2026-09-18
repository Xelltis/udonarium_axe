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
import { splitSearchTerms } from '@axe/core/util/text-search';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { ChatPalette, PaletteIndex } from '@axe/domain/chat/chat-palette';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab, canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PaletteRow, paletteRowsOf } from '@axe/domain/chat/palette-rows';
import { DataElement } from '@axe/domain/data/data-element';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatInputComponent } from '@axe/features/chat/chat-input/chat-input.component';
import { editsTextInPlace } from '@axe/features/chat/chat-input/chat-input-helpers';
import { ChatPaletteRegistryService } from '@axe/features/chat/chat-palette/chat-palette-registry.service';
import { PaletteSearchResult, searchPaletteRows } from '@axe/features/chat/chat-palette/chat-palette-search';
import { ChatTabStripComponent } from '@axe/features/chat/chat-tab-strip/chat-tab-strip.component';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { HotbarFillService } from '@axe/features/hotbar/hotbar-fill.service';
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
  imports: [FormsModule, ChatInputComponent, ChatTabStripComponent, GameDataElementComponent, TranslocoModule],
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

  /**
   * The headings, for the list a panel in its own window is given instead of the menu.
   *
   * The menu behind the headings button opens where the pointer is, and the pointer is only
   * followed in the window the app started in, so over there it lands somewhere the reader
   * cannot see. A plain list needs nowhere to be put.
   */
  readonly paletteHeadings = computed((): PaletteRow[] => this.paletteRows().filter((row) => row.kind === 'heading'));

  readonly searchResultsRef = viewChild<ElementRef<HTMLElement>>('searchResultsList');

  /** What is typed into the search box under the palette. */
  readonly searchQuery = signal('');

  /** Whether any word is searched for, so the results are shown under the palette. */
  readonly isSearching = computed(() => splitSearchTerms(this.searchQuery()).length > 0);

  /** The lines holding what is searched for, in the order they are listed under the palette. */
  readonly searchResults = computed(() => searchPaletteRows(this.paletteRows(), this.searchQuery()));

  /**
   * The result Enter takes into the input, moved with the arrow keys; back on the first whenever the
   * results change.
   */
  readonly activeSearchResult = linkedSignal({ source: this.searchResults, computation: () => 0 });

  /** Whether this palette stands in a window of its own. */
  readonly windowed = this.panelService.windowed;

  /** The selected character's chat palette, or null when no character is selected. */
  get palette(): ChatPalette | null {
    return this.character()?.chatPalette ?? null;
  }

  private readonly _gameType = linkedSignal(() => this.character()?.chatPalette?.dicebot ?? '');
  private _paletteIndex: PaletteIndex[] = [];
  private _timeId: string = '';
  private _autoCompleteEnable = false;

  /**
   * The dice bot lines from this palette are rolled with.
   *
   * Setting it also writes the choice to the selected character's palette, so it stays with the
   * character.
   */
  get gameType(): string {
    return this._gameType();
  }
  set gameType(gameType: string) {
    this._gameType.set(gameType);
    const char = this.character();
    if (char?.chatPalette) char.chatPalette.dicebot = gameType;
  }

  /**
   * The identifier of the character the palette speaks as, or empty; setting it selects that
   * character.
   */
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

  /** The tabs this seat's role may read, as the chat window lists them. */
  readonly visibleChatTabs = computed(() => {
    const tabs = this.chatTabsVersion();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return tabs.filter((tab) => canRoleViewTab(tab, role));
  });

  /** Whether this seat's role may speak in the tab lines are sent to. */
  readonly canSpeakCurrentTab = computed(() => {
    const tab = this.visibleChatTabs().find((candidate) => candidate.identifier === this.chatTabidentifier());
    if (!tab) return false;
    return canRoleSpeakTab(tab, PeerCursor.myRole);
  });

  private doubleClickTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly diceBotCatalog = inject(DiceBotCatalogService);

  /** The dice bots there are to choose from, as listed by the dice bot catalog. */
  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }

  /** The chat tab lines from the palette are sent to, as picked from the tab pills at the top. */
  get chatTab(): ChatTab {
    return this.objectStore.get<ChatTab>(this.chatTabidentifier())!;
  }
  /** The cursor of the local peer, the player using this palette. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }
  /** Every peer cursor in the room, the local peer's own included. */
  get otherPeers(): PeerCursor[] {
    return this.objectStore.getObjects(PeerCursor);
  }

  /**
   * Switches the palette to a character, for the NPC bar and the owned-character list to call
   * through the palette registry.
   */
  setCharacterById(identifier: string): void {
    this.onSelectedCharacter(identifier);
  }

  constructor() {
    this.chatPaletteRegistry.register(this);
    queueMicrotask(() => this.updatePanelTitle());
    this.chatTabidentifier.set(this.visibleChatTabs()[0]?.identifier ?? '');
    this._timeId = Date.now() + '_chat-palette';
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.character() && this.character()!.identifier === e.identifier) {
        this.panelService.close();
      }
    }, this.destroyRef);
    effect(() => {
      const visible = this.visibleChatTabs();
      const current = this.chatTabidentifier();
      if (!visible.some((tab) => tab.identifier === current)) this.chatTabidentifier.set(visible[0]?.identifier ?? '');
    });
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

  /**
   * Sets the panel title to name the selected character, or to the plain palette title when none is
   * selected.
   */
  updatePanelTitle() {
    this.panelService.title = this.character()
      ? this.t('feature.chat.palette.panelTitleWith', { name: this.character()!.name })
      : this.t('feature.chat.palette.panelTitle');
  }

  /**
   * Switches the palette to the character with this identifier.
   *
   * An open edit is saved first, and the character's dice bot is taken up when it has one. An
   * identifier that is not a character leaves the selection as it was but still refreshes the
   * title.
   */
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

  /** Asks the chat input to refit its height to the text it holds. */
  resizeChatInput() {
    this.chatInputComponent().kickCalcFitHeight();
  }

  /** On the panel rather than on the input, so it keeps working wherever focus sits inside it. */
  switchTabByKey(event: Event, direction: number): void {
    if (editsTextInPlace(event.target)) return;
    event.preventDefault();
    this.chatTabSwitchRelative(direction);
  }

  /**
   * Moves the target chat tab one step either way, wrapping round at the ends; Ctrl+Left and
   * Ctrl+Right call it.
   *
   * Does nothing when the current tab is no longer in the list.
   */
  chatTabSwitchRelative(direction: number) {
    const chatTabs = this.visibleChatTabs();
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

  /**
   * Moves the highlight in the autocomplete list up or down when the chat input asks with the arrow
   * keys.
   *
   * It stops at the last entry, and does nothing when it would move above the first or when no list
   * is showing.
   */
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

  /**
   * Takes the highlighted autocomplete entry into the input when the chat input asks for it,
   * provided the index it passes is still the highlighted one.
   */
  autoCompleteDoRelative(index: number) {
    const selectObj = this.completeSelectRef()?.nativeElement;
    if (!selectObj || index != selectObj.selectedIndex) return;
    this.selectAutoComplete(this.text(), selectObj.value);
  }

  /**
   * Puts a palette line into the input, turning each written `\n` into a real line break, and
   * clears the autocomplete highlight.
   */
  selectPalette(line: string) {
    const multiLine = line.replace(/\\n/g, '\n');
    this.text.set(multiLine);
    const selectObj = this.completeSelectRef()?.nativeElement;
    if (selectObj) {
      selectObj.selectedIndex = -1;
    }
  }

  /**
   * Takes an autocomplete entry into the input and scrolls the palette to the line it matched; does
   * nothing when no list is open.
   */
  selectAutoComplete(text: string, selectText: string) {
    const selectObj = this.completeSelectRef()?.nativeElement;
    if (!selectObj || !this.palette) return;
    const lineNo = this.palette.paletteMatchLine(text, selectObj.selectedIndex);
    this.japmIndex(lineNo);
    this.selectPalette(selectText);
  }

  /**
   * The index highlighted in the autocomplete list, or -1 when nothing is highlighted or the list
   * is closed.
   */
  completeIndex(): number {
    const selectObj = this.completeSelectRef()?.nativeElement;
    return selectObj ? selectObj.selectedIndex : -1;
  }

  /** The palette lines matching what is typed; empty until at least two characters are typed. */
  autoCompleteList(): string[] {
    return this.autoCompleteListSignal();
  }

  /**
   * Puts a clicked palette line into the input, and sends it when the same line is clicked again
   * within 400 ms.
   */
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

  /**
   * Sends what the chat input submitted, as the selected character and through that character's
   * macros.
   *
   * Does nothing without a chat tab, a character or a palette. A line sent with the ticker switch
   * on is shown on the ticker as well.
   */
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

  /**
   * Highlights the command row the user clicked and puts its line into the input, sending it on a
   * second click.
   */
  onClickPaletteRow(row: PaletteRow): void {
    this.selectedLine.set(row.lineIndex);
    this.clickPalette(row.text);
  }

  /**
   * Puts a search result into the input and picks out its line in the palette, sending it on a
   * second click, as a palette row does.
   */
  pickSearchResult(result: PaletteSearchResult): void {
    this.onClickPaletteRow(result.row);
    this.japmIndex(result.row.lineIndex);
  }

  /**
   * The keys of the search box: the arrows move through the results, Enter takes the one picked out
   * into the input without sending it and moves on to the input, and Escape clears the search.
   * Nothing is done while an IME is composing.
   */
  onSearchKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const results = this.searchResults();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(results.length - 1, Math.max(0, this.activeSearchResult() + step));
      this.activeSearchResult.set(next);
      this.searchResultsRef()
        ?.nativeElement.querySelectorAll<HTMLElement>('[data-result-line]')
        [next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      const result = results[this.activeSearchResult()];
      if (!result) return;
      event.preventDefault();
      this.selectPalette(result.row.text);
      this.japmIndex(result.row.lineIndex);
      this.chatInputComponent().textAreaElementRef()?.nativeElement.focus();
    } else if (event.key === 'Escape') {
      if (this.searchQuery() === '') return;
      event.preventDefault();
      event.stopPropagation();
      this.clearSearch();
    }
  }

  /** Empties the search box, which takes the results away. */
  clearSearch(): void {
    this.searchQuery.set('');
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

  /** Clears the highlight from the palette list. */
  resetPaletteSelect() {
    this.selectedLine.set(-1);
  }

  /**
   * Switches between the palette list and a read-only view of the character's details, saving any
   * open edit first.
   */
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

  /**
   * Opens the palette text for editing, or writes the edited text back to the palette when editing
   * ends.
   *
   * On opening, the text area is scrolled to about where the list was. It also runs when the panel
   * closes mid-edit, so an edit is never lost by closing.
   */
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

  /** Focuses the palette text area and puts the caret at the 600th character. */
  moveTest() {
    const textEl = this.editTextRef()?.nativeElement;
    if (!textEl) return;
    textEl.focus();
    setTimeout(() => {
      textEl.setSelectionRange(600, 600);
    }, 10);
  }

  /**
   * Highlights a palette line and scrolls it into view; a heading picked from the headings menu or
   * list lands here.
   */
  japmIndex(lineNo: number) {
    this.selectedLine.set(lineNo);
    const el = this.paletteListRef()?.nativeElement;
    if (!el) return;
    const row = el.querySelector<HTMLElement>(`[data-line="${lineNo}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }

  /** Takes the entry the user clicked or moved to in the autocomplete dropdown into the input. */
  onSelectAutoComplete(text: string, event: Event): void {
    this.selectAutoComplete(text, (event.target as HTMLInputElement).value);
  }

  /** Jumps to the heading picked from the list, and takes the list back to its own label. */
  onSelectHeading(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const picked = select.value;
    select.selectedIndex = 0;
    if (picked === '') return;
    this.japmIndex(Number(picked));
  }

  /**
   * Opens the headings menu at the palette's top-left corner, where picking a heading jumps the
   * list to it.
   *
   * Does nothing without a palette. The menu entries carry this palette's own id, so the jump comes
   * back to this panel rather than another open palette.
   */
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
