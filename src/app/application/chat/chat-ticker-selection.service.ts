import { DestroyRef, inject, Injectable } from '@angular/core';
import { EventChannel, ReadableChannel } from '@axe/core/event/event-channel';
import { networkMessage$, networkSend } from '@axe/core/network/network-messaging';

export const CHAT_TICKER_SELECTION_EVENT_NAME = 'SHOW_CHAT_TICKER_MESSAGE';

export interface ChatTickerSelectionEvent {
  readonly messageIdentifier: string;
}

/** Shares a temporary ticker source without adding another message to the ticker tab. */
@Injectable({ providedIn: 'root' })
export class ChatTickerSelectionService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly selection = new EventChannel<ChatTickerSelectionEvent>();

  readonly selection$: ReadableChannel<ChatTickerSelectionEvent> = this.selection;

  constructor() {
    networkMessage$.subscribe((message) => {
      if (message.eventName !== CHAT_TICKER_SELECTION_EVENT_NAME) return;
      const messageIdentifier = (message.data as { messageIdentifier?: unknown } | null)?.messageIdentifier;
      if (typeof messageIdentifier !== 'string' || messageIdentifier.length < 1) return;
      this.selection.emit({ messageIdentifier });
    }, this.destroyRef);
  }

  showMessage(messageIdentifier: string): void {
    if (messageIdentifier.length < 1) return;
    networkSend(CHAT_TICKER_SELECTION_EVENT_NAME, { messageIdentifier });
  }
}
