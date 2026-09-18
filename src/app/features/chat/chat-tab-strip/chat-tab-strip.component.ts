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
  model,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatStreamPanelService } from '@axe/features/chat/chat-stream/chat-stream-panel.service';
import { buildChatTabContextMenu } from '@axe/features/chat/chat-window/chat-tab-context-menu';
import { BadgeComponent } from '@axe/ui/components/badge/badge.component';
import { TranslocoModule } from '@jsverse/transloco';

/** A line of wheel travel in pixels, for the browsers that report the wheel in lines. */
const WHEEL_LINE_PX = 16;

/** How far a wheel has to travel before it counts as asking for the next tab. */
const WHEEL_TAB_STEP_PX = 40;

/** How much of the strip is kept clear either side of the tab being read. */
const TAB_CLEARANCE_PX = 24;

/** How far the arrows at either end move the strip. */
const ARROW_STEP_PX = 120;

/** The ground a strip is laid on: a window's title bar, or the body of a panel. */
export type ChatTabStripTone = 'titlebar' | 'panel';

/**
 * The room above the tabs on each ground. An unread count stands 6px proud of its tab, and the strip
 * clips whatever leaves it, so that much is kept; a panel has no title bar to line up with.
 */
const STRIP_TONES: Record<ChatTabStripTone, string> = {
  titlebar: 'pt-2',
  panel: 'pt-1.5',
};

/**
 * How many strips have been drawn, which names each one's radio group apart from the rest.
 *
 * Radios of one name are one group, and two strips outside a form of their own would be the same
 * group: choosing a tab in one would take the mark off the other's tab, where nothing would put
 * it back.
 */
let stripsDrawn = 0;

/** The colours of a tab on each ground, which the selected tab and the hover share otherwise. */
const PILL_TONES: Record<ChatTabStripTone, string> = {
  titlebar:
    'border-ui-border-titlebar text-ui-titlebar-muted peer-checked:text-ui-titlebar-text hover:text-ui-titlebar-text',
  panel: 'border-ui-border-panel text-ui-muted peer-checked:text-ui-accent hover:text-ui-text',
};

@Component({
  selector: 'chat-tab-strip',
  templateUrl: './chat-tab-strip.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, TranslocoModule],
  host: { class: 'contents' },
})
export class ChatTabStripComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly chatStreamPanel = inject(ChatStreamPanelService);
  private readonly injector = inject(Injector);
  private readonly t = inject(TRANSLATE_FN);

  readonly tabs = input.required<readonly ChatTab[]>();
  readonly selected = model.required<string>();
  /** The ground the strip is laid on, which picks the colours its tabs read in. */
  readonly tone = input<ChatTabStripTone>('titlebar');

  protected readonly stripTone = computed(() => STRIP_TONES[this.tone()]);
  protected readonly pillTone = computed(() => PILL_TONES[this.tone()]);
  /** This strip's own radio group, which no other strip on the page shares. */
  protected readonly groupName = `chat-tab-${++stripsDrawn}`;

  private readonly container = viewChild<ElementRef<HTMLElement>>('tabPillsContainer');
  protected readonly canScrollLeft = signal(false);
  protected readonly canScrollRight = signal(false);
  private wheelTravel = 0;

  constructor() {
    effect(() => {
      this.tabs();
      afterNextRender(() => this.updateTabScrollState(), { injector: this.injector });
    });
    effect(() => {
      this.selected();
      afterNextRender(() => this.scrollActiveTabIntoView(), { injector: this.injector });
    });
  }

  /**
   * Works out whether the strip can scroll either way, which shows or hides the arrow at that end.
   */
  updateTabScrollState(): void {
    const el = this.container()?.nativeElement;
    if (!el) return;
    this.canScrollLeft.set(el.scrollLeft > 0);
    this.canScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  /** Keeps the arrows in step as the strip scrolls. */
  onTabPillsScroll(): void {
    this.updateTabScrollState();
  }

  /** Slides the strip left by a fixed step when the left arrow is clicked. */
  scrollTabsLeft(): void {
    this.container()?.nativeElement.scrollBy({ left: -ARROW_STEP_PX, behavior: 'smooth' });
  }

  /** Slides the strip right by a fixed step when the right arrow is clicked. */
  scrollTabsRight(): void {
    this.container()?.nativeElement.scrollBy({ left: ARROW_STEP_PX, behavior: 'smooth' });
  }

  /**
   * Selects the next or previous tab as the wheel turns over the strip.
   *
   * Travel is gathered until it makes up a step, so a trackpad does not run through several tabs at
   * once, and turning back starts the count again. A sideways push is left to scroll the strip.
   */
  switchTabByWheel(event: WheelEvent): void {
    const delta = wheelTravelOf(event);
    if (delta === 0) return;
    event.preventDefault();

    if (this.wheelTravel !== 0 && Math.sign(delta) !== Math.sign(this.wheelTravel)) this.wheelTravel = 0;
    this.wheelTravel += delta;
    if (Math.abs(this.wheelTravel) < WHEEL_TAB_STEP_PX) return;

    this.wheelTravel = 0;
    // At either end the tab does not change, so nothing else brings it back into view, and the
    // strip can be left part way through a scroll with the current tab off the end of it.
    if (!this.switchTabWithinEnds(delta > 0 ? 1 : -1)) this.scrollActiveTabIntoView();
  }

  /**
   * Opens the menu for a tab the user right-clicked, which includes opening or closing the tab as a
   * stream panel.
   */
  onChatTabContextMenu(event: Event, chatTab: ChatTab): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(
      this.pointerDeviceService.pointers[0],
      buildChatTabContextMenu(
        chatTab,
        this.chatStreamPanel.isOpen(chatTab),
        { onToggleStream: () => this.chatStreamPanel.toggle(chatTab) },
        this.t
      ),
      chatTab.name
    );
  }

  private switchTabWithinEnds(direction: number): boolean {
    const tabs = this.tabs();
    const index = tabs.findIndex((tab) => tab.identifier === this.selected());
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= tabs.length) return false;
    this.selected.set(tabs[nextIndex].identifier);
    return true;
  }

  private scrollActiveTabIntoView(): void {
    const el = this.container()?.nativeElement;
    if (!el) return;
    this.updateTabScrollState();

    const index = this.tabs().findIndex((tab) => tab.identifier === this.selected());
    const pill = el.children.item(index);
    if (!(pill instanceof HTMLElement)) return;

    const strip = el.getBoundingClientRect();
    const tab = pill.getBoundingClientRect();
    const before = tab.left - strip.left;
    const after = strip.right - tab.right;

    let shift = 0;
    if (before < TAB_CLEARANCE_PX) shift = before - TAB_CLEARANCE_PX;
    else if (after < TAB_CLEARANCE_PX) shift = TAB_CLEARANCE_PX - after;
    if (shift === 0) return;

    // Where to end up, not how far to go: asked for a distance part way through a scroll of its
    // own, the strip adds it to where it has reached and overshoots.
    el.scrollTo({ left: el.scrollLeft + shift, behavior: 'smooth' });
  }
}

/**
 * How far the wheel turned, in pixels. Zero for a sideways push.
 *
 * A trackpad swiped sideways over the strip means to slide the strip, and it is the one thing
 * there that scrolls that way, so the wheel is only taken when it turns.
 */
function wheelTravelOf(event: WheelEvent): number {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return 0;
  const raw = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return raw * WHEEL_LINE_PX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return raw * WHEEL_TAB_STEP_PX;
  return raw;
}
