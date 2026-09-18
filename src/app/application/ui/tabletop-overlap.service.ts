import { inject, Injectable } from '@angular/core';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

export interface TabletopOverlapRegistryEntry {
  readonly object: TabletopObject;
  /** The element the piece is drawn in, or null for a piece drawn together with others in none of its own. */
  readonly element: HTMLElement | null;
  /** Opens the right-click menu of a piece with no element to right-click, at the pointer. */
  readonly openMenu?: () => void;
}

/**
 * Tells which of the pieces something draws lie under a point on the screen, given the elements
 * the browser reports there, topmost first.
 */
export type OverlapHitSource = (hits: readonly Element[], x: number, y: number) => readonly TabletopObject[];

/**
 * How much of its surface a registered piece covers, in pixels.
 *
 * A terrain is laid out from its own size, so the numbers are already known, and asking an
 * element for them makes the browser lay the page out to answer. Anything else is as big as the
 * element it is drawn in, and nothing at all without one.
 */
export function footprintOf(
  entry: TabletopOverlapRegistryEntry,
  gridSizePx: number
): { width: number; height: number } {
  const obj = entry.object;
  if (obj instanceof Terrain) {
    return { width: Math.max(0, obj.width) * gridSizePx, height: Math.max(0, obj.depth) * gridSizePx };
  }
  return { width: entry.element?.offsetWidth ?? 0, height: entry.element?.offsetHeight ?? 0 };
}

@Injectable({
  providedIn: 'root',
})
export class TabletopOverlapService {
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly registry = new Map<string, TabletopOverlapRegistryEntry>();
  private readonly hitSources = new Set<OverlapHitSource>();

  /** Records the element a tabletop piece is drawn in, so the pieces under a point can be found. */
  register(object: TabletopObject, element: HTMLElement) {
    if (!object) return;
    this.registry.set(object.identifier, { object, element });
  }

  /**
   * Records a piece drawn together with others, in no element of its own.
   *
   * It is found under a point through the {@link OverlapHitSource} of whatever draws it, and
   * `openMenu` opens its right-click menu when it is picked out of the pieces under a point.
   */
  registerWithoutElement(object: TabletopObject, openMenu: () => void) {
    if (!object) return;
    this.registry.set(object.identifier, { object, element: null, openMenu });
  }

  /** Asks this, too, which pieces lie under a point. */
  addHitSource(source: OverlapHitSource) {
    this.hitSources.add(source);
  }

  /** Stops asking this which pieces lie under a point. */
  removeHitSource(source: OverlapHitSource) {
    this.hitSources.delete(source);
  }

  /**
   * Forgets a piece once whatever drew it is gone.
   *
   * Given the element it was drawn in, it forgets the piece only while that is still the element
   * on record: the piece may already be drawn some other way, and recorded as such.
   */
  unregister(identifier: string, element?: HTMLElement | null) {
    if (element !== undefined && this.registry.get(identifier)?.element !== element) return;
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
   * The registered pieces that lie under a point, in registration order rather than stacking
   * order, and after them those drawn without an element of their own. Empty for a non-finite
   * point.
   */
  findAt(x: number, y: number): TabletopObject[] {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];

    const hits = document.elementsFromPoint(x, y);
    if (hits.length === 0) return [];

    const result: TabletopObject[] = [];
    for (const entry of this.registry.values()) {
      const element = entry.element;
      if (!element) continue;
      for (const hit of hits) {
        if (element.contains(hit)) {
          result.push(entry.object);
          break;
        }
      }
    }
    for (const source of this.hitSources) {
      for (const object of source(hits, x, y)) {
        if (this.registry.get(object.identifier)?.element === null && !result.includes(object)) result.push(object);
      }
    }
    return result;
  }

  /**
   * Opens the context menu of a piece at a point, as though it had been right-clicked there.
   *
   * The menu is opened on the next task, so the menu it was chosen from can close first. Does
   * nothing if the piece is no longer registered by then.
   */
  reopenContextMenuFor(identifier: string, x: number, y: number) {
    const entry = this.registry.get(identifier);
    if (!entry) return;
    setTimeout(() => {
      const current = this.registry.get(identifier);
      if (!current) return;
      this.pointerDeviceService.primeForContextMenu(x, y);
      if (!current.element) {
        current.openMenu?.();
        return;
      }
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
