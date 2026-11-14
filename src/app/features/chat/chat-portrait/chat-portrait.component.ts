import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChatPortraitImageComponent } from '@axe/features/chat/chat-portrait-img/chat-portrait-img.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-portrait',
  templateUrl: './chat-portrait.component.html',
  imports: [ChatPortraitImageComponent],
})
export class ChatPortraitComponent {
  readonly chatTabidentifier = input('');
}
