import { DatePipe, NgClass, NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatBookmarkService } from '@axe/application/chat/chat-bookmark.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { ChatReactionService, ReactionTally } from '@axe/application/chat/chat-reaction.service';
import { ChatTickerSelectionService } from '@axe/application/chat/chat-ticker-selection.service';
import { SystemAvatarKind, SystemAvatarService } from '@axe/application/chat/system-avatar.service';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatBookmarkKind } from '@axe/domain/chat/chat-bookmark';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { encodeVnEmote, vnBodyOf, vnEmoteOf } from '@axe/domain/visual-novel/vn-emote';
import { ChatComposeService } from '@axe/features/chat/chat-compose.service';
import {
  buildChatBookmarkMenu,
  buildChatMessageContextMenu,
} from '@axe/features/chat/chat-message/chat-message-context-menu';
import { isChatTextHidden, readableChatText } from '@axe/features/chat/chat-message/chat-readable-text';
import { formatChatTickerMessage } from '@axe/features/chat/chat-ticker/chat-ticker-layout';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { SystemAvatarMenuService } from '@axe/features/chat/system-avatar-menu.service';
import { vnEmoteLabels } from '@axe/features/visual-novel/visual-novel-emote-label';
import { DiceRollStageComponent } from '@axe/ui/components/dice-roll-stage/dice-roll-stage.component';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { ChatColorStylePipe } from '@axe/ui/pipes/chat-color-style.pipe';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { decorateChatStyleText } from '@axe/ui/text-decoration/decorate-chat-text';
import { TranslocoModule } from '@jsverse/transloco';

/** How long a line stays lit after a jump to it, before it fades back. */
const LINE_FLASH_MS = 1800;

/** The kinds of mark a line can carry, in the order they are offered. */
const BOOKMARK_KINDS: readonly ChatBookmarkKind[] = ['shared', 'personal'];

@Component({
  selector: 'chat-message',
  templateUrl: './chat-message.component.html',
  host: {
    class: 'block',
    '[attr.data-message-id]': 'chatMessage?.identifier',
    '[class.chat-message-highlight]': 'isHighlighted()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StampComponent,
    NgClass,
    NgStyle,
    NgTemplateOutlet,
    DatePipe,
    FormsModule,
    LinkifyPipe,
    ChatColorStylePipe,
    SafePipe,
    TranslocoModule,
    DiceRollStageComponent,
  ],
})
export class ChatMessageComponent {
  /** The panels a bubble has to read against, which a skin may have moved. */
  protected readonly skins = inject(SkinService);

  private readonly chatMessageService = inject(ChatMessageService);
  private readonly chatBookmarks = inject(ChatBookmarkService);
  private readonly chatTickerSelection = inject(ChatTickerSelectionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly uiSignalService = inject(UiSignalService);
  /** The panel this line is being read in, where it is being read in one that can answer. */
  private readonly compose = inject(ChatComposeService, { optional: true });
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly tabletopDisplay = inject(TabletopDisplayService);
  protected readonly theme = inject(ThemeService);
  private readonly systemAvatar = inject(SystemAvatarService);
  private readonly systemAvatarMenu = inject(SystemAvatarMenuService);
  private readonly chatPrefs = inject(ChatPreferencesService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly confirm = inject(ConfirmService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly viewport = inject(ViewportService);

  protected get canRevealSecret(): boolean {
    return this.rolePermission.canSeeHidden;
  }

  protected readonly chatMessageInput = input<ChatMessage>(null!, { alias: 'chatMessage' });

  /**
   * Whether the line is only to be read.
   *
   * A window that shows a tab's lines going past is for following them, not for working on
   * them, so it offers none of the buttons that hover over a line.
   */
  readonly readOnly = input(false);

  /** Whether the pencil is offered on this line. */
  get canChange(): boolean {
    return !this.readOnly() && (this.chatMessage?.changeable ?? false) && !this.chatMessage.sentStamp;
  }

  /** The stamp the line was sent as, drawn large in place of its words; null for a line of words. */
  protected readonly sentStamp = computed(() => {
    const message = this.chatMessageInput();
    if (!message) return null;
    this.objectChange.versionOf(message.identifier)();
    return message.sentStamp;
  });
  /** The message this row draws, as passed in through the `chatMessage` input. */
  get chatMessage(): ChatMessage {
    return this.chatMessageInput();
  }

  /** Whether the line was posted by the app itself, whose name and text are translation keys to decode. */
  get isSystemMessage(): boolean {
    return !!this.chatMessage?.isSystemMessage;
  }

  readonly simpleDispFlagTime = input(false);
  readonly simpleDispFlagUserId = input(false);
  readonly chatSimpleDispFlag = input(false);

  /** The bubble the sender asked for on the theme being looked at, if they asked for one. */
  protected bubbleFor(message: ChatMessage): string {
    return this.theme.resolved() === 'dark' ? message.messBubbleDark : message.messBubbleLight;
  }

  /**
   * Whether the line is still under wraps, read through the object's version.
   *
   * Revealing a secret roll only changes the message's tag. Nothing else this component
   * draws while the line is hidden depends on that message, so without a version to watch
   * the view keeps the cover on until some unrelated thing forces it to draw again - which
   * looks exactly like the reveal failing to reach the other players.
   */
  readonly isSecret = computed(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return false;
    this.objectChange.versionOf(chatMessage.identifier)();
    return chatMessage.isSecret;
  });

  readonly isDirect = computed(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return false;
    this.objectChange.versionOf(chatMessage.identifier)();
    return chatMessage.isDirect;
  });

  /**
   * The marks on the line, the room's and this reader's own, each by the name it shows under, or null
   * for a kind the line does not carry.
   */
  readonly bookmarks = computed<Record<ChatBookmarkKind, { name: string } | null>>(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return { shared: null, personal: null };
    this.objectChange.versionOf(chatMessage.identifier)();
    const markOf = (kind: ChatBookmarkKind) =>
      this.chatBookmarks.isBookmarked(chatMessage, kind)
        ? { name: this.chatBookmarks.nameOf(chatMessage, kind) }
        : null;
    return { shared: markOf('shared'), personal: markOf('personal') };
  });

