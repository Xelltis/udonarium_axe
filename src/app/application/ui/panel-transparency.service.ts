import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

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
    const held = Math.min(100, Math.max(0, Math.round(value)));
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
      if (Number.isFinite(number)) held[kind] = Math.min(100, Math.max(0, Math.round(number)));
    }
    return held;
  } catch {
    return {};
  }
}
