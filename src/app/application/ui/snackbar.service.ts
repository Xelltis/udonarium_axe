import { Injectable, signal } from '@angular/core';

/** How long a notice stays on screen unless told otherwise. */
export const SNACKBAR_MS = 6000;

/** The one thing a notice offers to do, such as putting back what was just deleted. */
export interface SnackbarAction {
  label: string;
  run: () => void;
}

/** A notice at the bottom of the screen. */
export interface Snackbar {
  /** Tells one notice from the next, so a list of one can be tracked. */
  id: number;
  message: string;
  action?: SnackbarAction;
}

/**
 * Says at the bottom of the screen what just happened, for a few seconds, with one thing to do
 * about it.
 *
 * Only one notice shows at a time; a newer one takes the place of the older, whose action is then
 * no longer on offer. Only this seat sees it.
 */
@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private readonly held = signal<Snackbar | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;

  /** The notice on screen, or null. */
  readonly current = this.held.asReadonly();

  /** Shows a notice in place of whatever was showing. */
  show(message: string, options: { action?: SnackbarAction; ms?: number } = {}): void {
    this.clearTimer();
    this.held.set({ id: this.nextId++, message, action: options.action });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.held.set(null);
    }, options.ms ?? SNACKBAR_MS);
  }

  /** Takes the notice away without doing what it offered. */
  dismiss(): void {
    this.clearTimer();
    this.held.set(null);
  }

  /** Does what the notice offers, once, and takes it away. */
  runAction(): void {
    const action = this.held()?.action;
    this.dismiss();
    action?.run();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
