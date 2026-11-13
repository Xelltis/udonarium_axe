import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { clamp } from '@axe/core/util/clamp';

@Injectable({ providedIn: 'root' })
export class PanelTransparencyService {
  private readonly byKind = signal<Record<string, number>>(storedByKind());

  /**
   * How transparent panels of one kind are drawn, from 0 to 100. Zero for a kind nobody has set.
   */
  valueOf(kind: string): number {
    return this.byKind()[kind] ?? 0;
  }

  /**
   * Sets the transparency for one kind of panel, rounded and clamped to 0-100, and remembers it in
   * this browser. A non-finite value is ignored.
   */
  set(kind: string, value: number): void {
    if (!Number.isFinite(value)) return;
    const held = clamp(Math.round(value), 0, 100);
    this.byKind.update((byKind) => ({ ...byKind, [kind]: held }));
    writeLocal(STORAGE_KEYS.panelTransparency, JSON.stringify(this.byKind()));
  }
}

function storedByKind(): Record<string, number> {
  try {
    const stored = readLocal(STORAGE_KEYS.panelTransparency);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (parsed === null || typeof parsed !== 'object') return {};
    const held: Record<string, number> = {};
    for (const [kind, value] of Object.entries(parsed as Record<string, unknown>)) {
      const number = Number(value);
      if (Number.isFinite(number)) held[kind] = clamp(Math.round(number), 0, 100);
    }
    return held;
  } catch {
    return {};
  }
}
