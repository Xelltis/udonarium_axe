import { Directive, ElementRef, inject } from '@angular/core';

/** The attribute a box holds while a word is being made in it with an input method. */
const COMPOSING_ATTR = 'data-composing';

/**
 * Marks a box while a word is being made in it with an input method, which a box cannot be asked,
 * for whatever would take the box away to wait for the word.
 */
@Directive({
  selector: '[uiComposingMark]',
  host: { '(compositionstart)': 'mark(true)', '(compositionend)': 'mark(false)' },
})
export class ComposingMarkDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected mark(composing: boolean): void {
    this.element.nativeElement.toggleAttribute(COMPOSING_ATTR, composing);
  }
}

/**
 * Runs `then` once no word is being made in the box: at once, or a moment after the word is made,
 * once it has reached whatever reads the box, so that taking the box away loses none of it.
 */
export function whenNotComposing(box: HTMLElement | null | undefined, then: () => void): void {
  if (!box?.hasAttribute(COMPOSING_ATTR)) {
    then();
    return;
  }
  box.addEventListener('compositionend', () => setTimeout(then), { once: true });
}
