import { Injectable } from '@angular/core';
import { loadReplayFonts } from '@axe/infrastructure/replay/video/replay-fonts';

/** Loads the fonts replay videos are set in into the page, answering whether they loaded. */
@Injectable({ providedIn: 'root' })
export class ReplayFontLoader {
  /** Loads the bundled faces into the page; see `loadReplayFonts`. */
  load(): Promise<boolean> {
    return loadReplayFonts();
  }
}
