import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  TemplateRef,
  viewChild,
  viewChildren,
} from '@angular/core';
import { VirtualRowHeights, visibleRows } from '@axe/ui/components/virtual-list/virtual-rows';

/** What a row template is given: the item, and its place in the whole list. */
export interface VirtualRowContext<T> {
  $implicit: T;
  index: number;
}

/**
 * A scrolling list that draws only the rows near what is on screen.
 *
 * Rows may be of any height and may change height; each is measured once drawn, and the space of
 * the rows not drawn is held open by their measured or estimated heights. Content projected ahead
 * of the rows scrolls with them. The row template is the `ng-template` marked `#row` given as content.
 */
@Component({
  selector: 'ui-virtual-list',
  templateUrl: './virtual-list.component.html',
  host: { class: 'block min-h-0 overflow-y-auto', '(scroll)': 'onScroll()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
})
export class VirtualListComponent<T> {
  readonly items = input.required<readonly T[]>();
  /** The key a row keeps whatever its place, so its measured height travels with it. */
  readonly trackBy = input.required<(item: T) => unknown>();
  /** The height to assume for a row not yet drawn, in pixels. */
  readonly estimate = input(28);
  /** How far beyond the screen, above and below, rows are drawn ahead, in pixels. */
  readonly overscan = input(600);

  /** The template of a row, marked `#row`; projected content may carry templates of its own. */
  protected readonly rowTemplate = contentChild.required<string, TemplateRef<VirtualRowContext<T>>>('row', {
    read: TemplateRef,
  });

  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly area = viewChild.required<ElementRef<HTMLElement>>('area');
  private readonly cells = viewChildren<ElementRef<HTMLElement>>('cell');

  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(0);
  private readonly areaTop = signal(0);
  private readonly measuredVersion = signal(0);
  private heights: VirtualRowHeights | null = null;
  private frame: number | null = null;

  private readonly keys = computed(() => {
    const trackBy = this.trackBy();
    return this.items().map((item) => trackBy(item));
  });

  protected readonly layout = computed(() => {
    this.measuredVersion();
    return this.rowHeights().layout(this.keys());
  });

  private readonly range = computed(() => {
    const top = this.scrollTop() - this.areaTop();
    return visibleRows(this.layout(), top - this.overscan(), top + this.viewportHeight() + this.overscan());
  });

  protected readonly offsetTop = computed(() => this.layout().offsets[this.range().start] ?? 0);

  protected readonly drawn = computed(() => {
    const { start, end } = this.range();
    const items = this.items();
    const keys = this.keys();
    const cells: { item: T; index: number; key: unknown }[] = [];
    for (let index = start; index < end && index < items.length; index++) {
      cells.push({ item: items[index], index, key: keys[index] });
    }
    return cells;
  });

  private readonly observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => this.onResize(entries));
  /** The drawn rows being watched for their height, so those no longer drawn can be let go. */
  private readonly watched = new Set<Element>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.observer?.disconnect();
      if (this.frame !== null) cancelAnimationFrame(this.frame);
    });
    this.observer?.observe(this.host);
    afterRenderEffect(() => {
      this.watchRows(this.cells().map((cell) => cell.nativeElement));
      this.areaTop.set(this.area().nativeElement.offsetTop);
      if (this.viewportHeight() === 0) this.viewportHeight.set(this.host.clientHeight);
    });
  }

  /** Scrolls so the row at `index` is in view, moving no further than it takes. */
  scrollToIndex(index: number): void {
    const { offsets } = this.layout();
    if (index < 0 || index >= offsets.length - 1) return;
    const top = offsets[index] + this.areaTop();
    const bottom = offsets[index + 1] + this.areaTop();
    if (top < this.host.scrollTop) this.host.scrollTop = top;
    else if (bottom > this.host.scrollTop + this.host.clientHeight)
      this.host.scrollTop = bottom - this.host.clientHeight;
  }

  protected onScroll(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.scrollTop.set(this.host.scrollTop);
    });
  }

  /** Watches the rows drawn now for their height, and stops watching those no longer drawn. */
  private watchRows(drawn: readonly HTMLElement[]): void {
    if (!this.observer) return;
    const now = new Set<Element>(drawn);
    for (const element of this.watched) {
      if (now.has(element)) continue;
      this.observer.unobserve(element);
      this.watched.delete(element);
    }
    for (const element of now) {
      if (this.watched.has(element)) continue;
      this.observer.observe(element);
      this.watched.add(element);
    }
  }

  private rowHeights(): VirtualRowHeights {
    this.heights ??= new VirtualRowHeights(this.estimate());
    return this.heights;
  }

  /**
   * Takes the drawn heights of the rows, and of the list itself.
   *
   * A row above the screen that grows or shrinks would carry what is on screen with it, so the
   * scroll moves by as much to keep the rows in view where they were. A row no longer in the page
   * is reported with no height, which is not its height, and is passed over.
   */
  private onResize(entries: readonly ResizeObserverEntry[]): void {
    let changed = false;
    let above = 0;
    const scrolled = this.host.scrollTop - this.areaTop();
    const { offsets } = this.layout();
    const keys = this.keys();
    for (const entry of entries) {
      if (entry.target === this.host) {
        this.viewportHeight.set(this.host.clientHeight);
        continue;
      }
      const row = entry.target as HTMLElement;
      const index = Number(row.dataset['index']);
      if (!Number.isInteger(index) || index >= keys.length) continue;
      const height = row.offsetHeight;
      if (height <= 0) continue;
      const delta = this.rowHeights().measure(keys[index], height);
      if (delta === 0) continue;
      changed = true;
      if (offsets[index + 1] <= scrolled) above += delta;
    }
    if (!changed) return;
    this.measuredVersion.update((version) => version + 1);
    if (above !== 0) this.host.scrollTop += above;
  }
}
