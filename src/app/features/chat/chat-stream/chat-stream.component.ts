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
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab, canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatSendService } from '@axe/features/chat/chat-send.service';
import { ChatStreamInputComponent } from '@axe/features/chat/chat-stream/chat-stream-input.component';
import { ChatTabComponent } from '@axe/features/chat/chat-tab/chat-tab.component';
import { ChatTabStripComponent } from '@axe/features/chat/chat-tab-strip/chat-tab-strip.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The stream chat widget: one chat tab's lines going past, a strip to switch tabs, and a small
 * input to speak in.
 *
 * The chat window carries an input, colours and settings around whichever tab is open, which is
 * more than somebody wants on screen beside novel mode, or while following one tab and writing in
 * another. This is a small window per tab instead. Made transparent, it keeps only the lines, for
 * watching over the table. A line said here goes out as one said in the chat window does.
 *
 * The tab is held as a plain field rather than a signal input because a panel is opened from
 * code, which can only write to a plain field.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-stream',
  templateUrl: './chat-stream.component.html',
  host: { class: 'block h-full' },
  imports: [ChatStreamInputComponent, ChatTabComponent, ChatTabStripComponent, NgClass, TranslocoModule],
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
      this.scrollToLatest();
    }, this.destroyRef);
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
