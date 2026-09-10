import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild, ViewContainerRef } from '@angular/core';

/**
 * The ground one panel stands on inside a frame.
 *
 * A frame may hold several panels at once and show one of them, so what a panel is drawn on
 * belongs to the panel rather than to the frame: its own scroll, its own place to be built
 * into. It draws nothing of its own, which is what lets it move from frame to frame with the
 * panel it holds.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'panel-tab-slot',
  templateUrl: './panel-tab-slot.component.html',
  host: { class: 'contents' },
  imports: [NgStyle],
})
export class PanelTabSlotComponent {
  readonly padding = input('8px');
  readonly top = input('28px');
  readonly overflowVisible = input(false);
  readonly contentMinimized = input(false);
  /** Whether this is the panel its frame is showing. The others are kept, not taken down. */
  readonly active = input(true);
  /** Whether the frame is folded away to its title bar, which hides every panel it holds. */
  readonly collapsed = input(false);

  readonly content = viewChild.required('content', { read: ViewContainerRef });
  readonly scrollable = viewChild.required<ElementRef<HTMLDivElement>>('scrollable');
}
