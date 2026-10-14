import { computed, DestroyRef, Injectable, signal } from '@angular/core';
import { ShortcutScope } from '@axe/domain/ui/keyboard-shortcuts';

/**
 * The editors with keys of their own that are open just now, for the cheat sheet to list first.
 *
 * Each editor says it is open when it is made and is let go when it is destroyed, so the sheet
 * never has to know where the editors are kept or how they are opened.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutScopeService {
  private readonly held = signal<readonly ShortcutScope[]>([]);

  /** The scopes held open, the latest first, each once however many of its editors are open. */
  readonly scopes = computed(() => [...new Set(this.held())]);

  /** Holds a scope open until whatever `destroyRef` belongs to is destroyed. */
  hold(scope: ShortcutScope, destroyRef: DestroyRef): void {
    this.held.update((held) => [scope, ...held]);
    destroyRef.onDestroy(() =>
      this.held.update((held) => {
        const at = held.indexOf(scope);
        return at < 0 ? held : [...held.slice(0, at), ...held.slice(at + 1)];
      })
    );
  }
}
