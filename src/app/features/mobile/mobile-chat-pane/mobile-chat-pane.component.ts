import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { PanelService } from '@axe/application/ui/panel.service';
import { ChatWindowComponent } from '@axe/features/chat/chat-window/chat-window.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'mobile-chat-pane',
  templateUrl: './mobile-chat-pane.component.html',
  host: { class: 'contents' },
  providers: [PanelService],
  imports: [ChatWindowComponent],
})
export class MobileChatPaneComponent {
  private readonly panelService = inject(PanelService);
  private readonly chatScroll = viewChild.required<ElementRef<HTMLDivElement>>('chatScroll');

  constructor() {
    afterNextRender({
      write: () => {
        this.panelService.setDefaultScrollablePanel(this.chatScroll().nativeElement);
      },
    });
  }
}
