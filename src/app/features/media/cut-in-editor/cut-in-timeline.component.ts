import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import type { CutInSound } from '@axe/domain/media/cut-in-sound';
import { layerKeyTimes } from '@axe/features/media/cut-in-editor/cut-in-keyframe-edit';
import {
  bandDraggedTo,
  type BandEdge,
  bandEdgeAt,
  barRect,
  keyAtX,
  msToX,
  pxPerSecFor,
  snapMs,
  snapToNearby,
  TIMELINE_ROW_H_PX,
  TIMELINE_RULER_H_PX,
  TIMELINE_SOUND_H_PX,
  type TimelineTick,
  trackWidthFor,
  visibleTicks,
  xToMs,
} from '@axe/features/media/cut-in-editor/cut-in-timeline-geometry';
import { TranslocoModule } from '@jsverse/transloco';

export interface TimelineRow {
  layer: CutInLayer;
  left: number;
  width: number;
  keys: { ms: number; x: number }[];
}

interface KeyDrag {
  layer: CutInLayer;
  fromMs: number;
  toMs: number;
}

/** What a drag has hold of, which is the one thing on the timeline it may not land on. */
interface Held {
  /** Moments the drag itself sits on. */
  moments?: readonly number[];
  /** A layer whose band is being dragged, whose own two ends move with the pointer. */
  band?: CutInLayer;
}

