import { NgClass } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab, canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatComposeService } from '@axe/features/chat/chat-compose.service';
import { ChatInputComponent } from '@axe/features/chat/chat-input/chat-input.component';
import { ChatSendService } from '@axe/features/chat/chat-send.service';
import { ChatTabComponent } from '@axe/features/chat/chat-tab/chat-tab.component';
import { ChatTabStripComponent } from '@axe/features/chat/chat-tab-strip/chat-tab-strip.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * One chat tab's lines going past, with a tab strip and an input to speak in only when asked for.
 *
 * The chat window carries a tab strip, an input, colours and settings around whichever tab is
 * open. Somebody who only wants to watch a conversation go by - beside novel mode, or while
 * another tab is being written in - would have to keep all of that on screen, and could only
 * follow one tab at a time. This is a window per tab with none of the furniture until the reader
 * turns on the speaking part from its title bar, which this browser remembers for the next one.
 * A line said here goes out as one said in the chat window does.
 *
 * The tab is held as a plain field rather than a signal input because a panel is opened from
 * code, which can only write to a plain field.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-stream',
  templateUrl: './chat-stream.component.html',
  host: { class: 'block h-full' },
  imports: [ChatInputComponent, ChatTabComponent, ChatTabStripComponent, NgClass, TranslocoModule],
  // One of these to a window, so answering a line in this one puts the caret in this one.
  providers: [ChatComposeService],
})
export class ChatStreamComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly chatSend = inject(ChatSendService);

  /**
   * The tab this window is watching, set by whoever opened it.
   *
   * A signal rather than a plain field: it is assigned after the window is built, and a
   * computed reading a plain field would have nothing to tell it the assignment happened.
   */
  readonly tabIdentifier = signal('');

  readonly logScrollRef = viewChild.required<ElementRef<HTMLDivElement>>('logScroll');

  /** Whether a new line carries the window down to it, which is what watching a room wants. */
  readonly followsLatest = signal(true);
  readonly isGhost = this.panelService.isGhost;

  readonly chatTab = computed<ChatTab | null>(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.versionOf(this.tabIdentifier())();
    return this.objectStore.get<ChatTab>(this.tabIdentifier()) ?? null;
  });

  /** Whether the tab strip and the input are out, as this browser last had them. */
  readonly speaks = signal(readLocal(STORAGE_KEYS.chatStreamSpeaks) === 'true');

  /** The tabs this reader may see, to switch between while speaking here. */
  readonly visibleChatTabs = computed(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    this.objectChange.versionOf(ChatTabList.instance.identifier)();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return this.chatMessageService.chatTabs.filter((tab) => {
      this.objectChange.versionOf(tab.identifier)();
      return canRoleViewTab(tab, role);
    });
  });

  readonly canSpeak = computed(() => {
    const tab = this.chatTab();
    if (!tab) return false;
    this.objectChange.trackMyCursor();
    return canRoleSpeakTab(tab, PeerCursor.myRole);
  });

  /**
   * Who lines here are spoken as, starting as whoever the chat window speaks as. Choosing someone
   * else here leaves the chat window, and what follows it, as they were.
   */
  readonly sendFrom = signal(inject(ChatSpeakerService).identifier() || (PeerCursor.myCursor?.identifier ?? ''));

  /** The room's game system for lines said here, shared with the chat window as the room's choice is. */
  get gameType(): string {
    return this.chatMessageService.gameType || 'DiceBot';
  }
  set gameType(gameType: string) {
    this.chatMessageService.gameType = gameType;
  }

  constructor() {
    // The lines scroll inside this window, not in the panel's own body, and the log measures
    // whichever one the panel names.
    afterNextRender({
      write: () => {
        this.panelService.claimScrollablePanel(this.logScrollRef().nativeElement);
        this.scrollToLatest();
      },
    });

    effect(() => {
      this.panelService.headerControls.set([
        {
          icon: 'edit_note',
          label: this.t('feature.chat.stream.speak'),
          active: this.speaks(),
          press: () => this.toggleSpeaks(),
        },
        {
          icon: 'vertical_align_bottom',
          label: this.t('feature.chat.stream.followLatest'),
          active: this.followsLatest(),
          press: () => this.toggleFollowsLatest(),
        },
        {
          icon: 'opacity',
          label: this.t('ui.panel.ghost'),
          active: this.isGhost(),
          press: () => this.isGhost.update((ghost) => !ghost),
        },
      ]);
    });

    // The window is named after the tab it shows, which changes as another is picked or renamed.
    effect(() => {
      const tab = this.chatTab();
      if (tab) this.panelService.title = tab.name;
    });

    this.objectChange.messageAdded$.subscribe((event) => {
      if (event.tabIdentifier !== this.tabIdentifier()) return;
      if (!this.followsLatest()) return;
      this.scrollToLatest();
    }, this.destroyRef);
  }

  /** Says a line into the tab shown, as the chat window says one; see {@link ChatSendService.send}. */
  send(value: ChatOutgoing): void {
    this.chatSend.send(this.chatTab(), value);
  }

  /** Brings out the tab strip and the input, or puts them away, and remembers which for the next window. */
  private toggleSpeaks(): void {
    const speaks = !this.speaks();
    this.speaks.set(speaks);
    writeLocal(STORAGE_KEYS.chatStreamSpeaks, speaks ? 'true' : null);
    if (this.followsLatest()) this.scrollToLatest();
  }

  private toggleFollowsLatest(): void {
    const follows = !this.followsLatest();
    this.followsLatest.set(follows);
    if (follows) this.scrollToLatest();
  }

  /**
   * Carries the window down to the newest line.
   *
   * The log renders a slice of the tab rather than all of it, so it is told to put its slice at
   * the end first; scrolling alone would land on whatever it happens to be holding.
   */
  private scrollToLatest(): void {
    this.panelService.scrollToBottom$.emit();
    queueMicrotask(() => {
      const log = this.panelService.scrollablePanel;
      if (log) log.scrollTop = log.scrollHeight;
    });
  }
}
