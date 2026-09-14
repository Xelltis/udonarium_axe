import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { vnBodyOf, vnEmoteOf } from '@axe/domain/visual-novel/vn-emote';
import { readableMessageText } from '@axe/features/visual-novel/visual-novel-message';
import { isPlayerAside, VnLineSpeaker, VnScriptLine } from '@axe/features/visual-novel/visual-novel-script';
import {
  VisualNovelSettingsService,
  VN_TYPEWRITER_INTERVAL_MS,
} from '@axe/features/visual-novel/visual-novel-settings.service';
import { typedLineOf, typedPartsOf, typedTextOf } from '@axe/features/visual-novel/visual-novel-text';

const AUTO_PLAY_BASE_WAIT_MS = 1200;
const AUTO_PLAY_PER_CHAR_MS = 35;
const AUTO_PLAY_MAX_WAIT_MS = 4000;
const SKIP_INTERVAL_MS = 120;

/**
 * Whether this line is the one a roll was asked for on.
 *
 * The result follows immediately, under the same person and the very next timestamp, and a tab
 * never gives two lines the same one - so nothing can slip between the two and be taken for it.
 */
function isDiceCommandAmong(messages: readonly ChatMessage[], index: number): boolean {
  const message = messages[index];
  const next = messages[index + 1];
  if (!message || !next) return false;
  if (message.isSystemMessage || message.isDicebot) return false;
  return next.isDicebot && next.timestamp === message.timestamp + 1 && next.originFrom === message.from;
}

