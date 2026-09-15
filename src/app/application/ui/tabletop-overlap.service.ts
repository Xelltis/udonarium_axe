import { inject, Injectable } from '@angular/core';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface TabletopOverlapRegistryEntry {
  object: TabletopObject;
  element: HTMLElement;
}

@Injectable({
  providedIn: 'root',
})
export class TabletopOverlapService {
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly registry = new Map<string, TabletopOverlapRegistryEntry>();

  /** Records the element a tabletop piece is drawn in, so the pieces under a point can be found. */
  register(object: TabletopObject, element: HTMLElement) {
    if (!object) return;
    this.registry.set(object.identifier, { object, element });
  }

  /** Forgets a piece's element once its component is gone. */
  unregister(identifier: string) {
    this.registry.delete(identifier);
  }

  /** Every registered piece with the element it is drawn in. */
  entries(): TabletopOverlapRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /** The registered piece and element for an identifier, or undefined when none is registered. */
  get(identifier: string): TabletopOverlapRegistryEntry | undefined {
    return this.registry.get(identifier);
  }

  /**
   * The registered pieces whose elements lie under a point, in registration order rather than
   * stacking order. Empty for a non-finite point.
   */
  findAt(x: number, y: number): TabletopObject[] {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];

    const hits = document.elementsFromPoint(x, y);
    if (hits.length === 0) return [];

    const result: TabletopObject[] = [];
    for (const entry of this.registry.values()) {
      for (const hit of hits) {
        if (entry.element.contains(hit)) {
          result.push(entry.object);
          break;
        }
      }
    }
    return result;
  }

  /**
   * Opens the context menu of a piece at a point, as though it had been right-clicked there.
   *
   * The event is dispatched on the next task, so the menu it was chosen from can close first. Does
   * nothing if the piece is no longer registered by then.
   */
  reopenContextMenuFor(identifier: string, x: number, y: number) {
    const entry = this.registry.get(identifier);
    if (!entry) return;
    setTimeout(() => {
      const current = this.registry.get(identifier);
      if (!current) return;
      this.pointerDeviceService.primeForContextMenu(x, y);
      const ev = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: x - window.scrollX,
        clientY: y - window.scrollY,
        button: 2,
      });
      current.element.dispatchEvent(ev);
    }, 0);
  }
}
