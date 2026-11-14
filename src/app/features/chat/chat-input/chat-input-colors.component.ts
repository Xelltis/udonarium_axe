import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import {
  CHAT_COLOR_SLOTS,
  CHAT_INPUT_BAR_BUTTON_CLASS,
  ChatInputColors,
} from '@axe/features/chat/chat-input/chat-input-colors';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The popover a chat input's colour button opens: a sample of each of the speaker's three colours to
 * speak in, and the way into the colour settings.
 *
 * The input it belongs to opens and places it, as it does its other popover, so that only one
 * stands open at a time; this draws what is in it and says when a choice has been made.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-input-colors',
  templateUrl: './chat-input-colors.component.html',
  host: { class: 'contents' },
  imports: [NgStyle, TranslocoModule],
})
export class ChatInputColorsComponent {
  /** The colours of the input this popover belongs to. */
  readonly colors = input.required<ChatInputColors>();
  /** Whether the popover stands open, which is when its contents are drawn. */
  readonly open = input(false);
  /** Asks the input to shut the popover, once a colour is picked or the settings are opened. */
  readonly closed = output<void>();

  /** The popover's own element, which the input shows and places over its button. */
  readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected readonly slots = CHAT_COLOR_SLOTS;
  protected readonly barButtonClass = CHAT_INPUT_BAR_BUTTON_CLASS;
  protected readonly colorSampleClass =
    'flex size-5 items-center justify-center rounded-[5px] text-[12px] leading-none font-bold shadow-[0_0_0_1px_var(--ui-border-panel)]';
  protected readonly panelRowClass =
    'text-ui-text hover:bg-ui-hover rounded-ui-sm m-0 flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1 text-left text-[12px]';

  /** Speaks in one of the three colours. */
  protected pick(slot: number): void {
    this.colors().select(slot);
    this.closed.emit();
  }

  /** Opens the colour settings. */
  protected openSetting(): void {
    this.closed.emit();
    this.colors().openSetting();
  }
}
