import { effect, Injectable, signal } from '@angular/core';

/** Where this seat's own choice is kept in the browser. */
export const WIDGET_VISIBILITY_STORAGE_KEY = 'ui-widgets';

const STORAGE_KEY = WIDGET_VISIBILITY_STORAGE_KEY;

export interface WidgetVisibility {
  readonly clock: boolean;
  readonly miniPlayer: boolean;
  readonly connectionQuality: boolean;
  readonly recording: boolean;
  readonly renderStats: boolean;
  readonly hotbar: boolean;
  readonly plToolbar: boolean;
  readonly gmToolbar: boolean;
}

const DEFAULT_VISIBILITY: WidgetVisibility = {
  clock: false,
  miniPlayer: true,
  connectionQuality: false,
  recording: true,
  renderStats: false,
  hotbar: false,
  plToolbar: true,
  gmToolbar: true,
};

/**
 * Reads which widgets are shown from storage text, taking the default for any field missing or
 * mistyped and for text that cannot be read.
 */
export function parseWidgetVisibility(raw: string | null): WidgetVisibility {
  if (!raw) return DEFAULT_VISIBILITY;
  try {
    const parsed = JSON.parse(raw) as Partial<WidgetVisibility>;
    return {
      clock: typeof parsed.clock === 'boolean' ? parsed.clock : DEFAULT_VISIBILITY.clock,
      miniPlayer: typeof parsed.miniPlayer === 'boolean' ? parsed.miniPlayer : DEFAULT_VISIBILITY.miniPlayer,
      connectionQuality:
        typeof parsed.connectionQuality === 'boolean' ? parsed.connectionQuality : DEFAULT_VISIBILITY.connectionQuality,
      recording: typeof parsed.recording === 'boolean' ? parsed.recording : DEFAULT_VISIBILITY.recording,
      renderStats: typeof parsed.renderStats === 'boolean' ? parsed.renderStats : DEFAULT_VISIBILITY.renderStats,
      hotbar: typeof parsed.hotbar === 'boolean' ? parsed.hotbar : DEFAULT_VISIBILITY.hotbar,
      plToolbar: typeof parsed.plToolbar === 'boolean' ? parsed.plToolbar : DEFAULT_VISIBILITY.plToolbar,
      gmToolbar: typeof parsed.gmToolbar === 'boolean' ? parsed.gmToolbar : DEFAULT_VISIBILITY.gmToolbar,
    };
  } catch {
    return DEFAULT_VISIBILITY;
  }
}

@Injectable({ providedIn: 'root' })
export class WidgetVisibilityService {
  private readonly restored = parseWidgetVisibility(localStorage.getItem(STORAGE_KEY));

  readonly clock = signal(this.restored.clock);
  readonly miniPlayer = signal(this.restored.miniPlayer);
  readonly connectionQuality = signal(this.restored.connectionQuality);
  readonly recording = signal(this.restored.recording);
  readonly renderStats = signal(this.restored.renderStats);
  readonly hotbar = signal(this.restored.hotbar);
  readonly plToolbar = signal(this.restored.plToolbar);
  readonly gmToolbar = signal(this.restored.gmToolbar);

  constructor() {
    effect(() => {
      const state: WidgetVisibility = {
        clock: this.clock(),
        miniPlayer: this.miniPlayer(),
        connectionQuality: this.connectionQuality(),
        recording: this.recording(),
        renderStats: this.renderStats(),
        hotbar: this.hotbar(),
        plToolbar: this.plToolbar(),
        gmToolbar: this.gmToolbar(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }

  /** Shows or hides the clock widget. Remembered in this browser. */
  toggleClock(): void {
    this.clock.update((visible) => !visible);
  }

  /** Shows or hides the mini music player. Remembered in this browser. */
  toggleMiniPlayer(): void {
    this.miniPlayer.update((visible) => !visible);
  }

  /** Shows or hides the connection quality widget. Remembered in this browser. */
  toggleConnectionQuality(): void {
    this.connectionQuality.update((visible) => !visible);
  }

  /** Shows or hides the session recording indicator. Remembered in this browser. */
  toggleRecording(): void {
    this.recording.update((visible) => !visible);
  }

  /** Shows or hides the render stats widget. Remembered in this browser. */
  toggleRenderStats(): void {
    this.renderStats.update((visible) => !visible);
  }

  /** Shows or hides the hotbar. Remembered in this browser. */
  toggleHotbar(): void {
    this.hotbar.update((visible) => !visible);
  }

  /** Shows or hides the player's toolbar. Remembered in this browser. */
  togglePlToolbar(): void {
    this.plToolbar.update((visible) => !visible);
  }

  /** Shows or hides the game master's toolbar. Remembered in this browser. */
  toggleGmToolbar(): void {
    this.gmToolbar.update((visible) => !visible);
  }
}
