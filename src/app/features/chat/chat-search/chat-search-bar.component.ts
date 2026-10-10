import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { chatSearchQuery, chatSearchText, findChatSearchHits } from '@axe/features/chat/chat-search/chat-search';
import { markChatSearch, unmarkChatSearch } from '@axe/features/chat/chat-search/chat-search-marks';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The box that finds words in a chat tab, as a browser's find does in a page.
 *
 * It looks through every line of the tab, not only the ones drawn, so a line far up the log is
 * found and brought into view. The newest line holding the words is shown first; Enter goes to the
 * one before it and Shift+Enter to the one after, wrapping round at either end. The words are
 * marked in the lines drawn, and the line the search stands on is picked out.
 */
@Component({
  selector: 'chat-search-bar',
  templateUrl: './chat-search-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'block' },
})
export class ChatSearchBarComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  /** The tab whose lines are searched. */
  readonly tab = input<ChatTab | null>(null);
  /** The element the tab's lines are drawn in, where the words found are marked. */
  readonly log = input.required<HTMLElement>();
  /** Brings a line into view, resolving once it is drawn. */
  readonly reveal = input.required<(message: ChatMessage) => Promise<HTMLElement | null>>();

  /** The reader asked for the box to close. */
  readonly closed = output<void>();

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  /** What is typed into the box. */
  readonly text = signal('');
  private readonly query = computed(() => chatSearchQuery(this.text()));
  private readonly linesEdited = signal(0);
  private readonly currentIdentifier = signal<string | null>(null);

  /** The lines of the tab holding what is typed, oldest first. */
  readonly hits = computed(() => {
    const tab = this.tab();
    const query = this.query();
    if (!tab || query.length === 0) return [];
    this.objectChange.versionOf(tab.identifier)();
    this.objectChange.collectionOf(ChatMessage.aliasName)();
    this.objectChange.trackMyCursor();
    this.linesEdited();
    const canSeeHidden = this.rolePermission.canSeeHidden;
    return findChatSearchHits(tab.chatMessages, query, (message) => chatSearchText(message, canSeeHidden, this.t));
  });

  /** Where among the hits the search stands, from 0, or -1 while it stands on none. */
  readonly position = computed(() => {
    const identifier = this.currentIdentifier();
    return this.hits().findIndex((message) => message.identifier === identifier);
  });

  /** Whether something is typed, so the count is shown. */
  readonly isSearching = computed(() => this.query().length > 0);

  constructor() {
    this.objectChange.onObjectChangedForAlias(
      [ChatMessage.aliasName],
      () => this.linesEdited.update((v) => v + 1),
      inject(DestroyRef)
    );
    effect(() => {
      this.query();
      this.tab();
      untracked(() => {
        const newest = this.hits().at(-1) ?? null;
        this.currentIdentifier.set(newest?.identifier ?? null);
        void this.show(newest);
      });
    });
    effect((onCleanup) => {
      const log = this.log();
      const observer = new MutationObserver(() => this.scheduleMarks());
      observer.observe(log, { childList: true, subtree: true, characterData: true });
      onCleanup(() => {
        observer.disconnect();
        if (this.markFrame !== null) cancelAnimationFrame(this.markFrame);
        this.markFrame = null;
        unmarkChatSearch(log);
      });
    });
  }

  /** Puts the caret in the box with what is typed picked out, to type over or go on from. */
  focus(): void {
    const element = this.inputRef().nativeElement;
    element.focus();
    element.select();
  }

  /** Goes to the line before the one the search stands on, or round to the newest from the oldest. */
  older(): void {
    this.step(-1);
  }

  /** Goes to the line after the one the search stands on, or round to the oldest from the newest. */
  newer(): void {
    this.step(1);
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  /** Enter goes to an earlier line, Shift+Enter to a later one, and Escape closes the box. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) this.newer();
      else this.older();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
    }
  }

  private step(direction: number): void {
    const hits = this.hits();
    if (hits.length === 0) return;
    const position = this.position();
    const from = position < 0 ? hits.length : position;
    const next = hits[(from + direction + hits.length) % hits.length];
    this.currentIdentifier.set(next.identifier);
    void this.show(next);
  }

  private async show(message: ChatMessage | null): Promise<void> {
    if (message) await this.reveal()(message);
    this.mark();
  }

  private markFrame: number | null = null;

  private scheduleMarks(): void {
    if (this.markFrame !== null || !this.isSearching()) return;
    this.markFrame = requestAnimationFrame(() => {
      this.markFrame = null;
      this.mark();
    });
  }

  private mark(): void {
    markChatSearch(this.log(), this.query(), this.currentIdentifier());
  }
}
