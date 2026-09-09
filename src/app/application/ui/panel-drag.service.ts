import { Injectable, signal } from '@angular/core';
import { PanelFrame, PanelHandoff, PanelService } from '@axe/application/ui/panel.service';
import { findDropZone, PanelDropZone } from '@axe/application/ui/panel-drag-helpers';

/** A frame, as far as a drag is concerned: where it may be dropped on, and what it holds. */
export interface PanelDropFrame extends PanelFrame {
  /** The boxes a drop counts in, or nothing while the frame will take no panel in. */
  measureDropZone: () => PanelDropZone | null;
  handOver: (panel: PanelService) => PanelHandoff | null;
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

  readonly held = signal<PanelDropFrame | null>(null);
  readonly target = signal<PanelDropFrame | null>(null);

  /** Offers a frame as somewhere to drop on. Returns the way to take the offer back. */
  register(frame: PanelDropFrame): () => void {
    this.frames.set(frame.frameKey, frame);
    return () => {
      this.frames.delete(frame.frameKey);
      if (this.held()?.frameKey === frame.frameKey) this.held.set(null);
      if (this.target()?.frameKey === frame.frameKey) this.target.set(null);
    };
  }

  begin(frame: PanelDropFrame): void {
    this.held.set(frame);
    this.target.set(null);
  }

  move(x: number, y: number): void {
    const held = this.held();
    if (!held) return;
    const offered: { frame: PanelDropFrame; zone: PanelDropZone }[] = [];
    for (const frame of this.frames.values()) {
      if (frame.frameKey === held.frameKey) continue;
      const zone = frame.measureDropZone();
      if (zone) offered.push({ frame, zone });
    }
    this.target.set(findDropZone({ x, y }, offered)?.frame ?? null);
  }

  /** Says where the drag landed, and forgets it. */
  end(): PanelDropFrame | null {
    const target = this.target();
    this.held.set(null);
    this.target.set(null);
    return target;
  }

  cancel(): void {
    this.held.set(null);
    this.target.set(null);
  }
}
