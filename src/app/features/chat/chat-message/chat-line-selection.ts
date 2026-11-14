import { afterNextRender, inject, Injector, signal } from '@angular/core';

/**
 * The words picked out on the page as they bear on a line: whether any of them reach into it,
 * and their text where all of them lie inside it.
 */
export function wordsPickedOutIn(line: Element): { reachesLine: boolean; inside: string } {
  const selection = line.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
    return { reachesLine: false, inside: '' };
  }
  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));
  if (!ranges.some((range) => range.intersectsNode(line))) return { reachesLine: false, inside: '' };
  const allInside = ranges.every((range) => line.contains(range.commonAncestorContainer));
  return { reachesLine: true, inside: allInside ? selection.toString() : '' };
}

/** The elements of a chat line whose words are picked out. */
export interface ChatLineSelectionHost {
  /** The whole line, which a press outside of ends the picking out. */
  line(): HTMLElement;
  /** The element holding the line's words, while it is drawn. */
  body(): HTMLElement | null;
}

/**
 * Lets the words of one chat line be picked out where they otherwise may not be, as on a touch
 * screen, where a press held on a line opens its menu rather than starting to pick them out.
 *
 * Made where services can be injected, as a field of the line it belongs to.
 */
export class ChatLineSelection {
  private readonly injector = inject(Injector);
  private stopFollowing: (() => void) | null = null;

  constructor(private readonly host: ChatLineSelectionHost) {}

  /** Whether the words of the line may be picked out just now. */
  readonly isSelecting = signal(false);

  /**
   * Lets the words of the line be picked out, and picks them all out so the system's handles and
   * its own actions for them come up.
   *
   * That lasts until the words are let go or moved off the line, or something off the line is tapped.
   */
  start(): void {
    this.isSelecting.set(true);
    afterNextRender(() => this.pickOutBody(), { injector: this.injector });
  }

  private pickOutBody(): void {
    const body = this.host.body();
    const selection = body?.ownerDocument.getSelection();
    if (!body || !selection) {
      this.end();
      return;
    }
    const range = body.ownerDocument.createRange();
    range.selectNodeContents(body);
    selection.removeAllRanges();
    selection.addRange(range);
    this.follow(body.ownerDocument);
  }

  private follow(page: Document): void {
    const line = this.host.line();
    const onSelectionChange = () => {
      if (!wordsPickedOutIn(line).reachesLine) this.end();
    };
    const onPointerDown = (event: Event) => {
      if (event.target instanceof Node && line.contains(event.target)) return;
      const stillPicked = wordsPickedOutIn(line).reachesLine;
      this.end();
      if (stillPicked) page.getSelection()?.removeAllRanges();
    };
    page.addEventListener('selectionchange', onSelectionChange);
    page.addEventListener('pointerdown', onPointerDown, true);
    this.stopFollowing = () => {
      page.removeEventListener('selectionchange', onSelectionChange);
      page.removeEventListener('pointerdown', onPointerDown, true);
    };
  }

  private end(): void {
    this.stopListening();
    this.isSelecting.set(false);
  }

  /** Stops following the page, as the line goes. */
  stopListening(): void {
    this.stopFollowing?.();
    this.stopFollowing = null;
  }
}
