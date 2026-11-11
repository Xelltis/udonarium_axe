import { inject, Injectable, signal } from '@angular/core';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { GroundBrushKind, GroundDab } from '@axe/domain/tabletop/ground/ground-brush';
import {
  GROUND_CHUNK_SAMPLE_COUNT,
  GroundChunkData,
  GroundPaintLayer,
} from '@axe/domain/tabletop/ground/ground-chunk-data';
import { ensureGroundFieldOn, groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';

/** How a stroke of the brush is laid: what it does, how wide, how hard, and what it paints or levels to. */
export interface GroundBrushSettings {
  readonly kind: GroundBrushKind;
  /** How far the brush reaches from its middle, in cells. */
  readonly radius: number;
  /** How hard each dab presses: up to a cell for raising and lowering, a share for the rest. */
  readonly strength: number;
  readonly layer: GroundPaintLayer;
}

/** How many strokes can be taken back, oldest dropped first. */
const UNDO_DEPTH = 30;

/**
 * The brush the master raises, lowers, smooths, flattens and paints the ground of the table in view
 * with, a stroke at a time: a stroke is the dabs laid from a press to its letting go. Each stroke can
 * be taken back, on this seat, the ground going back to what it was before it.
 */
@Injectable({ providedIn: 'root' })
export class GroundBrushService {
  private readonly ground = inject(GroundService);
  private readonly tabletop = inject(TabletopService);

  /** Whether presses on the table lay the brush rather than doing what they otherwise do. */
  readonly active = signal(false);
  readonly settings = signal<GroundBrushSettings>({ kind: 'raise', radius: 2, strength: 0.25, layer: 'grass' });
  /** How many strokes can be taken back now. */
  readonly undoable = signal(0);

  private stroke: { level: number; before: Map<string, GroundChunkData | null> } | null = null;
  private readonly strokes: Map<string, GroundChunkData | null>[] = [];

  /** Starts a stroke at a point of the board, in cells, laying its first dab there. */
  begin(x: number, y: number): void {
    this.stroke = { level: this.ground.surface().heightAt(x, y), before: new Map() };
    this.dab(x, y);
  }

  /** Lays a dab of the stroke under way at a point of the board, in cells. */
  dab(x: number, y: number): void {
    const stroke = this.stroke;
    const table = this.tabletop.currentTable;
    if (!stroke || !table.identifier) return;
    const { kind, radius, strength, layer } = this.settings();
    const dab: GroundDab = { kind, x, y, radius, strength, layer, level: stroke.level };
    const field = groundFieldOn(table);
    const kept = new Map((field?.readChunks() ?? []).map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk]));
    for (const chunk of this.ground.dab(dab)) {
      const key = `${chunk.cx},${chunk.cy}`;
      if (!stroke.before.has(key)) stroke.before.set(key, kept.get(key) ?? null);
    }
  }

  /** Ends the stroke under way, keeping it to be taken back. */
  end(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke || stroke.before.size < 1) return;
    this.strokes.push(stroke.before);
    if (this.strokes.length > UNDO_DEPTH) this.strokes.shift();
    this.undoable.set(this.strokes.length);
  }

  /** Takes back the stroke under way as though it had not been laid, leaving nothing more to take back. */
  cancel(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (stroke) this.restore(stroke.before);
  }

  /** Takes the last stroke back: every chunk it changed goes back to what it was, flat where it was not kept. */
  undo(): void {
    const before = this.strokes.pop();
    this.undoable.set(this.strokes.length);
    if (before) this.restore(before);
  }

  /** Puts the chunks a stroke changed back as they were, flat where they were not kept. */
  private restore(before: Map<string, GroundChunkData | null>): void {
    const table = this.tabletop.currentTable;
    if (before.size < 1 || !table.identifier) return;
    const field = ensureGroundFieldOn(table);
    for (const [key, chunk] of before) {
      const [cx, cy] = key.split(',').map(Number);
      field.writeChunk(chunk ?? { cx, cy, heights: new Int16Array(GROUND_CHUNK_SAMPLE_COUNT), paint: null });
    }
  }
}
