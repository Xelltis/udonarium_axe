import { computed, Injectable, Signal, signal } from '@angular/core';
import { defaultMenuLayout } from '@axe/domain/ui/builtin-menu-layouts';
import { MENU_SURFACES, MenuSurface } from '@axe/domain/ui/menu-command';
import { encodeMenuLayout, MenuLayout, parseMenuLayout } from '@axe/domain/ui/menu-layout';
import { MenuLayoutFile } from '@axe/domain/ui/menu-layout-file';

const STORAGE_PREFIX = 'axe.menu';

function storageKey(surface: MenuSurface): string {
  return `${STORAGE_PREFIX}.${surface}`;
}

function stored(surface: MenuSurface): MenuLayout | null {
  try {
    const held = localStorage.getItem(storageKey(surface));
    return held === null ? null : parseMenuLayout(held);
  } catch {
    // A browser set to block site data still has to run, and it draws the menus as they came.
    return null;
  }
}

/**
 * How this screen has each menu arranged.
 *
 * The arrangement belongs to the browser it was made in, as the hotbar and the rest of this seat's
 * display do, and never reaches the room or its saved file. A screen that has never been told
 * otherwise draws the way the menus came, and one that was told to empty a menu keeps it empty:
 * having said nothing and having said none are different answers, so the absence of the stored
 * value is what stands for the first.
 */
@Injectable({ providedIn: 'root' })
export class MenuLayoutService {
  private readonly held = new Map<MenuSurface, ReturnType<typeof signal<MenuLayout | null>>>();

  constructor() {
    for (const surface of MENU_SURFACES) this.held.set(surface, signal<MenuLayout | null>(stored(surface)));
  }

  /** Whether this screen has arranged the menu itself, rather than leaving it the way it came. */
  isArranged(surface: MenuSurface): boolean {
    return this.slot(surface)() !== null;
  }

  /** The menu as this screen has it, which is the way it came until somebody says otherwise. */
  layoutOf(surface: MenuSurface): Signal<MenuLayout> {
    const slot = this.slot(surface);
    return computed(() => slot() ?? defaultMenuLayout(surface));
  }

  /** Writes the menu down as it now stands. */
  save(surface: MenuSurface, layout: MenuLayout): void {
    this.slot(surface).set(layout);
    try {
      localStorage.setItem(storageKey(surface), encodeMenuLayout(layout));
    } catch {
      // The arrangement holds for this session even where it cannot be kept for the next.
    }
  }

  /**
   * Puts the menu back the way it came.
   *
   * What was stored is taken away rather than written over with the way it came, so a menu that is
   * added to in a later version gains what was added instead of standing at whatever this version
   * knew of.
   */
  reset(surface: MenuSurface): void {
    this.slot(surface).set(null);
    try {
      localStorage.removeItem(storageKey(surface));
    } catch {
      // Nothing more to do: the menu is already back the way it came for this session.
    }
  }

  /** The arrangements this screen has made, for writing out. A menu left as it came is left out. */
  arrangements(): MenuLayoutFile {
    const held: MenuLayoutFile = {};
    for (const surface of MENU_SURFACES) {
      const layout = this.slot(surface)();
      if (layout) held[surface] = layout;
    }
    return held;
  }

  /** Takes arrangements read from a file, leaving the menus the file says nothing about alone. */
  adopt(layouts: MenuLayoutFile): void {
    for (const surface of MENU_SURFACES) {
      const layout = layouts[surface];
      if (layout) this.save(surface, layout);
    }
  }

  private slot(surface: MenuSurface): ReturnType<typeof signal<MenuLayout | null>> {
    const held = this.held.get(surface);
    if (held) return held;
    const made = signal<MenuLayout | null>(stored(surface));
    this.held.set(surface, made);
    return made;
  }
}
