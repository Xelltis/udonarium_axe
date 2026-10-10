import { Injectable, signal } from '@angular/core';
import type { ReplayRetention } from '@axe/core/storage/replay-log-store';
import { ReplayDetailLevel } from '@axe/domain/replay/replay-event';

const STORAGE_KEY = 'axe-replay-preference';

/** How many recordings to keep on the device. `null` means no limit, so nothing is deleted unasked. */
export type ReplayKeepCount = number | null;

export const REPLAY_KEEP_CHOICES: readonly ReplayKeepCount[] = [null, 20, 10, 5];

export interface ReplayPreference {
  readonly detailLevel: ReplayDetailLevel;
  readonly keepCount: ReplayKeepCount;
}

export const DEFAULT_REPLAY_PREFERENCE: ReplayPreference = {
  detailLevel: ReplayDetailLevel.Notable,
  // Nothing is deleted by default; whoever recorded it decides.
  keepCount: null,
};

function isDetailLevel(value: unknown): value is ReplayDetailLevel {
  return (
    value === ReplayDetailLevel.ChatOnly || value === ReplayDetailLevel.Notable || value === ReplayDetailLevel.Full
  );
}

function isKeepCount(value: unknown): value is ReplayKeepCount {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}

/**
 * Reads stored replay settings, taking the default for anything missing or invalid and for text
 * that does not parse.
 */
export function parseReplayPreference(raw: string | null): ReplayPreference {
  if (!raw) return DEFAULT_REPLAY_PREFERENCE;
  try {
    const parsed = JSON.parse(raw) as Partial<ReplayPreference>;
    return {
      detailLevel: isDetailLevel(parsed?.detailLevel) ? parsed.detailLevel : DEFAULT_REPLAY_PREFERENCE.detailLevel,
      keepCount: isKeepCount(parsed?.keepCount) ? parsed.keepCount : DEFAULT_REPLAY_PREFERENCE.keepCount,
    };
  } catch {
    return DEFAULT_REPLAY_PREFERENCE;
  }
}

@Injectable({ providedIn: 'root' })
export class ReplayPreferenceService {
  private readonly restored = parseReplayPreference(localStorage.getItem(STORAGE_KEY));

  readonly detailLevel = signal<ReplayDetailLevel>(this.restored.detailLevel);
  readonly keepCount = signal<ReplayKeepCount>(this.restored.keepCount);

  /** What gets deleted, decided by count alone rather than by size, which the browser watches. */
  get retention(): ReplayRetention {
    return { maxCount: this.keepCount(), maxTotalBytes: null };
  }

  /** Sets how much of what happens a recording keeps, remembered in this browser. */
  setDetailLevel(level: ReplayDetailLevel): void {
    this.detailLevel.set(level);
    this.persist();
  }

  /** Sets how many recordings this browser keeps, where null keeps them all, and remembers the choice here. */
  setKeepCount(count: ReplayKeepCount): void {
    this.keepCount.set(count);
    this.persist();
  }

  private persist(): void {
    const state: ReplayPreference = { detailLevel: this.detailLevel(), keepCount: this.keepCount() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}
