import { Injectable, Signal } from '@angular/core';
import { transientSignal } from '@axe/application/ui/transient-signal';

/** How long a word about a press that came to nothing stays on the screen. */
export const SWITCH_NOTICE_MS = 1800;

/** A few words said beside the pointer, and where the pointer was. */
export interface SwitchNotice {
  text: string;
  x: number;
  y: number;
}

/**
 * Says for a moment, beside the pointer, why a press on the table came to nothing.
 *
 * Painted ground has no body of its own to write on, so the word goes where the hand is instead.
 * Only this seat is told: a press turned away is nobody else's business, and the chat is kept for
 * what happened rather than what did not.
 */
@Injectable({ providedIn: 'root' })
export class SwitchNoticeService {
  private readonly held = transientSignal<SwitchNotice | null>(null, SWITCH_NOTICE_MS);

  readonly notice: Signal<SwitchNotice | null> = this.held;

  show(text: string, x: number, y: number): void {
    this.held.show({ text, x, y });
  }
}
