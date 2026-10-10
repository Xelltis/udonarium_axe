import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DiceRenderService } from '@axe/application/dice/dice-render.service';
import { DiceFrame, DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { DiceMatComponent } from '@axe/ui/components/dice-roll-stage/dice-mat.component';

/** How near the foot of a scrolling log counts as at it. */
const AT_FOOT_PX = 24;
/** How far outside the screen a frame counts as in view, so dice are drawn just before they are scrolled to. */
const IN_VIEW_MARGIN = '200px';

/**
 * One tray of a chat roll's dice, in the frame it is drawn in, on the mat the skin lays: the dice are
 * drawn over it with their shadows, and it is laid by the page under them.
 *
 * It takes its height from the start, so a log that was at its foot when it opened is kept at its
 * foot. Its dice are drawn only while it is in view; one scrolled away gives its picture back, and
 * one come into view with no dice thrown has them laid down.
 */
@Component({
  selector: 'dice-tray-frame',
  templateUrl: './dice-tray-frame.component.html',
  imports: [DiceMatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class DiceTrayFrameComponent {
  /** The dice bot's answer whose dice are shown. */
  readonly messageIdentifier = input.required<string>();
  readonly frame = input.required<DiceFrame>();

  private readonly throws = inject(DiceThrowService);
  private readonly renderer = inject(DiceRenderService);
  private readonly injector = inject(Injector);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  /** What the dice land on, which this reader's skin chooses. */
  protected readonly mat = inject(SkinService).diceMat;
  private readonly inView = signal(false);
  private readonly key = computed(() => this.frame().key);
  private readonly thrown = computed(() => this.frame().diceThrow !== null);

  constructor() {
    effect((onCleanup) => {
      const canvas = this.canvas()?.nativeElement;
      if (!canvas) return;
      afterNextRender(() => keepAtFoot(canvas), { injector: this.injector });
      const stop = watchView(canvas, (seen) => this.inView.set(seen));
      onCleanup(() => {
        stop();
        this.inView.set(false);
      });
    });
    effect(() => {
      if (!this.inView() || this.thrown()) return;
      const id = this.messageIdentifier();
      untracked(() => this.throws.showStill(id));
    });
    effect((onCleanup) => {
      const canvas = this.canvas()?.nativeElement;
      if (!canvas || !this.inView()) return;
      const handle = this.renderer.register(canvas, this.key());
      const observer =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(([entry]) => handle.resize(entry.contentRect.width, entry.contentRect.height));
      observer?.observe(canvas);
      if (!observer) handle.resize(canvas.clientWidth, canvas.clientHeight);
      onCleanup(() => {
        observer?.disconnect();
        handle.release();
        canvas.width = 0;
        canvas.height = 0;
      });
    });
  }
}

/**
 * Tells whether an element is in view as that changes, by the window it is in, which for a panel
 * taken out into a window of its own is not this one. Where nothing can tell, it is taken as in view.
 */
function watchView(element: HTMLElement, seen: (inView: boolean) => void): () => void {
  const Observer = element.ownerDocument.defaultView?.IntersectionObserver;
  if (typeof Observer !== 'function') {
    seen(true);
    return () => undefined;
  }
  const observer = new Observer((entries) => seen(entries[entries.length - 1].isIntersecting), {
    rootMargin: IN_VIEW_MARGIN,
  });
  observer.observe(element);
  return () => observer.disconnect();
}

/** Scrolls the log a frame opened in back to its foot, if it was there before the frame took its room. */
function keepAtFoot(frame: HTMLElement): void {
  const log = scrollingAncestorOf(frame);
  if (!log) return;
  const below = log.scrollHeight - log.clientHeight - log.scrollTop;
  if (below - frame.getBoundingClientRect().height <= AT_FOOT_PX) log.scrollTop = log.scrollHeight;
}

function scrollingAncestorOf(element: HTMLElement): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && at.scrollHeight > at.clientHeight) return at;
  }
  return null;
}
