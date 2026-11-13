import { ComponentRef, computed, Signal, signal } from '@angular/core';
import { PanelService, PanelSize } from '@axe/application/ui/panel.service';
import { PanelTabSlotComponent } from '@axe/ui/components/ui-panel/panel-tab-slot.component';

/** One panel standing in a frame: what it is, where it is drawn, and what it was built into. */
export interface PanelTabHandle {
  panel: PanelService;
  slot: ComponentRef<PanelTabSlotComponent>;
  body: ComponentRef<unknown>;
  /**
   * The size it wants back when it stands in a frame of its own again.
   *
   * Nothing until it is folded into a group: a panel standing alone is the size of its frame,
   * and that is not known when the panel is built - the size is written on the frame after.
   */
  box: { width: number; height: number } | null;
}

export interface PanelTab extends PanelTabHandle {
  /** Dropped when the panel leaves, or the frame goes on answering for a panel it lost. */
  unsubscribe: () => void;
}

/** What the frame does when the panel it is showing asks something of it. */
export interface PanelTabsFrame {
  setShrunk(shrunk: boolean): void;
  resizeTo(size: PanelSize | null): void;
}

/**
 * The panels a frame holds as tabs, and which of them it is showing.
 *
 * It keeps the row in order and the index inside it, and follows what each panel folded in asks
 * of the frame. What the frame draws, and when it tells a panel it is looked at, stay with the
 * frame: this knows nothing of rendering.
 */
export class PanelTabsHolder {
  private readonly held = signal<readonly PanelTab[]>([]);
  /** The panels held, in the order their names are drawn. */
  readonly tabs: Signal<readonly PanelTab[]> = this.held.asReadonly();
  private readonly shown = signal(0);
  /** Which of the tabs is in front. */
  readonly activeIndex: Signal<number> = this.shown.asReadonly();
  /** The panel in front, or the frame's own when nothing was ever built into it. */
  readonly activePanel = computed<PanelService>(() => this.held()[this.shown()]?.panel ?? this.own);

  constructor(
    private readonly own: PanelService,
    private readonly frame: PanelTabsFrame
  ) {}

  /** How many panels are held. */
  count(): number {
    return this.held().length;
  }

  /** The tab holding a panel, or null for one not held here. */
  find(panel: PanelService): PanelTab | null {
    return this.held().find((tab) => tab.panel === panel) ?? null;
  }

  /** Adds a panel at the end of the row and brings it to the front; answers with its index. */
  hold(handle: PanelTabHandle): number {
    const tab: PanelTab = { ...handle, unsubscribe: this.listenTo(handle.panel) };
    this.held.update((held) => [...held, tab]);
    this.shown.set(this.held().length - 1);
    return this.shown();
  }

  /**
   * Takes a tab out of the row and stops following its panel. The front stays where it was, or
   * moves to the last of what is left when it was past the end; answers with that index.
   */
  drop(tab: PanelTab): number {
    tab.unsubscribe();
    this.held.update((held) => held.filter((entry) => entry !== tab));
    this.shown.set(Math.min(this.shown(), Math.max(0, this.held().length - 1)));
    return this.shown();
  }

  /** Moves the tab at `from` to stand at `to`; answers with where it now stands, or null for a bad `from`. */
  move(from: number, to: number): number | null {
    const moved = this.held()[from];
    if (!moved) return null;
    const rest = this.held().filter((tab) => tab !== moved);
    this.held.set([...rest.slice(0, to), moved, ...rest.slice(to)]);
    return this.held().indexOf(moved);
  }

  /** Brings the tab at `index` to the front; answers with it, or null for an index out of range. */
  select(index: number): PanelTab | null {
    const tab = this.held()[index];
    if (!tab) return null;
    this.shown.set(index);
    return tab;
  }

  /**
   * Follows what a panel asks of the frame it stands in.
   *
   * The frame's own panel is already followed from where the frame was built, so only the
   * ones folded in from elsewhere are taken up here. What a panel asks for while it is behind
   * another is not the frame's business: it would shrink or stretch around something nobody
   * is looking at.
   */
  private listenTo(panel: PanelService): () => void {
    if (panel === this.own) return () => undefined;
    const stopShrink = panel.shrinkRequest$.subscribe((shrunk) => {
      if (panel === this.activePanel()) this.frame.setShrunk(shrunk);
    });
    const stopResize = panel.resizeRequest$.subscribe((size) => {
      if (panel === this.activePanel()) this.frame.resizeTo(size);
    });
    return () => {
      stopShrink();
      stopResize();
    };
  }
}
