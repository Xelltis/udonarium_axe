import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TextOutline } from '@axe/domain/map-editor/scene';
import { BoardPoint, MARK_SHADOW } from '@axe/features/tabletop/white-board/white-board-scene';

/** How the words being typed will look once they are written down. */
export interface WordBoxLook {
  readonly fontSize: number;
  readonly color: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly shadow: boolean;
  /** The line round the letters, in board pixels, or null for none. */
  readonly outline: TextOutline | null;
}

/**
 * The box words are typed into on the board editor's sheet, shown where and how they will be
 * written.
 *
 * It opens holding the words given, with the caret after them, since nobody opens one meaning to
 * wait. It reports every change to what is typed, and asks to be written down on Ctrl+Enter or
 * thrown away on Escape.
 */
@Component({
  selector: 'white-board-word-box',
  templateUrl: './white-board-word-box.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class WhiteBoardWordBoxComponent {
  /** Where the words start, in board pixels. */
  readonly at = input.required<BoardPoint>();
  /** How big the sheet is shown, against its own size. */
  readonly zoom = input.required<number>();
  readonly look = input.required<WordBoxLook>();
  /** The words the box opens with: those being typed over, or none. */
  readonly words = input('');

  /** What the box holds after each change to it. */
  readonly typed = output<string>();
  /** Asks for the words to be written down. */
  readonly commit = output<void>();
  /** Asks for the words to be thrown away. */
  readonly discard = output<void>();

  private readonly boxRef = viewChild.required<ElementRef<HTMLElement>>('wordBox');

  /** The line round the letters, shown on the box they are being typed into. */
  protected readonly stroke = computed(() => {
    const line = this.look().outline;
    return line ? `${line.width * this.zoom()}px ${line.color}` : '';
  });

  protected readonly rules = computed(() => {
    const look = this.look();
    const rules = [look.underline ? 'underline' : '', look.strike ? 'line-through' : ''].filter(Boolean);
    return rules.length > 0 ? rules.join(' ') : 'none';
  });

  protected readonly shadow = computed(() => {
    if (!this.look().shadow) return 'none';
    const shadow = MARK_SHADOW;
    const zoom = this.zoom();
    return `${shadow.offsetX * zoom}px ${shadow.offsetY * zoom}px ${shadow.blur * zoom}px ${shadow.color}`;
  });

  constructor() {
    afterNextRender(() => {
      const box = this.boxRef().nativeElement;
      box.textContent = this.words();
      box.focus();
      const range = document.createRange();
      range.selectNodeContents(box);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }

  protected onInput(event: Event): void {
    this.typed.emit((event.target as HTMLElement).innerText);
  }

  /**
   * The keys the word box answers to itself.
   *
   * Escape and enter both mean something to an input method while it is composing, so the box
   * hears them only once the letters have been settled on.
   */
  protected onKey(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.discard.emit();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.commit.emit();
    }
  }
}
