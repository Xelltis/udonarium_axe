import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import {
  encodeVnEmote,
  VN_BUBBLE_ANIMATIONS,
  VN_BUBBLE_SHAPES,
  VN_EMOTION_MARK_CHARS,
  VN_EMOTION_MARKS,
  VN_PORTRAIT_EMOTES,
  vnBodyOf,
  VnBubbleAnimation,
  VnBubbleShape,
  vnEmoteOf,
  VnEmotionMark,
  VnMessageKind,
  VnPortraitEmote,
} from '@axe/domain/visual-novel/vn-emote';
import { isVnPortraitPosSet, VN_PORTRAIT_POS_UNSET } from '@axe/domain/visual-novel/vn-portrait-position';
import { VN_STAGE_SLOT_COUNT } from '@axe/domain/visual-novel/vn-stage-cast';
import { buildBacklogEntryContextMenu } from '@axe/features/visual-novel/visual-novel-backlog/visual-novel-backlog-context-menu';
import { VisualNovelDirectorService } from '@axe/features/visual-novel/visual-novel-director.service';
import { vnEmoteLabel } from '@axe/features/visual-novel/visual-novel-emote-label';
import { VisualNovelEmoteSelectionService } from '@axe/features/visual-novel/visual-novel-emote-selection.service';
import { readableMessageName, readableMessageText } from '@axe/features/visual-novel/visual-novel-message';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { RubyTextComponent } from '@axe/ui/components/ruby-text/ruby-text.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { RubyPart, splitRubyNotation } from '@axe/ui/text-decoration/decorate-chat-text';
import { TranslocoModule } from '@jsverse/transloco';

const BACKLOG_PAGE_SIZE = 200;

