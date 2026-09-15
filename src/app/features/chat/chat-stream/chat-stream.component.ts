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
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabComponent } from '@axe/features/chat/chat-tab/chat-tab.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * One chat tab's lines going past, and nothing else.
 *
 * The chat window carries a tab strip, an input, colours and settings around whichever tab is
 * open. Somebody who only wants to watch a conversation go by - beside novel mode, or while
 * another tab is being written in - would have to keep all of that on screen, and could only
 * follow one tab at a time. This is a window per tab with none of the furniture.
 *
 * The tab is held as a plain field rather than a signal input because a panel is opened from
 * code, which can only write to a plain field.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-stream',
  templateUrl: './chat-stream.component.html',
  host: { class: 'block h-full' },
  imports: [ChatTabComponent, NgClass, TranslocoModule],
})
export class ChatStreamComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

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
    return this.objectStore.get<ChatTab>(this.tabIdentifier()) ?? null;
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
