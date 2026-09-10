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
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { PanelFrame, PanelService } from '@axe/application/ui/panel.service';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { PanelWindowLayerComponent } from '@axe/features/panels/panel-window-layer.component';

/**
 * What a panel drawn in a window of its own has to be told, on top of the app's own sheet.
 *
 * The frame belongs to the operating system now, so the panel's own — its place on the
 * table, its size, the corner it is dragged by, the button that shuts it — has nothing left
 * to describe, and a second set of window controls inside a window is only confusing. What
 * the panel's content put in the bar is left alone: those work on what it is showing, not on
 * the frame, and are the same use here as anywhere.
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
  /**
   * Called while the window is still standing, for panels that moved rather than reopened.
   *
   * A moved panel is the same view over there, so it has to be brought home before the
   * window's layer is taken down, or it goes down with it. Given one, `restore` is not used.
   */
  leaving?: () => void;
}

interface OpenWindow {
  request: PanelWindowRequest;
  window: Window;
  /** Held rather than read back off the window, which gives up its document once it is closed. */
  document: Document;
  layer: ComponentRef<PanelWindowLayerComponent>;
  watchdog: ReturnType<typeof setInterval>;
  /** Set once the panel has arrived, so an empty layer afterwards means the panel has gone. */
  arrived: boolean;
}

/**
 * Panels taken out into windows of their own.
 *
 * The panel is not moved: it is closed here and opened there, into a layer belonging to that
 * window. That costs whatever the panel was holding on screen — a half-typed line, where it
 * was scrolled to — and buys the thing moving the nodes cannot: the panel goes on being the
 * same component, told about the same room, without a copy of the application behind it.
 *
 * The component itself stays in this application. Only its nodes are over there, so what it
 * is showing goes on arriving the same way it always did. How a panel is opened is not known
 * here — the caller brings that, which is how a panel belonging to one piece on the table can
 * be taken out as readily as one belonging to the room.
 *
 * The window's layer is offered to `OverlayLayers` as well, so a menu, a dialogue or a
 * tooltip opened from the panel appears in the window the reader is looking at.
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

    const target = opened.document;
    this.dress(target);
    AttachedDocuments.attach(target);

    const layer = createComponent(PanelWindowLayerComponent, {
      environmentInjector: this.environmentInjector,
      hostElement: target.body,
    });
    this.appRef.attachView(layer.hostView);
    layer.changeDetectorRef.detectChanges();
    OverlayLayers.attach(target, layer.instance.layer());
    request.open(layer.instance.layer());

    const watchdog = setInterval(() => this.look(request.key), 500);
    opened.addEventListener('pagehide', () => this.bringBack(request.key));

    this.windows.set(request.key, { request, window: opened, document: target, layer, watchdog, arrived: false });
    this.detached.set([...this.windows.keys()]);
    return true;
  }

  /**
   * Takes a whole group of panels out into one window, and brings them back as one.
   *
   * The panels are not opened again over there: their views are moved into a frame belonging
   * to that window, so a half-typed line and the place a log was read to go with them, and
   * come home the same way when the window is shut.
   */
  popOutGroup(frame: PanelFrame, panels: PanelService): boolean {
    let abroad: PanelFrame | null = null;
    const box = frame.frameSize();
    const home = { ...frame.framePlace(), ...box };
    return this.popOut({
      key: `group:${frame.frameKey}`,
      width: box.width,
      height: box.height,
      open: (host) => {
        abroad = panels.openFrame(undefined, host);
        for (const handoff of frame.handOverAll()) {
          handoff.panel.windowed.set(true);
          abroad.takeIn(handoff);
        }
        frame.dismissFrame();
      },
      leaving: () => {
        const gone = abroad;
        if (!gone) return;
        const back = panels.openFrame(home);
        for (const handoff of gone.handOverAll()) {
          handoff.panel.windowed.set(false);
          back.takeIn(handoff);
        }
        gone.dismissFrame();
      },
      restore: () => undefined,
    });
  }

  /**
   * Notices a window shut from outside, and a panel that closed itself while in one.
   *
   * A panel can go without the window going: a piece deleted takes its sheet with it, and a
   * panel that only one of may stand is closed when its name is asked for again. What is left
   * is an empty window, and putting the panel back when that is shut would open it over the
   * very thing it was closed for.
   */
  private look(key: string): void {
    const held = this.windows.get(key);
    if (!held) return;
    if (held.window.closed) {
      this.bringBack(key);
      return;
    }
    if (this.holds(held)) held.arrived = true;
    else if (held.arrived) this.bringBack(key, false);
  }

  private holds(held: OpenWindow): boolean {
    return held.layer.instance.layer().length > 0;
  }

  /** Brings a panel back to the table, whether the reader asked or just shut the window. */
  bringBack(key: string, restore = true): void {
    const held = this.windows.get(key);
    if (!held) return;

    const wentOnItsOwn = held.arrived && !this.holds(held);
    const comingHome = restore && !wentOnItsOwn;

    this.windows.delete(key);
    this.detached.set([...this.windows.keys()]);
    clearInterval(held.watchdog);

    if (comingHome && held.request.leaving) held.request.leaving();
    AttachedDocuments.detach(held.document);
    OverlayLayers.detach(held.document);
    held.layer.destroy();
    this.appRef.detachView(held.layer.hostView);
    if (!held.window.closed) held.window.close();

    if (comingHome && !held.request.leaving) held.request.restore();
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
