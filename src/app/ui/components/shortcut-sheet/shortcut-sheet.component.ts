import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { shortcutKeysText, ShortcutSheetSection } from '@axe/domain/ui/keyboard-shortcuts';
import { BUTTON_GUIDE_LABEL_ATTRIBUTE } from '@axe/ui/components/button-guide/button-guide.component';
import { SHORTCUT_SHEET_MARGIN, shortcutSheetPlace } from '@axe/ui/shortcut-sheet-place';
import { Z_SHORTCUT_SHEET } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Marks what the cheat sheet keeps clear of: the names the guide to the buttons writes beside them,
 * and the bars that stand over the sheet. The buttons named in place are kept clear of as well.
 */
export const SHORTCUT_SHEET_AVOID_ATTRIBUTE = 'data-shortcut-sheet-avoid';

/** How long the menu's drawer takes to come out, after which the names it writes stay where they are. */
const SETTLE_MS = 300;

/**
 * The widths the sheet is tried at. Its columns are of a set width, so the wider it is laid out the
 * more of them there are and the shorter it gets, to fit the band a small screen has to spare.
 */
const SHEET_WIDTHS = [680, 960, 1120, 1280];

/**
 * The cheat sheet: the keys and the modified clicks that can be used, under a heading for each
 * place they are used in.
 *
 * It only shows what it is given, and puts itself where it hides the least of the names of the
 * buttons written out with it. Where the screen is too crowded for that, it stands under them, so
 * that it never hides a name. Like those names it is looked at rather than used: a press goes
 * through it to whatever is under it.
 */
@Component({
  selector: 'ui-shortcut-sheet',
  templateUrl: './shortcut-sheet.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'contents', '(window:resize)': 'place()' },
})
export class UiShortcutSheetComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  readonly sections = input.required<readonly ShortcutSheetSection[]>();

  protected readonly zIndex = Z_SHORTCUT_SHEET;
  protected readonly spot = signal<{ left: number; top: number } | null>(null);

  protected readonly headings = computed(() =>
    this.sections().map((section) => ({
      scope: section.scope,
      titleKey: `feature.keyboard.scope.${section.scope}`,
      lines: section.shortcuts.map((shortcut) => ({
        id: shortcut.id,
        keys: shortcutKeysText(shortcut),
        pointerKey: shortcut.pointer ? `feature.keyboard.pointer.${shortcut.pointer}` : null,
        labelKey: shortcut.labelKey,
      })),
    }))
  );

  constructor() {
    afterNextRender(() => {
      this.place();
      const settle = setTimeout(() => this.place(), SETTLE_MS);
      this.destroyRef.onDestroy(() => clearTimeout(settle));
    });
  }

  /** Measures the sheet at each of its widths and puts it in the shape and place that hide the least. */
  protected place(): void {
    const sheet = this.sheet().nativeElement;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const avoid = Array.from(
      document.querySelectorAll<HTMLElement>(`[${SHORTCUT_SHEET_AVOID_ATTRIBUTE}], [${BUTTON_GUIDE_LABEL_ATTRIBUTE}]`)
    )
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width >= 1 || rect.height >= 1);

    const widths = [
      ...new Set(SHEET_WIDTHS.map((width) => Math.min(width, viewport.width - 2 * SHORTCUT_SHEET_MARGIN))),
    ];
    const shapes = widths.map((width) => {
      sheet.style.width = `${width}px`;
      return { width, height: sheet.offsetHeight };
    });
    const spot = shortcutSheetPlace(shapes, viewport, avoid);
    sheet.style.width = `${spot.width}px`;
    this.spot.set({ left: spot.left, top: spot.top });
  }
}
