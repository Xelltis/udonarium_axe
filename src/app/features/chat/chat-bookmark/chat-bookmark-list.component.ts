import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ChatBookmarkService } from '@axe/application/chat/chat-bookmark.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ChatBookmarkKind } from '@axe/domain/chat/chat-bookmark';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import {
  isChatTextHidden,
  readableChatName,
  readableChatText,
} from '@axe/features/chat/chat-message/chat-readable-text';
import { TranslocoModule } from '@jsverse/transloco';

/** How much of a line stands for it where its mark has no name of its own. */
const TITLE_LENGTH = 40;
/** How much of a line is shown under a mark that has a name of its own. */
const EXCERPT_LENGTH = 120;

/** Which marks the list shows: both kinds, or one. */
export type ChatBookmarkFilter = 'all' | ChatBookmarkKind;

/** One mark as the list shows it. */
export interface ChatBookmarkItem {
  /** The mark among all the list holds, as its kind and the identifier of its line. */
  readonly key: string;
  readonly message: ChatMessage;
  readonly kind: ChatBookmarkKind;
  /** The name the mark was given, or the opening words of the line where it was given none. */
  readonly title: string;
  /** Whether the mark was named, so the line's own words are shown under the name. */
  readonly named: boolean;
  readonly excerpt: string;
  readonly speaker: string;
  readonly tabName: string;
  readonly placedAt: number;
}

/**
 * The bookmarks on chat lines, the room's shared ones and the reader's own, as a list to go back to
 * them by.
 *
 * The list shows both kinds or one, each mark saying which it is. Choosing a mark asks for its line
 * to be shown; renaming and taking marks off are offered on the marks the reader may change. Escape
 * closes the list, and while a name is being typed it puts the name back instead.
 */
@Component({
  selector: 'chat-bookmark-list',
  templateUrl: './chat-bookmark-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, DatePipe],
  host: { class: 'block', '(keydown.escape)': 'onEscape($event)' },
})
export class ChatBookmarkListComponent {
  private readonly bookmarks = inject(ChatBookmarkService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly language = inject(LanguageService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly injector = inject(Injector);

  /** A mark was chosen, and its line is to be shown. */
  readonly jump = output<ChatMessage>();
  /** The reader asked for the list to close. */
  readonly closed = output<void>();

  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private readonly listRef = viewChild<ElementRef<HTMLElement>>('list');

  /** Which marks are shown. */
  readonly filter = signal<ChatBookmarkFilter>('all');
  /** The choices of which marks to show, in the order they are offered. */
  readonly filters: readonly ChatBookmarkFilter[] = ['all', 'shared', 'personal'];

  /** The marks this reader may see, in the order their lines were said. */
  readonly allItems = computed<readonly ChatBookmarkItem[]>(() => {
    this.language.currentLang();
    const canSeeHidden = this.rolePermission.canSeeHidden;
    return this.bookmarks.entries().map(({ message, tab, kind, name }) => {
      const hidden = isChatTextHidden(message, canSeeHidden);
      const words = hidden
        ? this.t('feature.chat.message.secretDice')
        : readableChatText(message, false, this.t).replace(/\s+/g, ' ');
      const speaker = readableChatName(message, this.t);
      return {
        key: `${kind}:${message.identifier}`,
        message,
        kind,
        title: name || shorten(words, TITLE_LENGTH) || speaker,
        named: name.length > 0,
        excerpt: shorten(words, EXCERPT_LENGTH),
        speaker,
        tabName: tab.name,
        placedAt: message.placedAt,
      };
    });
  });

  /** The marks shown under the filter chosen. */
  readonly items = computed<readonly ChatBookmarkItem[]>(() => {
    const filter = this.filter();
    const items = this.allItems();
    return filter === 'all' ? items : items.filter((item) => item.kind === filter);
  });

  /** The mark being renamed, by its key, or null while none is. */
  readonly renaming = signal<string | null>(null);
  /** The name being typed for the mark. */
  readonly draft = signal('');

  /** Whether this reader may rename the mark and take it off: anyone their own, the table the room's. */
  canEdit(item: ChatBookmarkItem): boolean {
    return this.bookmarks.canEdit(item.kind);
  }

  /** Shows both kinds of mark, or one. */
  chooseFilter(filter: ChatBookmarkFilter): void {
    this.renaming.set(null);
    this.filter.set(filter);
  }

  /** Shows the line a mark is on. */
  open(item: ChatBookmarkItem): void {
    if (this.renaming() === item.key) return;
    this.jump.emit(item.message);
  }

  /** Opens the name of a mark for typing, starting from the name it shows under. */
  startRename(item: ChatBookmarkItem): void {
    if (!this.canEdit(item)) return;
    this.renaming.set(item.key);
    this.draft.set(item.named ? item.title : '');
    afterNextRender(
      () => {
        const input = this.renameInput()?.nativeElement;
        input?.focus();
        input?.select();
      },
      { injector: this.injector }
    );
  }

  /** Gives the mark being renamed the name typed; an empty name goes back to the line's own words. */
  commitRename(item: ChatBookmarkItem): void {
    if (this.renaming() !== item.key) return;
    this.bookmarks.rename(item.message, item.kind, this.draft());
    this.renaming.set(null);
  }

  /** Leaves the name of the mark being renamed as it was. */
  cancelRename(): void {
    this.renaming.set(null);
  }

  /** Enter keeps the name typed; Escape is handled with the list's own. */
  onRenameKeydown(event: KeyboardEvent, item: ChatBookmarkItem): void {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename(item);
    }
  }

  /** Takes the mark off a line. */
  remove(item: ChatBookmarkItem): void {
    this.bookmarks.remove(item.message, item.kind);
  }

  /** Puts the keyboard in the list, so Escape closes it straight away. */
  focus(): void {
    this.listRef()?.nativeElement.focus();
  }

  protected onEscape(event: Event): void {
    if ((event as KeyboardEvent).isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.renaming()) this.cancelRename();
    else this.closed.emit();
  }

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }
}

function shorten(text: string, length: number): string {
  const trimmed = text.trim();
  return trimmed.length > length ? trimmed.slice(0, length) + '…' : trimmed;
}
