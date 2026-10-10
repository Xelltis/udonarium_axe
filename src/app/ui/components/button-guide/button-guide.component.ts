import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { ButtonGuideBubble, buttonGuideLayout, ButtonGuideTarget } from '@axe/ui/button-guide-layout';
import { fabDrawerSide } from '@axe/ui/fab-drawer';

/** What a button is called in the guide, read off the button itself. */
export const BUTTON_GUIDE_LABEL_ATTRIBUTE = 'data-guide-label';

/**
 * The name of every button on a bar, written out beside the bar at once.
 *
 * Put inside the bar it names, which has to be positioned. It reads the buttons from the bar as it
 * is laid out when the guide comes out, by the name each carries in `data-guide-label`, and hangs
 * the names on the side of the bar with the most room: below a bar in the top half of the window
 * and above one in the bottom half, out to the left of a bar in the right half. Nothing it draws
 * takes a press, and nothing on the bar moves to make room for it.
 */
@Component({
  selector: 'ui-button-guide',
  templateUrl: './button-guide.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents', '(window:resize)': 'measure()' },
})
export class UiButtonGuideComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly bubbles = signal<ButtonGuideBubble[]>([]);

  constructor() {
    afterNextRender(() => this.measure());
  }

  protected measure(): void {
    const bar = this.host.nativeElement.parentElement;
    if (!bar) return;
    const box = bar.getBoundingClientRect();
    const originLeft = box.left + bar.clientLeft;
    const originTop = box.top + bar.clientTop;

    const targets: ButtonGuideTarget[] = [];
    for (const element of Array.from(bar.querySelectorAll<HTMLElement>(`[${BUTTON_GUIDE_LABEL_ATTRIBUTE}]`))) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      targets.push({
        label: element.getAttribute(BUTTON_GUIDE_LABEL_ATTRIBUTE) ?? '',
        left: rect.left - originLeft,
        right: rect.right - originLeft,
        top: rect.top - originTop,
        bottom: rect.bottom - originTop,
      });
    }

    const direction = fabDrawerSide(box, { width: window.innerWidth, height: window.innerHeight });
    this.bubbles.set(buttonGuideLayout(targets, { width: bar.clientWidth, height: bar.clientHeight }, direction));
  }
}