export interface VnBacklogEntry {
  message: ChatMessage;
  index: number;
  /** Read in the reader's language, which matters for what the room says of itself. */
  name: string;
  text: string;
  /** The text as it is shown, with the readings the ruby notation gives it. */
  parts: readonly RubyPart[];
  suffix: string;
  imageUrl: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'visual-novel-backlog',
  templateUrl: './visual-novel-backlog.component.html',
  host: { class: 'contents' },
  imports: [DatePipe, FormsModule, RubyTextComponent, SafePipe, TranslocoModule],
})
export class VisualNovelBacklogComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageService = inject(ImageService);
  private readonly translate = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly playback = inject(VisualNovelPlaybackService);
  private readonly director = inject(VisualNovelDirectorService);
  private readonly emoteSelection = inject(VisualNovelEmoteSelectionService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly viewport = inject(ViewportService);

  /**
   * Which line the reader is looking at, and where they can go from here.
   *
   * The log is a window of its own now rather than a piece of the novel-mode screen, so it
   * asks for these itself instead of being handed them: a panel is only given values that can
   * be assigned to a plain field, and nothing can listen to what it emits.
   */
  readonly messageKindOptions = this.emoteSelection.messageKindOptions;

  readonly bubbleShapeOptions = VN_BUBBLE_SHAPES;
  readonly bubbleAnimationOptions = VN_BUBBLE_ANIMATIONS;
  readonly portraitEmoteOptions = VN_PORTRAIT_EMOTES;
  readonly emotionMarkOptions = VN_EMOTION_MARKS;
  readonly slotIndexes = Array.from({ length: VN_STAGE_SLOT_COUNT }, (_, i) => i);

  /**
   * The line being read, named rather than numbered.
   *
   * The log shows more than the script does, so a position in one is not a position in the
   * other; the identifier means the same thing in both.
   */
  readonly currentIdentifier = computed(() => this.playback.currentMessage()?.identifier ?? '');

  readonly filter = signal('');

  readonly editingIdentifier = signal('');
  readonly editText = signal('');
  readonly editKind = signal<VnMessageKind>('normal');
  readonly editShape = signal<VnBubbleShape>('normal');
  readonly editBubbleAnimation = signal<VnBubbleAnimation>('none');
  readonly editPortraitEmote = signal<VnPortraitEmote>('none');
  readonly editEmotionMark = signal<VnEmotionMark>('none');
  readonly editFlipped = signal(false);
  readonly editExited = signal(false);
  readonly editSlot = signal(-1);

  private readonly listElement = viewChild<ElementRef<HTMLDivElement>>('backlogList');

  readonly entries = computed<VnBacklogEntry[]>(() => {
    this.objectChange.fileVersion();
    this.language.currentLang();
    return this.playback.logMessages().map((message, index) => {
      const readable = readableMessageText(message, this.translate);
      const text = vnBodyOf(message.vnEmote, readable);
      const suffix = vnEmoteLabel(vnEmoteOf(message.vnEmote, readable), this.translate);
      const hasPortrait = !message.isSystemMessage && !message.isDicebot;
      return {
        message,
        index,
        name: readableMessageName(message, this.translate),
        text,
        parts: splitRubyNotation(text),
        suffix,
        imageUrl: hasPortrait ? this.imageService.getEmptyOr(message.imageIdentifier).url : '',
      };
    });
  });

  readonly onlyMine = signal(false);
  readonly onlyEmote = signal(false);

  readonly filteredEntries = computed(() => {
    const keyword = this.filter().trim().toLowerCase();
    const onlyMine = this.onlyMine();
    const onlyEmote = this.onlyEmote();
    return this.entries().filter((entry) => {
      if (onlyMine && !entry.message.isSendFromSelf) return false;
      if (onlyEmote && entry.suffix.length < 1) return false;
      if (keyword.length < 1) return true;
      return entry.text.toLowerCase().includes(keyword) || entry.name.toLowerCase().includes(keyword);
    });
  });

  /** Reading somewhere of one's own is stepping out of the showcase the game master is running. */
  jumpTo(identifier: string): void {
    this.director.leaveFollowing();
    this.playback.jumpToIdentifier(identifier);
  }

  /** Narrows the backlog to the lines this reader sent, or lifts that narrowing. */
  toggleOnlyMine(): void {
    this.onlyMine.update((only) => !only);
  }

  /** Narrows the backlog to the lines that carry an emote, or lifts that narrowing. */
  toggleOnlyEmote(): void {
    this.onlyEmote.update((only) => !only);
  }

  /**
   * Scrolls the backlog to the line now on the stage. Does nothing when that line is not among
   * those listed.
   */
  scrollToCurrent(): void {
    this.rowFor(this.currentIdentifier())?.scrollIntoView({ block: 'center' });
  }

  readonly visibleCount = signal(BACKLOG_PAGE_SIZE);

  readonly windowedEntries = computed(() => {
    const entries = this.filteredEntries();
    const count = this.visibleCount();
    if (entries.length <= count) return entries;
    let start = entries.length - count;
    const position = entries.findIndex((entry) => entry.message.identifier === this.currentIdentifier());
    if (position >= 0 && position < start) start = position;
    return entries.slice(start);
  });

  readonly hiddenCount = computed(() => this.filteredEntries().length - this.windowedEntries().length);

  /**
   * Lists another 200 earlier lines above those already listed, which are cut short to keep a long
   * log quick to draw.
   */
  loadMoreEntries(): void {
    this.visibleCount.update((count) => count + BACKLOG_PAGE_SIZE);
  }

  constructor() {
    effect(() => {
      const list = this.listElement()?.nativeElement;
      if (!list) return;
      const row = this.rowFor(this.currentIdentifier());
      if (row) {
        row.scrollIntoView({ block: 'center' });
      } else {
        list.scrollTop = list.scrollHeight;
      }
    });
  }

  private rowFor(identifier: string): HTMLElement | null {
    if (identifier.length < 1) return null;
    const list = this.listElement()?.nativeElement;
    return list?.querySelector<HTMLElement>(`[data-vn-log-id="${identifier}"]`) ?? null;
  }

  /**
   * The character an emotion mark is shown as among the choices of the edit form; empty for no
   * mark.
   */
  emotionMarkLabel(mark: VnEmotionMark): string {
    return mark === 'none' ? '' : VN_EMOTION_MARK_CHARS[mark];
  }

  /**
   * What can be done with a line of the log, opened by a right click or a press held on it.
   *
   * The pencil on a line only shows under a mouse, so a touch screen reaches it through this. A
   * right click while words reaching into the line are picked out keeps the browser's own menu,
   * which is how they are copied with a mouse; a press held on a touch screen still opens this.
   */
  protected onEntryContextMenu(event: MouseEvent, entry: VnBacklogEntry): void {
    if (this.editingIdentifier() === entry.message.identifier) return;
    if (!this.viewport.isTouch() && this.wordsPickedOutReach(event.currentTarget)) return;
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const actions = buildBacklogEntryContextMenu(
      entry.message.changeable,
      { edit: () => this.startEditEntry(entry) },
      this.translate
    );
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, entry.name);
  }

  /** Whether any of the words picked out on the page reach into this line of the log. */
  private wordsPickedOutReach(row: EventTarget | null): boolean {
    if (!(row instanceof Element)) return false;
    const selection = row.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) return false;
    return Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)).some((range) =>
      range.intersectsNode(row)
    );
  }

  /**
   * Opens the edit form on a line, filled in with its text, its emote and where its portrait
   * stands. Does nothing for a line that may not be changed.
   */
  startEditEntry(entry: { message: ChatMessage; index: number }): void {
    if (!entry.message.changeable) return;
    const raw = entry.message.text ?? '';
    const parsed = vnEmoteOf(entry.message.vnEmote, raw);
    this.editText.set(vnBodyOf(entry.message.vnEmote, raw));
    this.editKind.set(parsed.kind);
    this.editShape.set(parsed.shape);
    this.editBubbleAnimation.set(parsed.bubbleAnimation);
    this.editPortraitEmote.set(parsed.portraitEmote);
    this.editEmotionMark.set(parsed.emotionMark);
    this.editFlipped.set(parsed.flipped);
    this.editExited.set(parsed.exited);
    const pos = entry.message.vnPortraitPos;
    this.editSlot.set(isVnPortraitPosSet(pos) ? pos : VN_PORTRAIT_POS_UNSET);
    this.editingIdentifier.set(entry.message.identifier);
  }

  /** Closes the edit form without keeping what was changed in it. */
  cancelEditEntry(): void {
    this.editingIdentifier.set('');
  }

  /**
   * Writes the edit form back to the line and closes the form.
   *
   * Empty text is not kept, and the form stays open for it. The line is marked as edited only where
   * its text or emote changed; a line that may no longer be changed closes the form without a word.
   */
  saveEditEntry(): void {
    const message = this.playback.logMessages().find((candidate) => candidate.identifier === this.editingIdentifier());
    if (!message?.changeable) {
      this.editingIdentifier.set('');
      return;
    }
    const text = this.editText().trim();
    if (text.length < 1) return;
    const emote = encodeVnEmote({
      kind: this.editKind(),
      shape: this.editShape(),
      bubbleAnimation: this.editBubbleAnimation(),
      portraitEmote: this.editPortraitEmote(),
      emotionMark: this.editEmotionMark(),
      flipped: this.editFlipped(),
      exited: this.editExited(),
    });
    if (message.text !== text || message.vnEmote !== emote) {
      message.text = text;
      message.vnEmote = emote;
      message.fixd = true;
    }
    if (message.vnPortraitPos !== this.editSlot()) {
      message.vnPortraitPos = this.editSlot();
    }
    this.editingIdentifier.set('');
  }
}
