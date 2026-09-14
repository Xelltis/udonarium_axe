import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'card-stack-list-img',
  templateUrl: './card-stack-list-img.component.html',
})
export class CardStackListImageComponent {
  chatMessageService = inject(ChatMessageService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);

  readonly isTilteTop = input(true);
  readonly dispByMouse = input(false);
  readonly cardStackidentifier = input('');

  readonly cardArea = viewChild<ElementRef>('cardArea');

  readonly cardAreaWidth = signal(0);

  /**
   * A fixed vertical offset of -26px for a portrait drawn over the card list.
   *
   * This component's template does not read it.
   */
  get portraitYPos(): number {
    return 0 - 26;
  }

  private _zindexOffset = 10;

  constructor() {
    afterNextRender(() => {
      this.cardAreaWidth.set(this.cardArea()?.nativeElement.offsetWidth ?? 0);
    });
    afterEveryRender(() => {
      const w = this.cardArea()?.nativeElement.offsetWidth ?? 0;
      if (w !== this.cardAreaWidth()) this.cardAreaWidth.set(w);
    });
  }
}
