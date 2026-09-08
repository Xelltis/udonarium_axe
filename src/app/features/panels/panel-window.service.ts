import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  inject,
  Injectable,
  signal,
  ViewContainerRef,
} from '@angular/core';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { PanelWindowLayerComponent } from '@axe/features/panels/panel-window-layer.component';

/**
 * What a panel drawn in a window of its own has to be told, on top of the app's own sheet.
 *
 * The frame belongs to the operating system now, so the panel's own — its place on the
 * table, its size, the corner it is dragged by, the button that shuts it — has nothing left
 * to describe, and a second set of window controls inside a window is only confusing.
 */
const WINDOW_SHEET = `
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--ui-bg); }
  [data-panel-frame-controls] { display: none !important; }
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

/** How to put one panel in a window, and how to put it back. */
export interface PanelWindowRequest {
  /** What tells this panel from every other one out there. */
  key: string;
  width?: number;
  height?: number;
  /** Draws the panel into the layer belonging to the new window. */
  open: (host: ViewContainerRef) => void;
  /** Draws it on the table again, once the window has gone. */
  restore: () => void;
}

interface OpenWindow {
  request: PanelWindowRequest;
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
 * is showing goes on arriving the same way it always did. How a panel is opened is not known
 * here — the caller brings that, which is how a panel belonging to one piece on the table can
 * be taken out as readily as one belonging to the room.
 */
@Injectable({ providedIn: 'root' })
export class PanelWindowService {
  private readonly document = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);

  private readonly windows = new Map<string, OpenWindow>();

  /** Which panels are currently in windows of their own. */
  readonly detached = signal<readonly string[]>([]);

  constructor() {
    this.document.defaultView?.addEventListener('pagehide', () => this.closeAll());
  }

  /** Whether this browser will let a panel out at all. */
  get isSupported(): boolean {
    return typeof this.document.defaultView?.open === 'function';
  }

  isDetached(key: string): boolean {
    return this.windows.has(key);
  }

  /**
   * Opens a panel in a window of its own.
   *
   * Called from anywhere but a click this will be refused as a pop-up, which is answered
   * with `false` rather than swallowed: the reader pressed something and is owed an answer,
   * and the caller still has the panel it was about to close.
   */
  popOut(request: PanelWindowRequest): boolean {
    const already = this.windows.get(request.key);
    if (already) {
      already.window.focus();
      return true;
    }

    const features = `popup=yes,width=${request.width ?? 520},height=${request.height ?? 680}`;
    const opened = this.document.defaultView?.open('', `axe-panel-${request.key}`, features);
    if (!opened) return false;

    this.dress(opened.document);
    AttachedDocuments.attach(opened.document);

    const layer = createComponent(PanelWindowLayerComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: opened.document.body,
    });
    this.appRef.attachView(layer.hostView);
    layer.changeDetectorRef.detectChanges();
    request.open(layer.instance.layer());

    const watchdog = setInterval(() => {
      if (opened.closed) this.bringBack(request.key);
    }, 500);
    opened.addEventListener('pagehide', () => this.bringBack(request.key));

    this.windows.set(request.key, { request, window: opened, layer, watchdog });
    this.detached.set([...this.windows.keys()]);
    return true;
  }

  /** Brings a panel back to the table, whether the reader asked or just shut the window. */
  bringBack(key: string, restore = true): void {
    const held = this.windows.get(key);
    if (!held) return;

    this.windows.delete(key);
    this.detached.set([...this.windows.keys()]);
    clearInterval(held.watchdog);

    AttachedDocuments.detach(held.window.document);
    held.layer.destroy();
    this.appRef.detachView(held.layer.hostView);
    if (!held.window.closed) held.window.close();

    if (restore) held.request.restore();
  }

  closeAll(): void {
    for (const key of [...this.windows.keys()]) this.bringBack(key, false);
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