  /** Every wording the line has had, oldest first, or none where no earlier wording was kept. */
  readonly versions = computed(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return [];
    this.objectChange.versionOf(chatMessage.identifier)();
    this.objectChange.trackMyCursor();
    // Words kept from this reader, as a secret roll's are, are kept from them in every wording.
    if (isChatTextHidden(chatMessage, this.canRevealSecret)) return [];
    return chatMessage.versions;
  });

  /** Whether the line's history of edits is open under it. */
  readonly isHistoryOpen = signal(false);

  /** Opens the line's history of edits under it, or closes it, from the edited mark or the line's menu. */
  toggleHistory(): void {
    if (this.versions().length === 0) return;
    this.isHistoryOpen.update((open) => !open);
  }

  /** An earlier wording of the line as HTML, with markup escaped and the chat's decorations applied. */
  protected decorateVersion(text: string): string {
    return decorateChatStyleText(text);
  }

  readonly isEdited = computed(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return false;
    this.objectChange.versionOf(chatMessage.identifier)();
    return chatMessage.fixd;
  });

  readonly systemAvatarImage = computed<{ kind: SystemAvatarKind; url: string; isSpeaker: boolean } | null>(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return null;
    const isSystem = chatMessage.isSystemMessage;
    if (!isSystem && !(chatMessage.isDicebot && !this.imageFile().url)) return null;
    const kind: SystemAvatarKind = isSystem ? 'system' : 'dice';

    if (this.systemAvatar.isSpeakerVisible()) {
      const speakerUrl = this.speakerImageUrl();
      if (speakerUrl.length > 0) return { kind, url: speakerUrl, isSpeaker: true };
    }
    if (!this.systemAvatar.isVisible()) return null;
    const url = isSystem ? this.systemAvatar.systemUrl() : this.systemAvatar.diceUrl();
    if (url.length < 1) return null;
    return { kind, url, isSpeaker: false };
  });

  private readonly speakerImageUrl = computed<string>(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return '';
    const character = this.rollSourceImageUrl();
    if (character.length > 0) return character;
    const own = this.imageFile().url;
    if (own.length > 0) return own;
    this.objectChange.collectionOf('PeerCursor')();
    const userId = chatMessage.originFrom || chatMessage.from;
    if (!userId) return '';
    return PeerCursor.findByUserId(userId)?.image?.url ?? '';
  });

  /** The line a dice result answers, once it has been found in the tab. */
  private rollSource: { dice: string; source: string } | null = null;

  /**
   * The picture of the line a dice result answers.
   *
   * Until that line is found the whole tab is followed, since it may yet arrive. Once found only
   * that line is, so a tab that keeps growing does not send every dice row looking again.
   */
  private rollSourceImageUrl(): string {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage?.isDicebot) return '';
    this.objectChange.fileVersion();
    const chatTab = this.objectStore.get<ChatTab>(chatMessage.tabIdentifier);
    if (!chatTab) return '';
    const found = this.rollSource;
    if (found?.dice === chatMessage.identifier) {
      this.objectChange.versionOf(found.source)();
      const source = this.objectStore.get<ChatMessage>(found.source);
      if (source?.parent === chatTab) return source.image?.url ?? '';
      this.rollSource = null;
    }
    this.objectChange.versionOf(chatTab.identifier)();
    const source = chatTab.findRollSource(chatMessage);
    if (source) this.rollSource = { dice: chatMessage.identifier, source: source.identifier };
    return source?.image?.url ?? '';
  }

  protected onSystemAvatarContextMenu(event: Event, kind: SystemAvatarKind): void {
    this.systemAvatarMenu.openContextMenu(event, kind);
  }

  /**
   * What can be done with the line, opened by a right click or a press held on it.
   *
   * The buttons over a line only show under a mouse, so a touch screen reaches the same actions
   * through this. A link keeps the browser's own menu, and so does a line being edited. So does a
   * right click while words reaching into the line are picked out, which is how they are copied
   * with a mouse; a press held on a touch screen still opens this, and copies just those words.
   * Pictures keep the browser's menu as {@link keepsBrowserMenu} tells, and nothing opens over
   * words being picked out on a touch screen, where the system's own handles are over them.
   */
  protected onMessageContextMenu(event: MouseEvent): void {
    const message = this.chatMessage;
    if (!message || this.readOnly() || this.isEditing()) return;
    if (this.isSelectingText()) return;
    if (this.keepsBrowserMenu(event.target)) return;
    const picked = this.wordsPickedOutIn(this.hostElement.nativeElement);
    if (picked.reachesLine && !this.viewport.isTouch()) return;
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const actions = this.lineActions(picked.inside);
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, this.displayName(message.name), {
      forGuests: true,
    });
  }

  /**
   * Everything that can be done with the line, as the menu offers it: what a right click or a press
   * held on the line opens, and the toolbar's last button. `selectedText` is the words picked out
   * inside the line, copied in place of all of it; empty where none are.
   *
   * Each item is offered only to whoever may do it, so the menu is opened for a guest too, who finds
   * in it what a guest may do: copying the words, keeping marks of their own, reading round the line.
   */
  private lineActions(selectedText: string): ContextMenuAction[] {
    const message = this.chatMessage;
    return buildChatMessageContextMenu(
      {
        canInteract: this.canInteract,
        canReact: this.canReact,
        canShareAsMemo: this.canShareAsMemo,
        canChange: this.canChange,
        afterWhisperTargets: this.canMakeAfterWhisper
          ? this.whisperTargets().map((peer) => ({ identifier: peer.identifier, name: peer.name }))
          : null,
        bookmarkKinds: this.bookmarkKinds(),
        canUndoAfterWhisper: this.canUndoAfterWhisper,
        canPseudoDelete: this.canPseudoDelete,
        canShowInTicker: this.canShowInTicker(),
        copyTargets: this.canCopyToTab ? this.copyTargets() : [],
        hasOriginal: !!(this.replyPreview() || this.quotePreview()),
        hasHistory: this.versions().length > 0,
        isHistoryOpen: this.isHistoryOpen(),
        text: this.readableText(message),
        selectedText,
        isTouch: this.viewport.isTouch(),
      },
      {
        reply: () => this.clickReply(),
        quote: () => this.clickQuote(),
        react: () => this.openReactionPicker(this.hostElement.nativeElement),
        copyToTab: (identifier) => {
          const tab = this.copyTargets().find((candidate) => candidate.identifier === identifier);
          if (tab) this.copyToTab(tab);
        },
        shareAsMemo: () => this.clickShareAsMemo(),
        edit: () => this.startEdit(),
        whisperTo: (identifier) => {
          const peer = this.whisperTargets().find((candidate) => candidate.identifier === identifier);
          if (peer) this.whisperTo(peer);
        },
        toggleBookmark: (kind) => this.toggleBookmark(kind),
        undoAfterWhisper: () => this.undoAfterWhisper(),
        pseudoDelete: () => void this.pseudoDelete(),
        showInTicker: () => this.clickShowInTicker(),
        toggleHistory: () => this.toggleHistory(),
        jumpToOriginal: () => (this.replyPreview() ? this.jumpToReplyTarget() : this.jumpToQuoteTarget()),
        copyText: (text) => this.copyText(text),
        selectText: () => this.selectText(),
      },
      this.t
    );
  }

  /** The kinds of mark the reader may put on the line or take off, with whether it carries each. */
  private bookmarkKinds(): { kind: ChatBookmarkKind; isBookmarked: boolean }[] {
    return BOOKMARK_KINDS.filter((kind) => this.canBookmark(kind)).map((kind) => ({
      kind,
      isBookmarked: !!this.bookmarks()[kind],
    }));
  }

  /**
   * The answers the toolbar over the line offers at once, or null where it offers nothing: a line
   * only to be read, a line being edited, or one nothing can be done with.
   *
   * Deleting stands there beside editing, both being what the speaker does to their own line; it
   * asks before it deletes, so having it at hand does not make it easy to do by mistake.
   */
  protected toolbarActions(): {
    answer: boolean;
    react: boolean;
    bookmark: boolean;
    edit: boolean;
    delete: boolean;
  } | null {
    const message = this.chatMessage;
    if (!message || this.readOnly() || this.isEditing()) return null;
    const actions = {
      answer: this.canInteract,
      react: this.canReact,
      bookmark: this.canBookmarkAny,
      edit: this.canChange,
      delete: this.canPseudoDelete,
    };
    // Asked of every drawn line on every pass, so it is told from these few answers rather than by
    // building the menu: the menu holds at least the words of any line whose words are shown.
    const words = !isChatTextHidden(message, this.canRevealSecret) && (message.text ?? '').trim().length > 0;
    return actions.answer || actions.react || actions.bookmark || actions.edit || actions.delete || words
      ? actions
      : null;
  }

  /** Opens everything that can be done with the line under the toolbar's last button. */
  protected openMoreMenu(event: MouseEvent): void {
    const actions = this.lineActions('');
    if (actions.length === 0) return;
    this.openMenuUnder(event, actions, this.displayName(this.chatMessage.name));
  }

  /** Opens the choice of the room's mark and the reader's own under the toolbar's bookmark button. */
  protected openBookmarkMenu(event: MouseEvent): void {
    const actions = buildChatBookmarkMenu(this.bookmarkKinds(), (kind) => this.toggleBookmark(kind), this.t);
    if (actions.length === 0) return;
    this.openMenuUnder(event, actions, this.t('feature.chat.message.bookmarks.button'));
  }

  private openMenuUnder(event: MouseEvent, actions: ContextMenuAction[], title: string): void {
    event.stopPropagation();
    const button = event.currentTarget instanceof Element ? event.currentTarget : null;
    const box = button?.getBoundingClientRect();
    const at = box ? { x: box.left, y: box.bottom + 2 } : this.pointerDeviceService.pointers[0];
    this.contextMenuService.open(at, actions, title, { forGuests: true });
  }

  /**
   * Whether a right click or a press held on this part of the line is left to the browser.
   *
   * A link or a text box always is. So is a picture sent with the line, whose browser menu is the
   * only way to open or save it. Any other picture, such as the speaker's portrait, is under a
   * mouse; a press held on it on a touch screen opens the line's menu instead.
   */
  private keepsBrowserMenu(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target.closest('a, textarea, input, .message-attachment-image')) return true;
    return !this.viewport.isTouch() && target.closest('img') !== null;
  }

  /**
   * The words picked out on the page as they bear on a line: whether any of them reach into it,
   * and their text where all of them lie inside it.
   */
  private wordsPickedOutIn(line: Element): { reachesLine: boolean; inside: string } {
    const selection = line.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
      return { reachesLine: false, inside: '' };
    }
    const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));
    if (!ranges.some((range) => range.intersectsNode(line))) return { reachesLine: false, inside: '' };
    const allInside = ranges.every((range) => line.contains(range.commonAncestorContainer));
    return { reachesLine: true, inside: allInside ? selection.toString() : '' };
  }

  /** The words of a line as this reader is shown them, or nothing where they are kept from the reader. */
  private readableText(message: ChatMessage): string {
    return readableChatText(message, isChatTextHidden(message, this.canRevealSecret), this.t);
  }

  private copyText(text: string): void {
    if (text.length === 0) return;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  /**
   * Whether the words of this line may be picked out on a touch screen.
   *
   * They otherwise may not there, so that a press held on the line opens its menu rather than
   * starting to pick them out.
   */
  protected readonly isSelectingText = signal(false);

  private readonly messageBody = viewChild<ElementRef<HTMLElement>>('messageBody');
  private readonly injector = inject(Injector);
  private stopFollowingSelection: (() => void) | null = null;

  /**
   * Lets the words of this line be picked out, and picks them all out so the system's handles and
   * its own actions for them come up.
   *
   * That lasts until the words are let go or moved off the line, or something off the line is tapped.
   */
  selectText(): void {
    this.isSelectingText.set(true);
    afterNextRender(() => this.pickOutBody(), { injector: this.injector });
  }

  private pickOutBody(): void {
    const body = this.messageBody()?.nativeElement;
    const selection = body?.ownerDocument.getSelection();
    if (!body || !selection) {
      this.endSelectingText();
      return;
    }
    const range = body.ownerDocument.createRange();
    range.selectNodeContents(body);
    selection.removeAllRanges();
    selection.addRange(range);
    this.followSelection(body.ownerDocument);
  }

  private followSelection(page: Document): void {
    const line = this.hostElement.nativeElement;
    const onSelectionChange = () => {
      if (!this.wordsPickedOutIn(line).reachesLine) this.endSelectingText();
    };
    const onPointerDown = (event: Event) => {
      if (event.target instanceof Node && line.contains(event.target)) return;
      const stillPicked = this.wordsPickedOutIn(line).reachesLine;
      this.endSelectingText();
      if (stillPicked) page.getSelection()?.removeAllRanges();
    };
    page.addEventListener('selectionchange', onSelectionChange);
    page.addEventListener('pointerdown', onPointerDown, true);
    this.stopFollowingSelection = () => {
      page.removeEventListener('selectionchange', onSelectionChange);
      page.removeEventListener('pointerdown', onPointerDown, true);
    };
  }

  private endSelectingText(): void {
    this.stopFollowingSelection?.();
    this.stopFollowingSelection = null;
    this.isSelectingText.set(false);
  }

  readonly imageFile = computed(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return ImageFile.Empty;
    this.objectChange.versionOf(chatMessage.identifier)();
    this.objectChange.fileVersion();
    return chatMessage.image ?? ImageFile.Empty;
  });
  readonly attachmentImageFiles = computed(() => {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage) return [];
    this.objectChange.versionOf(chatMessage.identifier)();
    this.objectChange.fileVersion();
    return chatMessage.attachmentImageIdentifierList
      .map((identifier) => this.imageStorage.get(identifier))
      .filter((image): image is ImageFile => image != null);
  });
  readonly animeState = signal<string>('inactive');

  constructor() {
    effect(() => {
      const chatMessage = this.chatMessageInput();
      const time = this.chatMessageService.getTime();
      if (time - 10 * 1000 < chatMessage.timestamp) this.animeState.set('active');
    });
  }

  /** The room's list of chat tabs, which the tabs a line can be copied into are chosen from. */
  get chatTabList(): ChatTabList {
    return this.objectStore.get<ChatTabList>('ChatTabList')!;
  }

  /** Whether the button to show a kept-back roll is this reader's to press. */
  canDisclose(): boolean {
    return this.chatMessageService.canDiscloseMessage(this.chatMessage);
  }

  /** Reveals a kept-back roll to the room, from the button shown on the hidden line. */
  discloseMessage() {
    this.chatMessageService.discloseMessage(this.chatMessage);
  }

  readonly editDraft = signal<string | null>(null);
  readonly isEditing = computed(() => this.editDraft() !== null);
  readonly editingTextArea = viewChild<ElementRef<HTMLTextAreaElement>>('editingTextArea');

  /**
   * Opens the line for editing in place, from the pencil button or the line's menu.
   *
   * The draft starts from the words alone, without any novel-mode staging, and the text area is
   * focused with the caret at the end once it is drawn. Does nothing for a line that may not change.
   */
  startEdit() {
    if (!this.chatMessage.changeable) return;
    this.editDraft.set(vnBodyOf(this.chatMessage.vnEmote, this.chatMessage.text ?? ''));
    setTimeout(() => {
      const el = this.editingTextArea()?.nativeElement;
      if (el) {
        this.autoFitHeight(el);
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  /**
   * Writes the draft back to the message and closes the editor.
   *
   * Trailing space is dropped, and a draft left empty is treated as a cancel. A change marks the line
   * as edited, keeps what it said before in its history, and reaches the room through the synced
   * message; an unchanged draft writes nothing.
   */
  saveEdit() {
    const draft = this.editDraft();
    if (draft === null) return;
    const next = draft.trimEnd();
    if (next.length === 0) {
      this.cancelEdit();
      return;
    }
    // A line said before the staging was kept apart still carries it at the end. Editing the
    // body would take it away with the rest of the suffix, so it moves beside the line first.
    const staging = encodeVnEmote(vnEmoteOf(this.chatMessage.vnEmote, this.chatMessage.text ?? ''));
    this.chatMessage.edit(next, staging, this.chatMessageService.getTime());
    this.editDraft.set(null);
  }

  /** Closes the editor and throws the draft away, leaving the message as it was. */
  cancelEdit() {
    this.editDraft.set(null);
  }

  /** Keeps the draft in step with the edit box and grows the box to fit, up to its height limit. */
  onEditInput(value: string) {
    this.editDraft.set(value);
    const el = this.editingTextArea()?.nativeElement;
    if (el) this.autoFitHeight(el);
  }

  /** Escape cancels the edit and Enter saves it; Shift+Enter and keys pressed mid-composition type as usual. */
  onEditKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.saveEdit();
    }
  }

  private autoFitHeight(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  /** The words for how novel mode was asked to stage this line, when the reader asked to see them. */
  readonly emoteBadges = computed<string[]>(() => {
    if (!this.chatPrefs.showVnEmoteBadge()) return [];
    const message = this.chatMessageInput();
    if (!message) return [];
    this.language.currentLang();
    this.objectChange.versionOf(message.identifier)();
    return vnEmoteLabels(vnEmoteOf(message.vnEmote, message.text ?? ''), this.t);
  });

  readonly replyPreview = computed<{ name: string; text: string } | null>(() => {
    const msg = this.chatMessageInput();
    if (!msg || !msg.replyTo) return null;
    this.objectChange.versionOf(msg.identifier)();
    this.objectChange.versionOf(msg.replyTo)();
    const target = msg.replyToMessage;
    // A line kept from the reader's chat, a whisper they were not part of or a deleted one, is not
    // shown through an answer to it.
    if (!target || !target.isShownInChat) return null;
    const text = this.isTextKeptFromReader(target)
      ? this.t('feature.chat.message.secretDice')
      : vnBodyOf(target.vnEmote, target.text ?? '')
          .replace(/\s+/g, ' ')
          .trim();
    return {
      name: target.name ?? '',
      text: text.length > 120 ? text.slice(0, 120) + '…' : text,
    };
  });

  readonly quotePreview = computed<{ name: string; text: string } | null>(() => {
    const msg = this.chatMessageInput();
    if (!msg || !msg.quoteOf) return null;
    this.objectChange.versionOf(msg.identifier)();
    this.objectChange.versionOf(msg.quoteOf)();
    const target = this.objectStore.get<ChatMessage>(msg.quoteOf);
    if (!(target instanceof ChatMessage) || !target.isShownInChat) return null;
    const text = this.isTextKeptFromReader(target)
      ? this.t('feature.chat.message.secretDice')
      : vnBodyOf(target.vnEmote, target.text ?? '').trim();
    return {
      name: target.name ?? '',
      text: text.length > 280 ? text.slice(0, 280) + '…' : text,
    };
  });

  /**
   * Whether the words of a quoted or replied-to line are kept from this reader, as a secret roll's
   * are, so that what stands in for them follows the reader's role and language.
   */
  private isTextKeptFromReader(message: ChatMessage): boolean {
    if (!message.isSecret) return false;
    this.objectChange.trackMyCursor();
    this.language.currentLang();
    return isChatTextHidden(message, this.canRevealSecret);
  }

  /**
   * Whether a message can be replied to, quoted or made into a note.
   *
   * Nothing in a read-only view can, nor can system messages or notices addressed to a player. A
   * dice bot's answer (`isDicebot`) can: it carries the system tag, but it answers a player's roll.
   */
  get canInteract(): boolean {
    if (this.readOnly()) return false;
    const msg = this.chatMessage;
    if (!msg) return false;
    if (this.isSystemMessage) return false;
    if (msg.isSystemToPL) return false;
    return true;
  }

  /**
   * Whether a stamp may be put on the line: any line that may be answered and that the reader is
   * shown, a dice bot's answer to a roll among them, by a guest as much as a player, since it changes
   * nothing on the table.
   */
  get canReact(): boolean {
    return this.canInteract && this.chatMessage.isShownInChat;
  }

  private readonly reactionTallies = computed<readonly ReactionTally[]>(
    () => {
      const message = this.chatMessageInput();
      if (!message) return [];
      this.objectChange.versionOf(message.identifier)();
      if (!message.isShownInChat) return [];
      return this.reactions.talliesOf(message.identifier);
    },
    { equal: sameTallies }
  );

  /**
   * The stamps on the line, each with a number that goes up whenever more people put it on while the
   * line is in view, for it to make its move then and not every time the line is drawn again.
   */
  protected readonly reactionChips = linkedSignal<
    readonly ReactionTally[],
    readonly (ReactionTally & { readonly play: number })[]
  >({
    source: this.reactionTallies,
    computation: (tallies, previous) =>
      tallies.map((tally) => {
        const before = previous?.value.find((chip) => chip.stampId === tally.stampId);
        if (!before) return { ...tally, play: previous ? 1 : 0 };
        return { ...tally, play: tally.count > before.count ? before.play + 1 : before.play };
      }),
  });

  /** Who put a stamp on the line, as the reader's language lists names. */
  protected reactionNames(tally: ReactionTally): string {
    const lang = this.language.currentLang();
    try {
      return new Intl.ListFormat(lang, { style: 'short', type: 'conjunction' }).format(tally.names);
    } catch {
      return tally.names.join(', ');
    }
  }

  /** Puts a stamp on the line for the reader, or takes it back off. */
  protected toggleReaction(stampId: string): void {
    if (!this.canReact) return;
    this.reactions.toggle(this.chatMessage, stampId);
  }

  /** Opens the stamps under the toolbar's button, or under the line on a touch screen. */
  protected openReactionPicker(anchor: EventTarget | null): void {
    if (!this.canReact || !(anchor instanceof Element)) return;
    const message = this.chatMessage;
    this.stampPicker.toggle(anchor, (stampId) => this.reactions.toggle(message, stampId));
  }

  readonly canShowInTicker = computed(() => {
    // A window that only reads the log offers none of the buttons that act on a line.
    if (this.readOnly()) return false;
    // The band runs round everybody's table, which a guest is there to watch, not to change.
    this.objectChange.trackMyCursor();
    if (!this.rolePermission.canEditTabletop) return false;

    // Only where the band is actually drawn, which is a table looked straight down on.
    if (!this.tabletopService.mode2d()) return false;
    if (!this.tabletopDisplay.settings().multiAngleTickerEnabled) return false;
    const message = this.chatMessageInput();
    if (!message) return false;
    this.objectChange.versionOf(message.identifier)();
    return formatChatTickerMessage(message) != null;
  });

  /**
   * Asks the chat input to reply to this line, from the reply button or the line's menu.
   *
   * Asked of the panel this line is being read in. A line read somewhere with no input of its
   * own to answer in asks the room instead, and whatever input is out there takes it.
   */
  clickReply() {
    if (!this.canInteract) return;
    if (this.compose) this.compose.requestReply(this.chatMessage.identifier);
    else this.uiSignalService.requestChatReply(this.chatMessage.identifier);
  }

  /** Asks the chat input to quote this line, the same way and for the same reason. */
  clickQuote() {
    if (!this.canInteract) return;
    if (this.compose) this.compose.requestQuote(this.chatMessage.identifier);
    else this.uiSignalService.requestChatQuote(this.chatMessage.identifier);
  }

  /** Whether this reader may put a mark of the kind on the line, or take it off. */
  canBookmark(kind: ChatBookmarkKind): boolean {
    if (this.readOnly()) return false;
    const message = this.chatMessage;
    return !!message && this.chatBookmarks.canBookmark(message, kind);
  }

  /** Whether the bookmark button is offered: the reader may mark the line with one kind or the other. */
  get canBookmarkAny(): boolean {
    return BOOKMARK_KINDS.some((kind) => this.canBookmark(kind));
  }

  /** Marks the line with the kind to find again, or takes that mark off, from the choice or the line's menu. */
  toggleBookmark(kind: ChatBookmarkKind): void {
    if (!this.canBookmark(kind)) return;
    this.chatBookmarks.toggle(this.chatMessage, kind);
  }

  /** Whether this reader may make the line an after-the-fact whisper, which they may of a line they said. */
  get canMakeAfterWhisper(): boolean {
    if (this.readOnly()) return false;
    const message = this.chatMessage;
    return !!message && this.chatMessageService.canMakeAfterWhisper(message);
  }

  /** Whether this reader may put the line, which they made an after-the-fact whisper, back for everyone. */
  get canUndoAfterWhisper(): boolean {
    if (this.readOnly()) return false;
    const message = this.chatMessage;
    return !!message && this.chatMessageService.canUndoAfterWhisper(message);
  }

  /**
   * The seats the line could be whispered to afterwards: everyone in the room but this reader who
   * may read the tab it is in.
   */
  whisperTargets(): PeerCursor[] {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    return this.chatMessageService.afterWhisperCandidates(this.chatMessage);
  }

  /** Makes the line an after-the-fact whisper to the seat chosen, from the list or the line's menu. */
  whisperTo(peer: PeerCursor): void {
    if (!this.canMakeAfterWhisper) return;
    this.chatMessageService.makeAfterWhisper(this.chatMessage, peer);
  }

  /** Puts an after-the-fact whisper back for everyone, from the list or the line's menu. */
  undoAfterWhisper(): void {
    if (!this.canUndoAfterWhisper) return;
    this.chatMessageService.undoAfterWhisper(this.chatMessage);
  }

  /** Whether this reader may delete the line, which they may of a line they said. */
  get canPseudoDelete(): boolean {
    if (this.readOnly()) return false;
    const message = this.chatMessage;
    return !!message && this.chatMessageService.canPseudoDelete(message);
  }

  /**
   * Deletes the line from everybody's chat, leaving it in the log, from its button or the line's
   * menu. There is no putting it back, so the reader is asked first.
   */
  async pseudoDelete(): Promise<void> {
    if (!this.canPseudoDelete) return;
    const message = this.chatMessage;
    const sure = await this.confirm.ask({
      message: this.t('feature.chat.message.deleteLineConfirm'),
      okLabel: this.t('feature.chat.message.deleteLine'),
      danger: true,
    });
    if (sure) this.chatMessageService.pseudoDelete(message);
  }

  /** Puts this line in the ticker running round the table, where that ticker is shown at all. */
  clickShowInTicker() {
    if (!this.canShowInTicker()) return;
    this.chatTickerSelection.showMessage(this.chatMessage.identifier);
  }

  /** Scrolls the log to the line this one replies to and flashes it, from the reply preview. */
  jumpToReplyTarget() {
    const target = this.chatMessage?.replyTo;
    if (!target) return;
    this.uiSignalService.requestChatJump(target);
  }

  /** Scrolls the log to the line this one quotes and flashes it, from the quote preview. */
  jumpToQuoteTarget() {
    const target = this.chatMessage?.quoteOf;
    if (!target) return;
    this.uiSignalService.requestChatJump(target);
  }

  /**
   * A memo is a note laid on the table, so it is only for those who may put things there.
   * A guest is at the table to watch, not to put notes on it.
   */
  get canShareAsMemo(): boolean {
    return this.canInteract && this.rolePermission.canEditTabletop;
  }

  /**
   * The tabs this line could be said again in.
   *
   * A reader may only copy into a tab they are allowed to speak in, and copying a line into
   * the tab it is already in says nothing, so neither is offered.
   */
  copyTargets(): ChatTab[] {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    const here = this.chatMessage?.tabIdentifier ?? '';
    return this.chatTabList.chatTabs.filter((tab) => tab.identifier !== here && canRoleSpeakTab(tab, role));
  }

  /**
   * A line meant for one person is not offered.
   *
   * Copied as it stands it would stay addressed to them and be invisible in the tab it was
   * carried to, and copied without the address it would put a whisper on the noticeboard.
   * Neither is what pressing a copy button asks for.
   */
  get canCopyToTab(): boolean {
    const message = this.chatMessage;
    if (!message || message.isDirect || message.isSecret) return false;
    return this.canInteract && this.copyTargets().length > 0;
  }

  /**
   * Posts a copy of this line into another tab, closing the tab list and playing the card sound.
   *
   * Nothing is sent when the line may not be copied or this player's role may not speak in that tab.
   */
  copyToTab(tab: ChatTab): void {
    if (!this.canCopyToTab) return;
    const message = this.chatMessage;
    if (!message) return;
    if (!canRoleSpeakTab(tab, PeerCursor.myRole)) return;
    this.chatMessageService.copyMessageToTab(message, tab);
    SoundEffect.play(PresetSound.cardPut);
  }

  /**
   * Lays the line on the table as a text note titled with the speaker's name.
   *
   * The note is sized from the length and number of lines of the text, stood upright unless the table
   * is in 2D, and dropped near the table's centre. An empty line makes no note.
   */
  clickShareAsMemo() {
    if (!this.canShareAsMemo) return;
    const msg = this.chatMessage;
    if (!msg) return;
    const text = (msg.text ?? '').trim();
    if (!text) return;
    const title = msg.name?.trim() || this.t('feature.tabletop.action.defaultNoteName');
    const lines = text.split('\n');
    const longest = Math.max(...lines.map((l) => l.length));
    const width = Math.max(3, Math.min(8, Math.ceil(longest / 12)));
    const height = Math.max(2, Math.min(8, Math.ceil(lines.length / 3)));
    const note = TextNote.create(title, text, 14, width, height);
    note.isUpright = !this.tabletopService.mode2d();
    note.location.x = Math.floor(Math.random() * 200 - 100);
    note.location.y = Math.floor(Math.random() * 200 - 100);
    SoundEffect.play(PresetSound.cardPut);
  }

  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly reactions = inject(ChatReactionService);
  private readonly stampPicker = inject(StampPickerService);
  private readonly destroyRef = inject(DestroyRef);
  readonly isHighlighted = signal(false);
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly _registerDestroy = this.destroyRef.onDestroy(() => {
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.stopFollowingSelection?.();
  });

  private readonly jumpEffect = effect(() => {
    const req = this.uiSignalService.chatJumpRequest();
    if (!req) return;
    const me = this.chatMessageInput()?.identifier;
    if (!me || me !== req.messageIdentifier) return;
    queueMicrotask(() => {
      // Consume the request first so any concurrent / subsequent reads (newly mounted
      // chat-message components, input updates after a new post, etc.) see null and skip
      // the scroll. Deferred to the microtask so we don't write to a signal we just read
      // synchronously inside the same effect cycle.
      this.uiSignalService.clearChatJump();
      this.hostElement.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.flash();
    });
  });

  /**
   * Lights the line up for a moment, as a jump to it does. Lit again before it has faded, it stays
   * lit for the whole moment from then.
   */
  flash(): void {
    this.isHighlighted.set(true);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => {
      this.isHighlighted.set(false);
      this.highlightTimer = null;
    }, LINE_FLASH_MS);
  }

  /** The speaker's name as shown, translated for a system line and redrawn when the language changes. */
  displayName(name: string): string {
    this.language.currentLang();
    if (!this.isSystemMessage) return name;
    return decodeI18nMessage(name, this.t);
  }

  /**
   * A short tag for who sent the line, shown beside the name.
   *
   * The first six characters of the sender's peer ID while they are connected, otherwise the user ID
   * itself, cut to six characters when it is longer than eight.
   */
  shortFrom(from: string): string {
    if (!from) return '';
    const peerId = PeerCursor.findByUserId(from)?.peerId;
    if (peerId) return peerId.slice(0, 6);
    return from.length > 8 ? from.slice(0, 6) : from;
  }

  /**
   * The line's body as HTML, with markup escaped and ruby and the chat's text decorations applied.
   *
   * Any novel-mode staging suffix is left out, a system line is translated first, and the result is
   * recomputed when the language or the message changes.
   */
  escapeHtmlAndRuby(text: string) {
    this.language.currentLang();
    this.objectChange.versionOf(this.chatMessage?.identifier)();
    const decoded = this.isSystemMessage ? decodeI18nMessage(text, this.t) : text;
    return decorateChatStyleText(vnBodyOf(this.chatMessage?.vnEmote, decoded));
  }
}

/** Whether two readings of a line's stamps say the same, so the line is not drawn again for nothing. */
function sameTallies(a: readonly ReactionTally[], b: readonly ReactionTally[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (tally, index) =>
        tally.stampId === b[index].stampId &&
        tally.count === b[index].count &&
        tally.mine === b[index].mine &&
        tally.names.join('\n') === b[index].names.join('\n')
    )
  );
}
