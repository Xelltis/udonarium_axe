import { Injectable, signal } from '@angular/core';
import { PanelFrame } from '@axe/application/ui/panel.service';
import { findDropZone, PanelDropZone } from '@axe/application/ui/panel-drag-helpers';

/** A frame, as far as a drag is concerned: where it may be dropped on, and what it holds. */
export interface PanelDropFrame extends PanelFrame {
  /** The boxes a drop counts in, or nothing while the frame will take no panel in. */
  measureDropZone: () => PanelDropZone | null;
}

/**
 * What is being dragged from one frame to another, and where it would land.
 *
 * The frames offer their boxes while a drag is on rather than being looked for in the page:
 * a panel is dragged under the pointer, so asking the document what lies there answers with
 * the panel in hand.
 */
@Injectable({ providedIn: 'root' })
export class PanelDragService {
  private readonly frames = new Map<string, PanelDropFrame>();
  private offered: { frame: PanelDropFrame; zone: PanelDropZone }[] = [];

  readonly held = signal<PanelDropFrame | null>(null);
  readonly target = signal<PanelDropFrame | null>(null);

  /** Offers a frame as somewhere to drop on. Returns the way to take the offer back. */
  register(frame: PanelDropFrame): () => void {
    this.frames.set(frame.frameKey, frame);
    return () => {
      this.frames.delete(frame.frameKey);
      this.offered = this.offered.filter((one) => one.frame.frameKey !== frame.frameKey);
      if (this.held()?.frameKey === frame.frameKey) this.held.set(null);
      if (this.target()?.frameKey === frame.frameKey) this.target.set(null);
    };
  }

  /**
   * Only the held frame moves while a drag is on, so the boxes it may land on are measured
   * once here rather than on every stir of the pointer.
   */
  begin(frame: PanelDropFrame): void {
    this.held.set(frame);
    this.target.set(null);
    this.offered = [];
    for (const other of this.frames.values()) {
      if (other.frameKey === frame.frameKey) continue;
      const zone = other.measureDropZone();
      if (zone) this.offered.push({ frame: other, zone });
    }
  }

  move(x: number, y: number): void {
    if (!this.held()) return;
    this.target.set(findDropZone({ x, y }, this.offered)?.frame ?? null);
  }

  /** Says where the drag landed, and forgets it. */
  end(): PanelDropFrame | null {
    const target = this.target();
    this.held.set(null);
    this.target.set(null);
    this.offered = [];
    return target;
  }

  cancel(): void {
    this.held.set(null);
    this.target.set(null);
    this.offered = [];
  }
}
