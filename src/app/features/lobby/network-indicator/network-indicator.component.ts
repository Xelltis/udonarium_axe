import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/network/network';

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
          this.timer = setTimeout(repeatFunc, 650);
          this.needRepeat = false;
        } else {
          this.timer = null;
          this.elementRef.nativeElement.style.display = 'none';
        }
      };

      this.objectChange.eventActivity$.subscribe(() => {
        if (this.needRepeat || Network.instance.bandwidthUsage < 3 * 1024) return;
        if (this.timer === null) {
          this.elementRef.nativeElement.style.display = 'block';
          this.timer = setTimeout(repeatFunc, 650);
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
