import { InjectionToken, Type } from '@angular/core';
import type { CutInWindowComponent } from '@axe/features/media/cut-in-window/cut-in-window.component';

/** The component class of the cut-in window. */
export type CutInWindowType = Type<CutInWindowComponent>;

/**
 * Fetches the code of the cut-in window, which nothing needs at start. The specs hand in a light
 * one of their own, rather than load the window and all it brings on a worker that may be short of
 * time or memory.
 */
export const CUT_IN_WINDOW_LOADER = new InjectionToken<() => Promise<CutInWindowType>>('CUT_IN_WINDOW_LOADER', {
  providedIn: 'root',
  factory: () => () =>
    import('@axe/features/media/cut-in-window/cut-in-window.component').then((m) => m.CutInWindowComponent),
});
