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
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
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
 * The stream chat widget: the chat shown another way, as a small window of one tab's lines going
 * past with a strip to switch tabs and the chat's own input under them.
 *
 * Whatever can be done in the chat window can be done here: a line is written in the same input
 * and goes out as one said there does, and the lines answer, quote and edit as they do there. What
 * it leaves out is the chat window's furniture around them, so it can stand beside novel mode, or
 * follow one tab while another is written in. Made transparent, it keeps the lines, the strip and
 * the input over the table, each on a dark band of its own, so it can still be spoken in.
 *
 * The tab is held as a plain field rather than a signal input because a panel is opened from
 * code, which can only write to a plain field.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-stream',
  templateUrl: './chat-stream.component.html',
  host: {
    class: 'block h-full',
    '(keydown.control.arrowleft)': 'switchTabByKey($event, -1)',
    '(keydown.control.arrowright)': 'switchTabByKey($event, 1)',
  },
  imports: [ChatInputComponent, ChatTabComponent, ChatTabStripComponent, NgClass, TranslocoModule],
  // One of these to a window, so answering a line in this one puts the caret in this one.
  providers: [ChatComposeService],
})
export class ChatStreamComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
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

  /** The tabs this reader may see, to switch between. */
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

  /**
   * Who lines here are spoken as, starting as whoever the chat window speaks as. Choosing someone
   * else here leaves the chat window, and what follows it, as they were.
   */
  readonly sendFrom = signal(inject(ChatSpeakerService).identifier() || (PeerCursor.myCursor?.identifier ?? ''));

  /** The dice bot lines are read under, the one the chat window has chosen, as the two share it. */
  get gameType(): string {
    return this.chatMessageService.gameType || 'DiceBot';
  }
  set gameType(gameType: string) {
    this.chatMessageService.gameType = gameType;
  }

  readonly canSpeak = computed(() => {
    const tab = this.chatTab();
    if (!tab) return false;
    this.objectChange.trackMyCursor();
    return canRoleSpeakTab(tab, PeerCursor.myRole);
  });

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

    this.objectChange.messageAdded$.subscribe((event) => {
      if (event.tabIdentifier !== this.tabIdentifier()) return;
      if (!this.followsLatest()) return;
      this.scrollToLatestOnceDrawn();
    }, this.destroyRef);

    // A tab picked from the strip opens at its newest line, as the window itself does.
    effect(() => {
      this.tabIdentifier();
      untracked(() => this.scrollToLatestOnceDrawn());
    });
  }

  /** Moves to the tab beside the one shown, wrapping round, as Ctrl and an arrow do in the chat window. */
  switchTabByKey(event: Event, direction: -1 | 1): void {
    const tabs = this.visibleChatTabs();
    if (tabs.length < 2) return;
    event.preventDefault();
    const at = tabs.findIndex((tab) => tab.identifier === this.tabIdentifier());
    this.tabIdentifier.set(tabs[(at + direction + tabs.length) % tabs.length].identifier);
  }

  /** Says a line into the tab shown, as the chat window says one; see {@link ChatSendService.send}. */
  send(value: ChatOutgoing): void {
    this.chatSend.send(this.chatTab(), value);
  }

  private toggleFollowsLatest(): void {
    const follows = !this.followsLatest();
    this.followsLatest.set(follows);
    if (follows) this.scrollToLatest();
  }

  /**
   * Carries the window down to the newest line now, and again once the page has drawn what has just
   * come: the line that first runs past the bottom is not there to be scrolled to until then.
   */
  private scrollToLatestOnceDrawn(): void {
    this.scrollToLatest();
    afterNextRender({ write: () => this.scrollToLatest() }, { injector: this.injector });
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
