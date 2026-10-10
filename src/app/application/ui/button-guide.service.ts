import { Injectable, signal } from '@angular/core';

/**
 * Whether the menu and the toolbars are writing out the name of every button at once.
 *
 * The names are otherwise shown one at a time, under the pointer, which leaves somebody new to the
 * screen hovering over each mark in turn to find the one they were told to press. Nothing is kept:
 * the guide is asked for when it is wanted and put away as soon as anything is pressed.
 */
@Injectable({ providedIn: 'root' })
export class ButtonGuideService {
  private readonly held = signal(false);

  /** Whether every name is written out just now. */
  readonly shown = this.held.asReadonly();

  show(): void {
    this.held.set(true);
  }

  hide(): void {
    this.held.set(false);
  }

  toggle(): void {
    this.held.update((shown) => !shown);
  }
}
