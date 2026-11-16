import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/network/network';

/** How long the indicator stays up after traffic, and again for traffic that came meanwhile. */
const SHOWN_MS = 650;
/** The bytes in transit from which the network counts as busy. */
const BUSY_BYTES = 3 * 1024;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'network-indicator',
  templateUrl: './network-indicator.component.html',
  host: { class: 'block' },
})
export class NetworkIndicatorComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef);
  private readonly objectChange = inject(ObjectChangeService);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private needRepeat = false;

  constructor() {
    afterNextRender(() => {
      const repeatFunc = () => {
        if (this.needRepeat) {
          this.timer = setTimeout(repeatFunc, SHOWN_MS);
          this.needRepeat = false;
        } else {
          this.timer = null;
          this.elementRef.nativeElement.style.display = 'none';
        }
      };

      this.objectChange.eventActivity$.subscribe(() => {
        if (this.needRepeat || Network.instance.bandwidthUsage < BUSY_BYTES) return;
        if (this.timer === null) {
          this.elementRef.nativeElement.style.display = 'block';
          this.timer = setTimeout(repeatFunc, SHOWN_MS);
        } else {
          this.needRepeat = true;
        }
      }, this.destroyRef);
    });
    this.destroyRef.onDestroy(() => {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    });
  }
}
