import { DatePipe, NgClass, NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
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
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
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
import { formatChatTickerMessage } from '@axe/features/chat/chat-ticker/chat-ticker-layout';
import { SystemAvatarMenuService } from '@axe/features/chat/system-avatar-menu.service';
import { vnEmoteLabels } from '@axe/features/visual-novel/visual-novel-emote-label';
import { ChatColorStylePipe } from '@axe/ui/pipes/chat-color-style.pipe';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { decorateChatStyleText } from '@axe/ui/text-decoration/decorate-chat-text';
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
  protected readonly theme = inject(ThemeService);
  private readonly systemAvatar = inject(SystemAvatarService);
  private readonly systemAvatarMenu = inject(SystemAvatarMenuService);
  private readonly chatPrefs = inject(ChatPreferencesService);

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
  get chatMessage(): ChatMessage {
    return this.chatMessageInput();
  }

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

  private rollSourceImageUrl(): string {
    const chatMessage = this.chatMessageInput();
    if (!chatMessage?.isDicebot) return '';
    this.objectChange.fileVersion();
    const chatTab = this.objectStore.get<ChatTab>(chatMessage.tabIdentifier);
    if (!chatTab) return '';
    this.objectChange.versionOf(chatTab.identifier)();
    const originFrom = chatMessage.originFrom ?? '';
    const source = chatTab.chatMessages.find(
      (candidate) => candidate.timestamp === chatMessage.timestamp - 1 && candidate.from === originFrom
    );
    return source?.image?.url ?? '';
  }

  protected onSystemAvatarContextMenu(event: Event, kind: SystemAvatarKind): void {
    this.systemAvatarMenu.openContextMenu(event, kind);
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

  get chatTabList(): ChatTabList {
    return this.objectStore.get<ChatTabList>('ChatTabList')!;
  }

  discloseMessage() {
    this.chatMessageService.discloseMessage(this.chatMessage);
  }

  readonly editDraft = signal<string | null>(null);
  readonly isEditing = computed(() => this.editDraft() !== null);
  readonly editingTextArea = viewChild<ElementRef<HTMLTextAreaElement>>('editingTextArea');

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

  cancelEdit() {
    this.editDraft.set(null);
  }

  onEditInput(value: string) {
    this.editDraft.set(value);
    const el = this.editingTextArea()?.nativeElement;
    if (el) this.autoFitHeight(el);
  }

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

  /** Whether a message can be replied to, quoted or made into a note. System messages and those addressed to a player are not.
      ダイスボット (`isDicebot`) は対話可能なメッセージとして扱う (System tag は持つが PC に向けた応答なので)。 */
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

    const message = this.chatMessageInput();
    if (!message) return false;
    this.objectChange.versionOf(message.identifier)();
    return formatChatTickerMessage(message) != null;
  });

  clickReply() {
    if (!this.canInteract) return;
    this.uiSignalService.requestChatReply(this.chatMessage.identifier);
  }

  clickQuote() {
    if (!this.canInteract) return;
    this.uiSignalService.requestChatQuote(this.chatMessage.identifier);
  }

  clickShowInTicker() {
    if (!this.canShowInTicker()) return;
    this.chatTickerSelection.showMessage(this.chatMessage.identifier);
  }

  jumpToReplyTarget() {
    const target = this.chatMessage?.replyTo;
    if (!target) return;
    this.uiSignalService.requestChatJump(target);
  }

  jumpToQuoteTarget() {
    const target = this.chatMessage?.quoteOf;
    if (!target) return;
    this.uiSignalService.requestChatJump(target);
  }

  /**
   * A memo is a note laid on the table, so it is only for those who may put things there.
   * A guest is at the table to watch, and had a button that put a note on it.
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

  toggleCopyPicker(): void {
    if (!this.canCopyToTab) return;
    this.isCopyPickerOpen.update((open) => !open);
  }

  copyToTab(tab: ChatTab): void {
    this.isCopyPickerOpen.set(false);
    if (!this.canCopyToTab) return;
    const message = this.chatMessage;
    if (!message) return;
    if (!canRoleSpeakTab(tab, PeerCursor.myRole)) return;
    this.chatMessageService.copyMessageToTab(message, tab);
    SoundEffect.play(PresetSound.cardPut);
  }

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

  displayName(name: string): string {
    this.language.currentLang();
    if (!this.isSystemMessage) return name;
    return decodeI18nMessage(name, this.t);
  }

  shortFrom(from: string): string {
    if (!from) return '';
    const peerId = PeerCursor.findByUserId(from)?.peerId;
    if (peerId) return peerId.slice(0, 6);
    return from.length > 8 ? from.slice(0, 6) : from;
  }

  escapeHtmlAndRuby(text: string) {
    this.language.currentLang();
    this.objectChange.versionOf(this.chatMessage?.identifier)();
    const decoded = this.isSystemMessage ? decodeI18nMessage(text, this.t) : text;
    return decorateChatStyleText(vnBodyOf(this.chatMessage?.vnEmote, decoded));
  }
}
