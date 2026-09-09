import { ViewContainerRef } from '@angular/core';

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
 * registry is empty and every caller falls back to the layer the app started with.
 */
export class OverlayLayers {
  private static readonly windows = new Map<Document, ViewContainerRef>();

  static attach(document: Document, layer: ViewContainerRef): void {
    OverlayLayers.windows.set(document, layer);
  }

  static detach(document: Document): void {
    OverlayLayers.windows.delete(document);
  }

  /** The layer of the window being worked in, or nothing while the reader is in the main one. */
  static current(): ViewContainerRef | null {
    for (const [document, layer] of OverlayLayers.windows) {
      if (document.hasFocus?.()) return layer;
    }
    return null;
  }

  static reset(): void {
    OverlayLayers.windows.clear();
  }
}
