import { Injectable, ViewContainerRef } from '@angular/core';

/**
 * Where a menu, a dialogue or a tooltip is drawn, for a reader looking at more than one window.
 *
 * These are created into a layer belonging to a document, and until a panel is taken out into
 * a window of its own there is only one document to choose. Afterwards there are several, and
 * the one to draw into is the one the reader is working in — a menu opened by a right-click in
 * a detached panel that appears back in the main window has, from where they are sitting,
 * simply not opened.
 *
 * The window in front is the one whose document has the focus. While nothing has left, the
 * registry is empty and every caller falls back to the main layer the app hands over as it starts.
 */
@Injectable({ providedIn: 'root' })
export class OverlayLayers {
  private readonly windows = new Map<Document, ViewContainerRef>();

  /** The layer of the main window, handed over once the app's shell is drawn; null before. */
  main: ViewContainerRef | null = null;

  /**
   * Registers a detached window's overlay layer, so menus and dialogs opened while it has the focus
   * appear there.
   */
  attach(document: Document, layer: ViewContainerRef): void {
    this.windows.set(document, layer);
  }

  /** Forgets a detached window's layer once the window closes. */
  detach(document: Document): void {
    this.windows.delete(document);
  }

  /** The layer of the window being worked in, or nothing while the reader is in the main one. */
  current(): ViewContainerRef | null {
    for (const [document, layer] of this.windows) {
      if (document.hasFocus?.()) return layer;
    }
    return null;
  }

  /**
   * The layer of the window a document belongs to, or nothing for the main window.
   *
   * Asked by something that knows where it is standing, which is surer than asking which
   * window has the focus: a panel opened from a panel in a window belongs in that window
   * however the focus has moved since.
   */
  layerFor(document: Document | null | undefined): ViewContainerRef | null {
    return document ? (this.windows.get(document) ?? null) : null;
  }

  /** The layer of the window being worked in, and the main one while the reader is there. */
  front(): ViewContainerRef {
    return this.current() ?? this.mainLayer();
  }

  /**
   * The main window's layer, for an opener that has been given nowhere else to go.
   *
   * Throws before the app has handed it over, as there is nowhere yet to draw anything.
   */
  mainLayer(): ViewContainerRef {
    if (!this.main) throw new Error('[OverlayLayers] the main layer has not been handed over yet');
    return this.main;
  }
}
