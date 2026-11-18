import { Injectable, signal } from '@angular/core';

/** The halves of the AI link panel: the link itself with what the AI did, and having the AI be the game master. */
export type AiLinkTab = 'link' | 'gm';

/**
 * Which half of the AI link panel is shown, kept apart from the panel so that whatever opens the
 * panel for the game master's sake can have it open on that half, the panel open already or not.
 */
@Injectable({ providedIn: 'root' })
export class AiLinkViewService {
  /** The half shown. */
  readonly tab = signal<AiLinkTab>('link');

  /** Shows one half of the panel, from when it is next drawn. */
  show(tab: AiLinkTab): void {
    this.tab.set(tab);
  }
}
