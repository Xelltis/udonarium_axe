import { Injectable, signal } from '@angular/core';

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
  private readonly held = signal<SwitchNotice | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly notice = this.held.asReadonly();

  show(text: string, x: number, y: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.held.set({ text, x, y });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.held.set(null);
    }, SWITCH_NOTICE_MS);
  }
}
