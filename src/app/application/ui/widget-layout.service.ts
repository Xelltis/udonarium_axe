import { Injectable } from '@angular/core';

const STORAGE_KEY = 'ui-widget-layout';

export interface WidgetSpot {
  left: number;
  top: number;
}

export type WidgetLayout = Readonly<Record<string, WidgetSpot>>;

/**
 * Reads remembered widget positions from storage text.
 *
 * An entry without a finite `left` and `top` is dropped, and text that cannot be read gives no
 * positions at all.
 */
export function parseWidgetLayout(raw: string | null): WidgetLayout {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return {};

    const layout: Record<string, WidgetSpot> = {};
    for (const [name, spot] of Object.entries(parsed)) {
      const record = spot as Record<string, unknown>;
      if (typeof record?.['left'] !== 'number' || typeof record['top'] !== 'number') continue;
      if (!Number.isFinite(record['left']) || !Number.isFinite(record['top'])) continue;
      layout[name] = { left: record['left'], top: record['top'] };
    }
    return layout;
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class WidgetLayoutService {
  private layout: Record<string, WidgetSpot> = { ...parseWidgetLayout(localStorage.getItem(STORAGE_KEY)) };

  /** Where a widget was last left, or null if it has never been moved. */
  spotOf(name: string): WidgetSpot | null {
    return this.layout[name] ?? null;
  }

  /**
   * Writes where a widget was left, rounded to whole pixels, to localStorage. A non-finite position
   * is ignored.
   */
  remember(name: string, spot: WidgetSpot): void {
    if (!Number.isFinite(spot.left) || !Number.isFinite(spot.top)) return;
    this.layout = { ...this.layout, [name]: { left: Math.round(spot.left), top: Math.round(spot.top) } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layout));
  }

  /** Forgets where a widget was left, so it goes back to its default place. */
  forget(name: string): void {
    const { [name]: _removed, ...rest } = this.layout;
    this.layout = rest;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layout));
  }

  /**
   * A position for a widget of the given size, pulled back so it stays at least 8px inside the
   * window.
   */
  keepInView(spot: WidgetSpot, width: number, height: number): WidgetSpot {
    const margin = 8;
    return {
      left: Math.max(margin, Math.min(spot.left, Math.max(margin, window.innerWidth - width - margin))),
      top: Math.max(margin, Math.min(spot.top, Math.max(margin, window.innerHeight - height - margin))),
    };
  }
}
