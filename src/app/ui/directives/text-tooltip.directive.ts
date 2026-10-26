import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { observeTap, TapGestureHandle, TapPoint } from '@axe/core/input/tap-gesture';

const TOUCH_VISIBLE_MS = 2500;

@Directive({ selector: '[appTextTooltip]' })
export class TextTooltipDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly viewport = inject(ViewportService);
  private readonly destroyRef = inject(DestroyRef);

  /** The whole text, shown while it is cut short; nothing is shown for an empty or missing one. */
  readonly appTextTooltip = input<string | null | undefined>('');

  private tooltipEl: HTMLElement | null = null;
  private tapGesture: TapGestureHandle | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  private onMouseEnter = (e: MouseEvent) => {
    this.show(e);
    const el = this.el.nativeElement as HTMLElement;
    el.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('mouseleave', this.onMouseLeave);
  };
  private onMouseLeave = () => {
    this.stopFollowing();
    this.hide();
  };
  private onMouseMove = (e: MouseEvent) => this.move(e);

  /**
   * Waits for a pointer to come over the text, and follows it only while it is there: a list draws
   * one of these on every row, so a row the pointer is not over listens for as little as it can.
   */
  constructor() {
    const el = this.el.nativeElement as HTMLElement;
    el.addEventListener('mouseenter', this.onMouseEnter);
    this.tapGesture = observeTap(el, (point) => this.showAtPoint(point));
    this.destroyRef.onDestroy(() => {
      el.removeEventListener('mouseenter', this.onMouseEnter);
      this.stopFollowing();
      this.tapGesture?.destroy();
      this.tapGesture = null;
      this.hide();
    });
  }

  private stopFollowing() {
    const el = this.el.nativeElement as HTMLElement;
    el.removeEventListener('mousemove', this.onMouseMove);
    el.removeEventListener('mouseleave', this.onMouseLeave);
  }

  private showAtPoint(point: TapPoint) {
    if (!this.viewport.isTouch()) return;
    this.show({ clientX: point.x, clientY: point.y } as MouseEvent);
    if (!this.tooltipEl) return;
    this.tooltipEl.style.pointerEvents = 'none';
    this.hideTimer = setTimeout(() => this.hide(), TOUCH_VISIBLE_MS);
  }

  private show(e: MouseEvent) {
    const text = this.appTextTooltip();
    if (!text) return;
    const host = this.el.nativeElement as HTMLElement;
    if (host.scrollWidth <= host.clientWidth && text === host.textContent?.trim()) return;
    this.hide();
    const doc = host.ownerDocument;
    const div = doc.createElement('div');
    div.className = 'app-text-tooltip';
    div.textContent = text;
    doc.body.appendChild(div);
    this.tooltipEl = div;
    this.move(e);
  }

  private move(e: MouseEvent) {
    if (!this.tooltipEl) return;
    const x = e.clientX + 14;
    const y = e.clientY + 18;
    const rect = this.tooltipEl.getBoundingClientRect();
    const view = this.tooltipEl.ownerDocument.defaultView ?? window;
    this.tooltipEl.style.left = `${Math.min(x, view.innerWidth - rect.width - 8)}px`;
    this.tooltipEl.style.top = `${Math.min(y, view.innerHeight - rect.height - 8)}px`;
  }

  private hide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