/** The clock of a scene: what each layer is doing, and when. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'cut-in-timeline',
  templateUrl: './cut-in-timeline.component.html',
  host: { class: 'block' },
  imports: [TranslocoModule],
})
export class CutInTimelineComponent {
  private readonly objectChange = inject(ObjectChangeService);

  readonly layers = input<readonly CutInLayer[]>([]);
  readonly sounds = input<readonly CutInSound[]>([]);
  readonly selected = input<CutInLayer | null>(null);
  readonly durationMs = input(0);
  readonly playheadMs = input(0);
  readonly isEditable = input(false);
  /** The room the bands have on screen, and how far they are drawn out past it. */
  readonly viewportPx = input(0);
  readonly zoom = input(1);

  readonly seek = output<number>();
  /**
   * A key or a sound pressed and let go without moving: where the playhead is wanted, which,
   * unlike scrubbing, is no reason to stop a playing preview.
   */
  readonly cue = output<number>();
  readonly selectLayer = output<CutInLayer>();
  readonly moveKey = output<{ layer: CutInLayer; fromMs: number; toMs: number }>();
  readonly trimLayer = output<{ layer: CutInLayer; startMs: number; endMs: number }>();
  /** The drag is over, so what it did is worth remembering as one change. */
  readonly trimmed = output<void>();
  readonly removeKey = output<{ layer: CutInLayer; ms: number }>();
  readonly moveSound = output<{ fromMs: number; toMs: number }>();
  readonly removeSound = output<{ ms: number }>();

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  /** How wide the bands stand once drawn out: the room they have, times the scale. */
  readonly trackWidth = computed(() => trackWidthFor(this.viewportPx(), this.zoom()));
  private scrubbing = false;
  private keyDrag: KeyDrag | null = null;
  private bandDrag: { layer: CutInLayer; edge: BandEdge } | null = null;
  private soundDrag: { fromMs: number; toMs: number } | null = null;

  readonly pxPerSec = computed(() => pxPerSecFor(this.durationMs(), this.trackWidth()));

  protected readonly rulerHeightPx = TIMELINE_RULER_H_PX;
  protected readonly soundHeightPx = TIMELINE_SOUND_H_PX;
  protected readonly rowHeightPx = TIMELINE_ROW_H_PX;

  readonly ticks = computed<TimelineTick[]>(() => visibleTicks(this.durationMs(), this.pxPerSec()));

  /** Topmost first, the way the layer list reads. */
  readonly rows = computed<TimelineRow[]>(() => {
    const pxPerSec = this.pxPerSec();
    const durationMs = this.durationMs();

    return [...this.layers()].reverse().map((layer) => {
      this.objectChange.versionOf(layer.identifier)();
      const bar = barRect(layer, durationMs, pxPerSec);
      return {
        layer,
        left: bar.left,
        width: bar.width,
        keys: layerKeyTimes(layer).map((ms) => ({ ms, x: msToX(ms, pxPerSec) })),
      };
    });
  });

  readonly soundMarks = computed(() =>
    this.sounds().map((sound) => ({ ms: sound.t, x: msToX(sound.t, this.pxPerSec()) }))
  );

  readonly playheadX = computed(() => msToX(this.playheadMs(), this.pxPerSec()));

  constructor() {}

  protected tickX(tick: TimelineTick): number {
    return msToX(tick.ms, this.pxPerSec());
  }

  protected tickLabel(tick: TimelineTick): string {
    return `${Math.round(tick.ms / 100) / 10}`;
  }

  protected isSelected(row: TimelineRow): boolean {
    return this.selected()?.identifier === row.layer.identifier;
  }

  protected onRulerDown(event: PointerEvent): void {
    (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    this.scrubbing = true;
    this.seek.emit(this.momentAt(event));
  }

  protected onRowDown(event: PointerEvent, row: TimelineRow): void {
    this.selectLayer.emit(row.layer);

    // The ends of the band come first: they sit where a key might, and one of them is
    // almost always what a press near the edge of a band was meant for.
    if (this.isEditable() && !row.layer.locked) {
      const edge = bandEdgeAt({ left: row.left, width: row.width }, this.offsetOf(event));
      if (edge) {
        (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
        this.bandDrag = { layer: row.layer, edge };
        return;
      }
    }

    // A locked layer is looked at, not moved, the same as on the stage.
    const grabbed =
      this.isEditable() && !row.layer.locked
        ? keyAtX(
            row.keys.map((key) => key.ms),
            this.offsetOf(event),
            this.pxPerSec()
          )
        : null;
    if (grabbed === null) {
      this.onRulerDown(event);
      return;
    }

    (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    this.keyDrag = { layer: row.layer, fromMs: grabbed, toMs: grabbed };
  }

  protected onSoundRowDown(event: PointerEvent): void {
    const grabbed = this.isEditable()
      ? keyAtX(
          this.soundMarks().map((mark) => mark.ms),
          this.offsetOf(event),
          this.pxPerSec()
        )
      : null;
    if (grabbed === null) {
      this.onRulerDown(event);
      return;
    }

    (event.target as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    this.soundDrag = { fromMs: grabbed, toMs: grabbed };
  }

  protected onSoundRowDoubleClick(event: MouseEvent): void {
    if (!this.isEditable()) return;

    const at = keyAtX(
      this.soundMarks().map((mark) => mark.ms),
      this.offsetOf(event),
      this.pxPerSec()
    );
    if (at === null) return;
    this.removeSound.emit({ ms: at });
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.bandDrag) {
      // A band follows the pointer as it is dragged, so its length can be seen being set.
      const { layer, edge } = this.bandDrag;
      const moved = bandDraggedTo(layer, edge, this.momentAt(event, { band: layer }), this.durationMs());
      this.trimLayer.emit({ layer, ...moved });
      return;
    }
    if (this.soundDrag) {
      this.soundDrag.toMs = this.momentAt(event, { moments: [this.soundDrag.fromMs] });
      return;
    }
    if (this.keyDrag) {
      this.keyDrag.toMs = this.momentAt(event, { moments: [this.keyDrag.fromMs] });
      return;
    }
    if (this.scrubbing) this.seek.emit(this.momentAt(event));
  }

  /**
   * The end of a press on the timeline.
   *
   * A key or a sound let go where it was taken cues the playhead onto it, which is where the
   * buttons that take one away act; a double click, the other way to take one away, is not there
   * to be had on a touch screen.
   */
  protected onPointerUp(event: PointerEvent): void {
    (event.target as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
    this.scrubbing = false;

    if (this.bandDrag) {
      this.bandDrag = null;
      this.trimmed.emit();
      return;
    }

    const draggedSound = this.soundDrag;
    this.soundDrag = null;
    if (draggedSound) {
      if (draggedSound.toMs !== draggedSound.fromMs) this.moveSound.emit(draggedSound);
      else this.cue.emit(draggedSound.fromMs);
      return;
    }

    const dragged = this.keyDrag;
    this.keyDrag = null;
    if (!dragged) return;
    if (dragged.toMs === dragged.fromMs) {
      this.cue.emit(dragged.fromMs);
      return;
    }

    this.moveKey.emit({ layer: dragged.layer, fromMs: dragged.fromMs, toMs: dragged.toMs });
  }

  protected onRowDoubleClick(event: MouseEvent, row: TimelineRow): void {
    if (!this.isEditable() || row.layer.locked) return;

    const at = keyAtX(
      row.keys.map((key) => key.ms),
      this.offsetOf(event),
      this.pxPerSec()
    );
    if (at === null) return;
    this.removeKey.emit({ layer: row.layer, ms: at });
  }

  /**
   * Where a drag lands: on a moment worth landing on where one is near, on the grid where
   * none is. Holding shift lets go of the magnet, for the times a moment is wanted between.
   *
   * Nothing pulls on itself. A band dragged by one end would otherwise be held to the end
   * it already sits on, and could be moved only in jumps of the magnet's own reach.
   */
  private momentAt(event: MouseEvent, held?: Held): number {
    const ms = xToMs(this.offsetOf(event), this.pxPerSec());
    if (event.shiftKey) return snapMs(ms, this.durationMs());

    const skip = new Set(held?.moments ?? []);
    const nearby = this.magnets(held?.band).filter((moment) => !skip.has(moment));
    return snapToNearby(ms, nearby, this.durationMs(), this.pxPerSec());
  }

  /** Every moment on the timeline worth a drag landing on. */
  private magnets(exceptBandOf?: CutInLayer): number[] {
    const moments = new Set<number>([0, this.durationMs(), this.playheadMs()]);
    for (const row of this.rows()) {
      for (const key of row.keys) moments.add(key.ms);
      if (row.layer === exceptBandOf) continue;
      moments.add(xToMs(row.left, this.pxPerSec()));
      moments.add(xToMs(row.left + row.width, this.pxPerSec()));
    }
    for (const mark of this.soundMarks()) moments.add(mark.ms);
    return [...moments].map((moment) => Math.round(moment));
  }

  private offsetOf(event: MouseEvent): number {
    const bounds = this.track()?.nativeElement.getBoundingClientRect();
    return bounds ? event.clientX - bounds.left : event.clientX;
  }
}
