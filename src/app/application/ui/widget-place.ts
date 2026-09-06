import type { WidgetLayoutService } from '@axe/application/ui/widget-layout.service';

export const WIDGET_CLOCK = 'clock';
export const WIDGET_CONNECTION_QUALITY = 'connectionQuality';
export const WIDGET_VOTE = 'vote';
export const WIDGET_RENDER_STATS = 'renderStats';
export const WIDGET_HOTBAR = 'hotbar';
export const WIDGET_ROOM_RESTORE = 'roomRestore';
export const WIDGET_FAB = 'fab';

export function placeWidget(
  layout: WidgetLayoutService,
  name: string,
  element: HTMLElement,
  fallback: () => { left: number; top: number }
): void {
  const remembered = layout.spotOf(name);
  const spot = layout.keepInView(remembered ?? fallback(), element.offsetWidth, element.offsetHeight);
  element.style.left = `${spot.left}px`;
  element.style.top = `${spot.top}px`;
}

export function rememberWidget(layout: WidgetLayoutService, name: string, element: HTMLElement): void {
  const left = pixelsOf(element.style.left);
  const top = pixelsOf(element.style.top);
  if (left !== null && top !== null) {
    layout.remember(name, { left, top });
    return;
  }

  const bounds = element.getBoundingClientRect();
  if (bounds.width < 1 && bounds.height < 1) return;
  layout.remember(name, { left: bounds.left, top: bounds.top });
}

function pixelsOf(value: string): number | null {
  if (!value.endsWith('px')) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
