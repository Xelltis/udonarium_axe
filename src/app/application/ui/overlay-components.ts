import { InjectionToken, Type, ViewContainerRef } from '@angular/core';
import type { PanelFrame } from '@axe/application/ui/panel.service';

/**
 * The components the overlay services put on screen.
 *
 * They are drawn by the ui and feature layers, which this layer may not import, so the app hands
 * each one in as it starts. A frame is looked up from the injector of the layer it is drawn into,
 * so whatever holds a layer can say what is drawn in it. Until something hands one in, each token
 * answers null and the service opens nothing, or falls back the way its own description says.
 */

/** A frame whose content goes into the container it names. */
export interface ContentFrame {
  content(): ViewContainerRef;
}

/** The frame every panel stands in. */
export const PANEL_FRAME_COMPONENT = new InjectionToken<Type<PanelFrame> | null>('PANEL_FRAME_COMPONENT', {
  providedIn: 'root',
  factory: () => null,
});

/** The portraits a chat panel shows over its log. */
export const CHAT_PORTRAIT_COMPONENT = new InjectionToken<Type<unknown> | null>('CHAT_PORTRAIT_COMPONENT', {
  providedIn: 'root',
  factory: () => null,
});

/** The pictures a card stack's panel shows of the cards in it. */
export const CARD_STACK_LIST_COMPONENT = new InjectionToken<Type<unknown> | null>('CARD_STACK_LIST_COMPONENT', {
  providedIn: 'root',
  factory: () => null,
});

/** The frame a modal dialogue stands in. */
export const MODAL_FRAME_COMPONENT = new InjectionToken<Type<ContentFrame> | null>('MODAL_FRAME_COMPONENT', {
  providedIn: 'root',
  factory: () => null,
});

/** The plain context menu. */
export const CONTEXT_MENU_COMPONENT = new InjectionToken<Type<unknown> | null>('CONTEXT_MENU_COMPONENT', {
  providedIn: 'root',
  factory: () => null,
});

/** Fetches the four-way radial menu, which is only ever wanted on a table seen from above. */
export const FOUR_WAY_RADIAL_MENU_LOADER = new InjectionToken<(() => Promise<Type<unknown>>) | null>(
  'FOUR_WAY_RADIAL_MENU_LOADER',
  { providedIn: 'root', factory: () => null }
);

/** The frame a bottom sheet rises in. */
export const BOTTOM_SHEET_FRAME_COMPONENT = new InjectionToken<Type<ContentFrame> | null>(
  'BOTTOM_SHEET_FRAME_COMPONENT',
  { providedIn: 'root', factory: () => null }
);

/** The yes-or-no dialogue. */
export const CONFIRM_DIALOG_COMPONENT = new InjectionToken<Type<unknown> | null>('CONFIRM_DIALOG_COMPONENT', {
  providedIn: 'root',
  factory: () => null,
});

/**
 * Told when the code of something opened lazily cannot be fetched, which after a release means the
 * page wants reloading. The app hands in its notice; until then nobody is told.
 */
export const LOAD_FAILURE_NOTICE = new InjectionToken<() => void>('LOAD_FAILURE_NOTICE', {
  providedIn: 'root',
  factory: () => () => {},
});
