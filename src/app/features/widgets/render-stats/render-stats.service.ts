import { Injectable, signal } from '@angular/core';
import { perfCounters, perfTimed } from '@axe/core/util/perf-counters';

const SAMPLE_INTERVAL_MS = 1000;
const FRAME_RING = 180;
const SLOW_FRAME_MS = 50;
const TEMPLATE_UPDATE_START = 2;

type WatchedComponent = 'TerrainComponent' | 'GameTableComponent';

export interface RenderStats {
  /** Terrain drawn as a box of its own. */
  readonly terrains: number;
  /** Terrain drawn together with the blocks around it. */
  readonly mergedTerrains: number;
  /** The surfaces the terrain drawn together is drawn as. */
  readonly mergedFaces: number;
  readonly terrainCanvases: number;
  readonly tableElements: number;
  readonly elementsPerTerrain: number;
  readonly updates: Readonly<Record<WatchedComponent, number>>;
  readonly counters: ReadonlyMap<string, number>;
  readonly frameLast: number;
  readonly frameP50: number;
  readonly frameP95: number;
  readonly frameMax: number;
  readonly slowFrames: number;
  readonly longTasks: number;
  readonly longTaskMs: number;
  readonly longTasksAvailable: boolean;
  readonly profilerAvailable: boolean;
}

const EMPTY_STATS: RenderStats = {
  terrains: 0,
  mergedTerrains: 0,
  mergedFaces: 0,
  terrainCanvases: 0,
  tableElements: 0,
  elementsPerTerrain: 0,
  updates: { TerrainComponent: 0, GameTableComponent: 0 },
  counters: new Map(),
  frameLast: 0,
  frameP50: 0,
  frameP95: 0,
  frameMax: 0,
  slowFrames: 0,
  longTasks: 0,
  longTaskMs: 0,
  longTasksAvailable: false,
  profilerAvailable: false,
};

interface AngularDebugGlobal {
  ɵsetProfiler?(profiler: ((event: number, instance?: object | null) => void) | null): () => void;
}

function debugGlobal(): AngularDebugGlobal | undefined {
  return (globalThis as { ng?: AngularDebugGlobal }).ng;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length < 1) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

@Injectable({ providedIn: 'root' })
export class RenderStatsService {
  readonly watching = signal(false);
  readonly stats = signal<RenderStats>(EMPTY_STATS);
  readonly totals = signal<ReadonlyMap<string, number>>(new Map());

  private frames: number[] = [];
  private lastFrameAt = 0;
  private rafHandle: number | null = null;
  private sampleHandle: ReturnType<typeof setInterval> | null = null;
  private stopProfiler: (() => void) | null = null;
  private longTaskObserver: PerformanceObserver | null = null;
  private longTasks = 0;
  private longTaskMs = 0;
  private updates: Record<WatchedComponent, number> = { TerrainComponent: 0, GameTableComponent: 0 };
  private readonly accumulated = new Map<string, number>();

  /**
   * Starts sampling render statistics for the render stats widget, and switches the shared perf
   * counters on.
   *
   * Frame times and long tasks are gathered continuously and published to `stats` and `totals` once
   * a second. Template updates are only counted where Angular's debug profiler hook is present.
   * Does nothing while already watching.
   */
  start(): void {
    if (this.watching()) return;
    this.watching.set(true);
    perfCounters.enabled = true;
    perfCounters.clear();
    this.reset();
    this.installProfiler();
    this.installLongTaskObserver();
    this.lastFrameAt = performance.now();
    this.rafHandle = requestAnimationFrame((now) => this.onFrame(now));
    this.sampleHandle = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
  }

  /**
   * Stops sampling, switches the perf counters off and empties the published stats. Does nothing
   * when not watching.
   */
  stop(): void {
    if (!this.watching()) return;
    this.watching.set(false);
    perfCounters.enabled = false;
    perfCounters.clear();
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    if (this.sampleHandle !== null) clearInterval(this.sampleHandle);
    this.stopProfiler?.();
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.rafHandle = null;
    this.sampleHandle = null;
    this.stopProfiler = null;
    this.accumulated.clear();
    this.stats.set(EMPTY_STATS);
    this.totals.set(new Map());
  }

  /** Clears the frame history, counters and running totals without stopping the sampling. */
  reset(): void {
    this.frames = [];
    this.updates = { TerrainComponent: 0, GameTableComponent: 0 };
    this.longTasks = 0;
    this.longTaskMs = 0;
    this.accumulated.clear();
    this.totals.set(new Map());
    perfCounters.clear();
  }

  private installLongTaskObserver(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    this.longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.longTasks++;
        this.longTaskMs += entry.duration;
      }
    });
    this.longTaskObserver.observe({ entryTypes: ['longtask'] });
  }

  private installProfiler(): void {
    const setProfiler = debugGlobal()?.ɵsetProfiler;
    if (!setProfiler) return;
    this.stopProfiler = setProfiler((event, instance) => {
      if (event !== TEMPLATE_UPDATE_START) return;
      const name = instance?.constructor?.name;
      if (name === 'TerrainComponent' || name === 'GameTableComponent') this.updates[name]++;
    });
  }

  private onFrame(now: number): void {
    if (!this.watching()) return;
    perfTimed('layoutFlush', () => document.body.offsetHeight);
    this.frames.push(now - this.lastFrameAt);
    if (this.frames.length > FRAME_RING) this.frames.shift();
    this.lastFrameAt = now;
    this.rafHandle = requestAnimationFrame((next) => this.onFrame(next));
  }

  private sample(): void {
    const terrains = document.querySelectorAll('terrain').length;
    const merged = document.querySelector('terrain-batch-layer');
    const mergedTerrains = Number(merged?.getAttribute('data-merged') ?? 0) || 0;
    const mergedFaces = merged ? merged.children.length : 0;
    const terrainCanvases = document.querySelectorAll('terrain canvas').length;
    const table = document.getElementById('app-game-table');
    const tableElements = table ? table.querySelectorAll('*').length : 0;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const counters = perfCounters.drain();
    for (const [key, count] of counters) {
      this.accumulated.set(key, (this.accumulated.get(key) ?? 0) + count);
    }

    this.stats.set({
      terrains,
      mergedTerrains,
      mergedFaces,
      terrainCanvases,
      tableElements,
      elementsPerTerrain: terrains + mergedTerrains > 0 ? tableElements / (terrains + mergedTerrains) : 0,
      updates: { ...this.updates },
      counters,
      frameLast: this.frames.at(-1) ?? 0,
      frameP50: percentile(sorted, 0.5),
      frameP95: percentile(sorted, 0.95),
      frameMax: sorted.at(-1) ?? 0,
      slowFrames: this.frames.filter((ms) => ms > SLOW_FRAME_MS).length,
      longTasks: this.longTasks,
      longTaskMs: this.longTaskMs,
      longTasksAvailable: this.longTaskObserver !== null,
      profilerAvailable: this.stopProfiler !== null,
    });
    this.totals.set(new Map(this.accumulated));
    this.updates = { TerrainComponent: 0, GameTableComponent: 0 };
    this.longTasks = 0;
    this.longTaskMs = 0;
  }
}
