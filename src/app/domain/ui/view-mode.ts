/** How this reader is looking at the table: as the table asks, along it, or straight down on it. */
export const VIEW_MODES = ['auto', 'perspective', 'flat'] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/** Until a reader says otherwise, the table is looked at the way the table recommends. */
export const DEFAULT_VIEW_MODE: ViewMode = 'auto';

export function asViewMode(value: unknown): ViewMode | null {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value) ? (value as ViewMode) : null;
}

/** What the reader gets next from the one control that carries all three. */
export function nextViewMode(mode: ViewMode): ViewMode {
  const order = VIEW_MODES;
  return order[(order.indexOf(mode) + 1) % order.length];
}

/** Whether the table is seen from straight above, once the table has had its say. */
export function laysFlat(mode: ViewMode, recommendsFlat: boolean): boolean {
  return mode === 'auto' ? recommendsFlat : mode === 'flat';
}

/** What the one control says it is doing, which has to name the view auto settled on. */
export function viewModeLabelKey(mode: ViewMode, laysFlatNow: boolean): string {
  if (mode === 'flat') return 'app.fab.viewFlat';
  if (mode === 'perspective') return 'app.fab.viewPerspective';
  return laysFlatNow ? 'app.fab.viewAutoFlat' : 'app.fab.viewAutoPerspective';
}

export function viewModeIcon(mode: ViewMode, laysFlatNow: boolean): string {
  if (mode === 'auto') return 'hdr_auto';
  return laysFlatNow ? 'grid_view' : 'view_in_ar';
}
