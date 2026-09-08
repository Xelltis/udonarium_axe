import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { RoomPanelName } from '@axe/domain/ui/room-panel';
import { PanelWindowLayerComponent } from '@axe/features/panels/panel-window-layer.component';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';

/**
 * What a panel drawn in a window of its own has to be told, on top of the app's own sheet.
 *
 * The frame belongs to the operating system now, so the panel's own — its place on the
 * table, its size, the corner it is dragged by — has nothing left to describe.
 */
const WINDOW_SHEET = `
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--ui-bg); }
  .draggable-panel {
    position: static !important;
    inset: auto !important;
    width: 100% !important;
    height: 100dvh !important;
    max-width: none !important;
    max-height: none !important;
    rotate: 0deg !important;
    border-radius: 0 !important;
    border: none !important;
  }
`;

interface OpenWindow {
  panel: RoomPanelName;
  window: Window;
  layer: ComponentRef<PanelWindowLayerComponent>;
  watchdog: ReturnType<typeof setInterval>;
}

/**
 * Panels taken out into windows of their own.
 *
 * The panel is not moved: it is closed here and opened there, into a layer belonging to that
 * window. That costs whatever the panel was holding on screen — a half-typed line, where it
 * was scrolled to — and buys the thing moving the nodes cannot: everything the panel opens
 * afterwards, a context menu or a dialogue, opens in the window the reader is looking at.
 *
 * The component itself stays in this application. Only its nodes are over there, so what it
 * is showing goes on arriving the same way it always did.
 */
@Injectable({ providedIn: 'root' })
export class PanelWindowService {
  private readonly document = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly roomPanels = inject(RoomPanelService);

  private readonly windows = new Map<RoomPanelName, OpenWindow>();

  /** Which panels are currently in windows of their own. */
  readonly detached = signal<readonly RoomPanelName[]>([]);

  constructor() {
    this.document.defaultView?.addEventListener('pagehide', () => this.closeAll());
  }

  /** Whether this browser will let a panel out at all. */
  get isSupported(): boolean {
    return typeof this.document.defaultView?.open === 'function';
  }

  isDetached(panel: RoomPanelName): boolean {
    return this.windows.has(panel);
  }

  /**
   * Opens a panel in a window of its own, closing the one on the table.
   *
   * Called from anywhere but a click this will be refused as a pop-up, which is reported
   * rather than swallowed: the reader pressed something and is owed an answer.
   */
  popOut(panel: RoomPanelName, width = 520, height = 680): boolean {
    if (this.windows.has(panel)) {
      this.windows.get(panel)!.window.focus();
      return true;
    }

    const opened = this.document.defaultView?.open(
      '',
      `axe-panel-${panel}`,
      `popup=yes,width=${width},height=${height}`
    );
    if (!opened) return false;

    this.dress(opened.document);
    AttachedDocuments.attach(opened.document);

    const layer = createComponent(PanelWindowLayerComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: opened.document.body,
    });
    this.appRef.attachView(layer.hostView);
    layer.changeDetectorRef.detectChanges();

    this.roomPanels.open(panel, { left: 0, top: 0 }, undefined, layer.instance.layer());

    const watchdog = setInterval(() => {
      if (opened.closed) this.bringBack(panel);
    }, 500);
    opened.addEventListener('pagehide', () => this.bringBack(panel));

    this.windows.set(panel, { panel, window: opened, layer, watchdog });
    this.detached.set([...this.windows.keys()]);
    return true;
  }

  /** Brings a panel back to the table, whether the reader asked or just shut the window. */
  bringBack(panel: RoomPanelName, reopen = true): void {
    const held = this.windows.get(panel);
    if (!held) return;

    this.windows.delete(panel);
    this.detached.set([...this.windows.keys()]);
    clearInterval(held.watchdog);

    AttachedDocuments.detach(held.window.document);
    held.layer.destroy();
    this.appRef.detachView(held.layer.hostView);
    if (!held.window.closed) held.window.close();

    if (reopen) this.roomPanels.open(panel);
  }

  closeAll(): void {
    for (const panel of [...this.windows.keys()]) this.bringBack(panel, false);
  }

  /**
   * Gives the new window the app's own stylesheet, and the corrections a framed panel needs.
   *
   * The theme's classes and a skin's colours are not written here: the window is announced to
   * `AttachedDocuments`, and whatever paints the document paints this one along with it.
   */
  private dress(target: Document): void {
    target.title = this.document.title;
    for (const node of this.document.querySelectorAll('link[rel="stylesheet"], style')) {
      target.head.appendChild(node.cloneNode(true));
    }
    const sheet = target.createElement('style');
    sheet.textContent = WINDOW_SHEET;
    target.head.appendChild(sheet);
  }
}
