import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';

/** The text being typed onto the map: where it starts, in the map's own pixels, and what it starts as. */
export interface MapEditorTextBoxEdit {
  readonly x: number;
  readonly y: number;
  readonly initial: string;
}

/**
 * The box text is typed into on the board, laid where the text will be drawn and in the font it
 * will be drawn in. It takes the caret as an edit starts, tells of every change to what is typed,
 * and asks to keep it on Ctrl+Enter or to drop it on Escape.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'map-editor-text-box',
  templateUrl: './map-editor-text-box.component.html',
  host: { class: 'contents' },
})
export class MapEditorTextBoxComponent {
  protected readonly state = inject(MapEditorState);

  /** The edit under way. A new one puts its text in the box and the caret at the end of it. */
  readonly editing = input.required<MapEditorTextBoxEdit>();
  /** What is typed in the box, told on every change. */
  readonly drafted = output<string>();
  /** Asked for with Ctrl+Enter or Cmd+Enter: keep what is typed. */
  readonly committed = output<void>();
  /** Asked for with Escape: drop what is typed. */
  readonly cancelled = output<void>();

  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');

  constructor() {
    effect(() => {
      const editing = this.editing();
      const box = this.box().nativeElement;
      untracked(() => this.takeCaret(box, editing.initial));
    });
  }

  protected onInput(event: Event): void {
    this.drafted.emit((event.target as HTMLElement).innerText);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelled.emit();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.committed.emit();
    }
  }

  private takeCaret(box: HTMLElement, text: string): void {
    box.textContent = text;
    box.focus();
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}
