import { DatePipe, NgClass, NgStyle } from '@angular/common';
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
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
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
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { encodeVnEmote, vnBodyOf, vnEmoteOf } from '@axe/domain/visual-novel/vn-emote';
import { buildChatMessageContextMenu } from '@axe/features/chat/chat-message/chat-message-context-menu';
import { formatChatTickerMessage } from '@axe/features/chat/chat-ticker/chat-ticker-layout';
import { SystemAvatarMenuService } from '@axe/features/chat/system-avatar-menu.service';
import { vnEmoteLabels } from '@axe/features/visual-novel/visual-novel-emote-label';
import { ChatColorStylePipe } from '@axe/ui/pipes/chat-color-style.pipe';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { decorateChatStyleText, splitRubyNotation } from '@axe/ui/text-decoration/decorate-chat-text';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'chat-message',
  templateUrl: './chat-message.component.html',
  host: {
    class: 'block',
    '[attr.data-message-id]': 'chatMessage?.identifier',
    '[class.chat-message-highlight]': 'isHighlighted()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, NgStyle, DatePipe, FormsModule, LinkifyPipe, ChatColorStylePipe, SafePipe, TranslocoModule],
})
export class ChatMessageComponent {
  /** The panels a bubble has to read against, which a skin may have moved. */
  protected readonly skins = inject(SkinService);

  private readonly chatMessageService = inject(ChatMessageService);
  private readonly chatTickerSelection = inject(ChatTickerSelectionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly tabletopDisplay = inject(TabletopDisplayService);
  protected readonly theme = inject(ThemeService);
  private readonly systemAvatar = inject(SystemAvatarService);
  private readonly systemAvatarMenu = inject(SystemAvatarMenuService);
  private readonly chatPrefs = inject(ChatPreferencesService);
  private readonly contextMenuService = inject(ContextMenuService);
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
    return !this.readOnly() && (this.chatMessage?.changeable ?? false);
  }
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

    const actions = buildChatMessageContextMenu(
      {
        canInteract: this.canInteract,
        canShareAsMemo: this.canShareAsMemo,
        canChange: this.canChange,
        canShowInTicker: this.canShowInTicker(),
        copyTargets: this.canCopyToTab ? this.copyTargets() : [],
        hasOriginal: !!(message.replyTo || message.quoteOf),
        text: this.readableText(message),
        selectedText: picked.inside,
        isTouch: this.viewport.isTouch(),
      },
      {
        reply: () => this.clickReply(),
        quote: () => this.clickQuote(),
        copyToTab: (identifier) => {
          const tab = this.copyTargets().find((candidate) => candidate.identifier === identifier);
          if (tab) this.copyToTab(tab);
        },
        shareAsMemo: () => this.clickShareAsMemo(),
        edit: () => this.startEdit(),
        showInTicker: () => this.clickShowInTicker(),
        jumpToOriginal: () => (message.replyTo ? this.jumpToReplyTarget() : this.jumpToQuoteTarget()),
        copyText: (text) => this.copyText(text),
        selectText: () => this.selectText(),
      },
      this.t
    );
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, this.displayName(message.name));
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

  /**
   * The words of a line as this reader is shown them, or nothing where they are kept from the reader.
   *
   * A notice from the room is read in the reader's language. Ruby comes out as the words with their
   * reading after them in brackets, since plain text cannot set a reading over its words, and the
   * log saved from chat keeps the reading as well.
   */
  private readableText(message: ChatMessage): string {
    if (this.isSecret() && !message.isSendFromSelf && !this.canRevealSecret) return '';
    const text = this.isSystemMessage ? decodeI18nMessage(message.text, this.t) : (message.text ?? '');
    return splitRubyNotation(vnBodyOf(message.vnEmote, text))
      .map((part) => (part.reading.length > 0 ? `${part.text}（${part.reading}）` : part.text))
      .join('')
      .trim();
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
   * as edited and reaches the room through the synced message; an unchanged draft writes nothing.
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
    if (this.chatMessage.text !== next || this.chatMessage.vnEmote !== staging) {
      this.chatMessage.text = next;
      if (staging.length > 0) this.chatMessage.vnEmote = staging;
      this.chatMessage.fixd = true;
    }
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
    if (!target) return null;
    const text = vnBodyOf(target.vnEmote, target.text ?? '')
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
    if (!(target instanceof ChatMessage)) return null;
    const text = vnBodyOf(target.vnEmote, target.text ?? '').trim();
    return {
      name: target.name ?? '',
      text: text.length > 280 ? text.slice(0, 280) + '…' : text,
    };
  });

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

  readonly canShowInTicker = computed(() => {
    // A window that only reads the log offers none of the buttons that act on a line.
    if (this.readOnly()) return false;

    // Only where the band is actually drawn, which is a table looked straight down on.
    if (!this.tabletopService.mode2d()) return false;
    if (!this.tabletopDisplay.settings().multiAngleTickerEnabled) return false;
    const message = this.chatMessageInput();
    if (!message) return false;
    this.objectChange.versionOf(message.identifier)();
    return formatChatTickerMessage(message) != null;
  });

  /** Asks the chat input to reply to this line, from the reply button or the line's menu. */
  clickReply() {
    if (!this.canInteract) return;
    this.uiSignalService.requestChatReply(this.chatMessage.identifier);
  }

  /** Asks the chat input to quote this line, from the quote button or the line's menu. */
  clickQuote() {
    if (!this.canInteract) return;
    this.uiSignalService.requestChatQuote(this.chatMessage.identifier);
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

  readonly isCopyPickerOpen = signal(false);

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

  /** Opens or closes the list of tabs to copy the line into, from the copy button. */
  toggleCopyPicker(): void {
    if (!this.canCopyToTab) return;
    this.isCopyPickerOpen.update((open) => !open);
  }

  /**
   * Posts a copy of this line into another tab, closing the tab list and playing the card sound.
   *
   * Nothing is sent when the line may not be copied or this player's role may not speak in that tab.
   */
  copyToTab(tab: ChatTab): void {
    this.isCopyPickerOpen.set(false);
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
      this.isHighlighted.set(true);
      if (this.highlightTimer) clearTimeout(this.highlightTimer);
      this.highlightTimer = setTimeout(() => {
        this.isHighlighted.set(false);
        this.highlightTimer = null;
      }, 1800);
    });
  });

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
