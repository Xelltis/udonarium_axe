import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { localDispatch, networkMessage$ } from '@axe/core/network/network-messaging';

export const VN_MODE_EVENT = 'VN_MODE';

@Injectable({ providedIn: 'root' })
export class VisualNovelModeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly _active = signal(false);
  readonly active = this._active.asReadonly();

  constructor() {
    networkMessage$.subscribe((message) => {
      if (message.eventName !== VN_MODE_EVENT) return;
      this._active.set(Boolean((message.data as { active?: unknown } | null)?.active));
    }, this.destroyRef);
  }

  /** Opens novel mode on this screen, announcing it on this device only; does nothing when already open. */
  activate(): void {
    this.set(true);
  }

  /** Closes novel mode on this screen, announcing it on this device only; does nothing when already closed. */
  deactivate(): void {
    this.set(false);
  }

  /** Opens novel mode when it is closed and closes it when it is open, on this screen only. */
  toggle(): void {
    this.set(!this._active());
  }

  private set(active: boolean): void {
    if (this._active() === active) return;
    this._active.set(active);
    localDispatch(VN_MODE_EVENT, { active });
  }
}