@Injectable({ providedIn: 'root' })
export class VisualNovelPlaybackService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly settings = inject(VisualNovelSettingsService);
  private readonly translate = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);

  private readonly renderVersion = signal(0);
  private readonly cursor = signal(-1);
  private readonly typedLength = signal(0);
  private readonly attached = signal(false);
  private readonly _chatTabIdentifier = signal('');

  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private autoPlayTimer: ReturnType<typeof setTimeout> | null = null;
  private skipTimer: ReturnType<typeof setInterval> | null = null;
  private revealInstantly = false;

  readonly autoPlay = signal(false);
  readonly isSkipping = signal(false);

  readonly chatTabIdentifier = this._chatTabIdentifier.asReadonly();

  readonly chatTab = computed(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.versionOf(this._chatTabIdentifier())();
    return this.objectStore.get<ChatTab>(this._chatTabIdentifier()) ?? null;
  });

  /**
   * Everything said on this tab that novel mode will own up to, whether or not it reads it out.
   *
   * The backlog shows this. The script below is a part of it.
   *
   * A secret roll is left out of it altogether, the one who made it included.
   *
   * Novel mode says a line whole, in the middle of the screen, under a face that announces it
   * to the room - and the screen is the one thing here that gets shown around, there being a
   * view of it made for streaming. A roll that was kept back has no business being called out
   * there by anybody's screen, its own thrower's least of all. It is read in the chat window,
   * where it is one line among many and only for the eyes it belongs to.
   */
  readonly logMessages = computed(() => {
    this.renderVersion();
    const tab = this.chatTab();
    if (!tab) return [] as ChatMessage[];
    return tab.chatMessages.filter((message) => message.isDisplayable && !message.isOutOfStory && !message.isSecret);
  });

  /** The lines novel mode reads out, one after another. */
  readonly messages = computed(() => {
    const log = this.logMessages();
    if (this.settings.readPlayerAsides()) return log;
    this.objectChange.trackMyCursor();
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    return log.filter((message, index) => !isPlayerAside(this.scriptLineOf(message, log, index)));
  });

  /** Who the line being read was spoken as. */
  readonly currentSpeakerKind = computed<VnLineSpeaker>(() => {
    const message = this.currentMessage();
    if (!message) return 'unknown';
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    this.objectChange.trackMyCursor();
    return this.speakerOf(message);
  });

  private scriptLineOf(message: ChatMessage, log: readonly ChatMessage[], index: number): VnScriptLine {
    return {
      isSystemMessage: message.isSystemMessage,
      isDicebot: message.isDicebot,
      isDiceCommand: isDiceCommandAmong(log, index),
      speaker: this.speakerOf(message),
    };
  }

  /**
   * Who a line was spoken as, taken from what the sender chose rather than from who they are.
   *
   * The role recorded on the line is asked before the person who said it, so that the reading
   * of a log settles once and stays settled. A role is worn now and taken off later, and the
   * cursor that carried it is built afresh on every connection, so asking either would let a
   * game master handing over the seat take their narration out of the story, and a reconnect
   * turn the table's chatter back into part of it.
   *
   * A line with nothing recorded on it is left unknown rather than guessed at from the user it
   * came from: old rooms carry such lines, and they belong to the story as much as any other.
   */
  private speakerOf(message: ChatMessage): VnLineSpeaker {
    const sender = this.objectStore.get(message.sendFrom ?? '');
    if (sender instanceof GameCharacter) return 'character';
    const spokenAs = message.senderRole;
    if (spokenAs) return spokenAs === PeerRole.GameMaster ? 'gameMaster' : 'player';
    if (sender instanceof PeerCursor) return sender.isGameMaster ? 'gameMaster' : 'player';
    return 'unknown';
  }

  readonly currentIndex = computed(() => {
    const length = this.messages().length;
    if (length < 1) return -1;
    const cursor = this.cursor();
    if (cursor < 0) return length - 1;
    return Math.min(cursor, length - 1);
  });

  readonly currentMessage = computed(() => this.messages()[this.currentIndex()] ?? null);

  readonly isLatest = computed(() => this.currentIndex() >= this.messages().length - 1);

  readonly currentEmote = computed(() => {
    this.renderVersion();
    this.language.currentLang();
    const message = this.currentMessage();
    return vnEmoteOf(message?.vnEmote, readableMessageText(message, this.translate));
  });

  readonly currentFullText = computed(() => {
    this.renderVersion();
    this.language.currentLang();
    const message = this.currentMessage();
    return vnBodyOf(message?.vnEmote, readableMessageText(message, this.translate));
  });

  private readonly currentLine = computed(() => typedLineOf(this.currentFullText()));

  /** The line being read whole, in the runs the ruby notation cuts it into. */
  readonly currentFullParts = computed(() => this.currentLine().parts);

  /** What a reader sees of the line being read once it is all out, the notation gone from it. */
  readonly currentVisibleText = computed(() => this.currentLine().text);

  /** What a reader sees of the line so far, the readings left out. */
  readonly displayedText = computed(() => typedTextOf(this.currentLine(), this.typedLength()));

  /** The line so far, in runs, with the readings over the words that have one. */
  readonly displayedParts = computed(() => typedPartsOf(this.currentLine(), this.typedLength()));

  readonly isTyping = computed(() => this.typedLength() < this.currentLine().ends.length);

  readonly currentIsDiceCommand = computed(() => this.isDiceCommandAt(this.currentIndex()));

  readonly availableChatTabs = computed(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return this.chatMessageService.chatTabs.filter((tab) => canRoleViewTab(tab, role));
  });

  constructor() {
    this._chatTabIdentifier.set(this.initialChatTabIdentifier());

    this.objectChange.messageAdded$.subscribe(() => {
      this.renderVersion.update((version) => version + 1);
    }, this.destroyRef);
    this.objectChange.onObjectChangedForAlias(
      [ChatMessage.aliasName],
      () => this.renderVersion.update((version) => version + 1),
      this.destroyRef
    );
    this.objectChange.onObjectChangedForAlias(
      [ChatTab.aliasName, ChatTabList.aliasName],
      () => {
        if (this.objectStore.get<ChatTab>(this._chatTabIdentifier())) return;
        const chatTabs = this.chatMessageService.chatTabs;
        this._chatTabIdentifier.set(chatTabs.length > 0 ? chatTabs[0].identifier : '');
      },
      this.destroyRef
    );

    effect(() => {
      const message = this.currentMessage();
      const attached = this.attached();
      untracked(() => (attached ? this.restartTypewriter(message) : this.stopTypewriter()));
    });

    effect(() => {
      const active = this.autoPlay() && this.attached();
      const typing = this.isTyping();
      const index = this.currentIndex();
      untracked(() => {
        this.clearAutoPlayTimer();
        if (!active || typing) return;
        if (index < 0 || index >= this.messages().length - 1) {
          this.autoPlay.set(false);
          return;
        }
        const wait =
          Math.min(
            AUTO_PLAY_MAX_WAIT_MS,
            AUTO_PLAY_BASE_WAIT_MS + this.currentFullText().length * AUTO_PLAY_PER_CHAR_MS
          ) / this.settings.autoPlaySpeed();
        this.autoPlayTimer = setTimeout(() => {
          this.autoPlayTimer = null;
          this.advance();
        }, wait);
      });
    });

    this.destroyRef.onDestroy(() => {
      this.stopTypewriter();
      this.stopAutoPlay();
      this.stopSkip();
    });
  }

  /** Starts playback when the novel screen opens, so lines are typed out and auto play can run. */
  attach(): void {
    this.attached.set(true);
  }

  /**
   * Stops playback when the novel screen closes.
   *
   * Typing, auto play and skipping all stop, and reading goes back to following the latest line.
   */
  detach(): void {
    this.attached.set(false);
    this.stopAutoPlay();
    this.stopSkip();
    this.stopTypewriter();
    this.revealInstantly = false;
    this.cursor.set(-1);
  }

  /**
   * Reads a different chat tab, remembering the choice in this browser for next time.
   *
   * Auto play stops and reading starts from that tab's latest line.
   */
  setChatTab(identifier: string): void {
    this.stopAutoPlay();
    this._chatTabIdentifier.set(identifier);
    this.settings.setChatTabIdentifier(identifier);
    this.cursor.set(-1);
  }

  private initialChatTabIdentifier(): string {
    const tabs = this.chatMessageService.chatTabs;
    const saved = this.settings.chatTabIdentifier();
    if (saved.length > 0 && tabs.some((tab) => tab.identifier === saved)) return saved;
    return tabs.length > 0 ? tabs[0].identifier : '';
  }

  /**
   * Moves reading on by one step.
   *
   * A line still being typed is shown whole first. Otherwise the next line is read, and reaching the
   * last line goes back to following the latest.
   */
  advance(): void {
    if (this.isTyping()) {
      this.stopTypewriter();
      this.typedLength.set(this.currentLine().ends.length);
      return;
    }
    const index = this.currentIndex();
    const lastIndex = this.messages().length - 1;
    if (index < 0 || index >= lastIndex) {
      this.cursor.set(-1);
      return;
    }
    this.cursor.set(index + 1 >= lastIndex ? -1 : index + 1);
  }

  /** Steps back to the line before, shown whole at once; does nothing on the first line. */
  back(): void {
    const index = this.currentIndex();
    if (index <= 0) return;
    this.revealInstantly = true;
    this.cursor.set(index - 1);
  }

  /** Moves reading on because the reader asked to, which stops auto play first. */
  userAdvance(): void {
    this.stopAutoPlay();
    this.advance();
  }

  /** Steps back because the reader asked to, which stops auto play first. */
  userBack(): void {
    this.stopAutoPlay();
    this.back();
  }

  /** Stops auto play and goes to the latest line, following new lines as they arrive. */
  toLatest(): void {
    this.stopAutoPlay();
    this.cursor.set(-1);
  }

  /**
   * Stops auto play and reads the line at an index of the script, shown whole at once.
   *
   * The last line or beyond goes back to following the latest; a negative index does nothing.
   */
  jumpTo(index: number): void {
    this.stopAutoPlay();
    const lastIndex = this.messages().length - 1;
    if (index < 0 || lastIndex < 0) return;
    this.revealInstantly = true;
    this.cursor.set(index >= lastIndex ? -1 : index);
  }

  /** Goes to the latest line, as after this reader sends one, without stopping auto play. */
  followLatest(): void {
    this.cursor.set(-1);
  }

  /**
   * Reads the line with this message identifier, as when following the director or picking from the backlog.
   *
   * A line the script leaves out resumes at the nearest line before it that the script has, or at the
   * first line when none comes before. An empty or unknown identifier does nothing. Auto play is not
   * stopped.
   */
  jumpToIdentifier(identifier: string): void {
    if (identifier.length < 1) return;
    const messages = this.messages();
    const index = messages.findIndex((message) => message.identifier === identifier);
    if (index >= 0) {
      this.cursor.set(index >= messages.length - 1 ? -1 : index);
      return;
    }
    // A line the script passes over can still be picked out of the backlog. Reading resumes at
    // the nearest line before it that the script does have, which is the scene it was said in.
    const log = this.logMessages();
    const logIndex = log.findIndex((message) => message.identifier === identifier);
    if (logIndex < 0) return;
    for (let i = logIndex - 1; i >= 0; i--) {
      const fallback = messages.findIndex((message) => message.identifier === log[i].identifier);
      if (fallback >= 0) {
        this.cursor.set(fallback >= messages.length - 1 ? -1 : fallback);
        return;
      }
    }
    // Nothing before it belongs to the scene, which is what a tab opening on an aside looks
    // like. The first line of the scene is where reading starts, rather than nowhere at all.
    if (messages.length > 0) this.cursor.set(messages.length > 1 ? 0 : -1);
  }

  /** Starts auto play from the line being read, or stops it; it will not start on the latest line. */
  toggleAutoPlay(): void {
    if (this.autoPlay()) {
      this.stopAutoPlay();
      return;
    }
    if (this.isLatest()) return;
    this.revealInstantly = false;
    this.autoPlay.set(true);
  }

  /** Goes back to the first line and plays the tab through automatically; does nothing on an empty tab. */
  playFromStart(): void {
    this.stopAutoPlay();
    if (this.messages().length < 1) return;
    this.revealInstantly = false;
    this.cursor.set(0);
    this.autoPlay.set(true);
  }

  /** Stops auto play and cancels the wait before its next line. */
  stopAutoPlay(): void {
    this.autoPlay.set(false);
    this.clearAutoPlayTimer();
  }

  /**
   * Starts fast-forwarding, as while Control is held.
   *
   * Auto play stops, and lines are shown whole and stepped through quickly until the latest is
   * reached or skipping is stopped. A second call while skipping does nothing.
   */
  startSkip(): void {
    if (this.skipTimer != null) return;
    this.stopAutoPlay();
    this.isSkipping.set(true);
    this.skipStep();
    this.skipTimer = setInterval(() => this.skipStep(), SKIP_INTERVAL_MS);
  }

  /** Stops fast-forwarding, leaving reading on whatever line it reached. */
  stopSkip(): void {
    this.isSkipping.set(false);
    if (this.skipTimer == null) return;
    clearInterval(this.skipTimer);
    this.skipTimer = null;
  }

  private skipStep(): void {
    if (this.isLatest() && !this.isTyping()) {
      this.stopSkip();
      return;
    }
    this.revealInstantly = true;
    this.advance();
  }

  /**
   * Whether the script line at an index is the command a dice roll was asked for with.
   *
   * Such a line is shown whole at once rather than typed, and is kept off the stage.
   */
  isDiceCommandAt(index: number): boolean {
    return isDiceCommandAmong(this.messages(), index);
  }

  private clearAutoPlayTimer(): void {
    if (this.autoPlayTimer == null) return;
    clearTimeout(this.autoPlayTimer);
    this.autoPlayTimer = null;
  }

  private restartTypewriter(message: ChatMessage | null): void {
    this.stopTypewriter();
    const readable = readableMessageText(message, this.translate);
    const emote = vnEmoteOf(message?.vnEmote, readable);
    const total = typedLineOf(vnBodyOf(message?.vnEmote, readable)).ends.length;
    const interval = VN_TYPEWRITER_INTERVAL_MS[this.settings.typewriterSpeed()];
    const isDiceCommand = this.currentIsDiceCommand();
    if (this.revealInstantly || interval < 1 || emote.kind === 'location' || emote.kind === 'scene' || isDiceCommand) {
      this.revealInstantly = false;
      this.typedLength.set(total);
      return;
    }
    this.typedLength.set(0);
    if (total < 1) return;
    this.typingTimer = setInterval(() => {
      this.typedLength.update((length) => Math.min(total, length + 1));
      if (this.typedLength() >= total) this.stopTypewriter();
    }, interval);
  }

  private stopTypewriter(): void {
    if (this.typingTimer == null) return;
    clearInterval(this.typingTimer);
    this.typingTimer = null;
  }
}
