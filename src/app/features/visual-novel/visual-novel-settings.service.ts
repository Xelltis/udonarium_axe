import { Injectable, signal } from '@angular/core';

export type VnTypewriterSpeed = 'off' | 'slow' | 'normal' | 'fast';
export type VnPortraitAnimation = 'none' | 'fade' | 'slide' | 'bounce';
export type VnTextSize = 'small' | 'normal' | 'large';

export const VN_TYPEWRITER_SPEEDS: readonly VnTypewriterSpeed[] = ['off', 'slow', 'normal', 'fast'];
export const VN_PORTRAIT_ANIMATIONS: readonly VnPortraitAnimation[] = ['none', 'fade', 'slide', 'bounce'];
export const VN_TEXT_SIZES: readonly VnTextSize[] = ['small', 'normal', 'large'];

export type VnReadability = 0 | 1 | 2 | 3;
export type VnLayout = 'bubble' | 'adv' | 'nvl';

export const VN_LAYOUTS: readonly VnLayout[] = ['bubble', 'adv', 'nvl'];

export const VN_READABILITY_LEVELS: readonly VnReadability[] = [0, 1, 2, 3];
export const DEFAULT_VN_READABILITY: VnReadability = 0;

export const VN_AUTO_PLAY_SPEED_MIN = 0.5;
export const VN_AUTO_PLAY_SPEED_MAX = 2;

export const VN_TYPEWRITER_INTERVAL_MS: Record<VnTypewriterSpeed, number> = {
  off: 0,
  slow: 60,
  normal: 30,
  fast: 12,
};

const STORAGE_KEY = 'vn-settings';

interface VnSettingsSnapshot {
  typewriterSpeed?: unknown;
  portraitAnimation?: unknown;
  textSize?: unknown;
  autoPlaySpeed?: unknown;
  reduceMotion?: unknown;
  chatTabIdentifier?: unknown;
  readability?: unknown;
  layout?: unknown;
  readPlayerAsides?: unknown;
}

function clampSpeed(value: unknown): number {
  const num = typeof value === 'number' ? value : NaN;
  if (Number.isNaN(num)) return 1;
  return Math.min(VN_AUTO_PLAY_SPEED_MAX, Math.max(VN_AUTO_PLAY_SPEED_MIN, num));
}

function pickReadability(value: unknown): VnReadability {
  return VN_READABILITY_LEVELS.includes(value as VnReadability) ? (value as VnReadability) : DEFAULT_VN_READABILITY;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

@Injectable({ providedIn: 'root' })
export class VisualNovelSettingsService {
  private readonly _typewriterSpeed = signal<VnTypewriterSpeed>('normal');
  private readonly _portraitAnimation = signal<VnPortraitAnimation>('slide');
  private readonly _textSize = signal<VnTextSize>('normal');
  private readonly _autoPlaySpeed = signal<number>(1);
  private readonly _reduceMotion = signal(false);
  private readonly _chatTabIdentifier = signal('');
  private readonly _readability = signal<VnReadability>(DEFAULT_VN_READABILITY);
  private readonly _layout = signal<VnLayout>('bubble');
  private readonly _readPlayerAsides = signal(false);

  readonly typewriterSpeed = this._typewriterSpeed.asReadonly();
  readonly portraitAnimation = this._portraitAnimation.asReadonly();
  readonly textSize = this._textSize.asReadonly();
  readonly autoPlaySpeed = this._autoPlaySpeed.asReadonly();
  readonly reduceMotion = this._reduceMotion.asReadonly();
  readonly chatTabIdentifier = this._chatTabIdentifier.asReadonly();
  readonly readability = this._readability.asReadonly();
  readonly layout = this._layout.asReadonly();
  /** Whether what the people at the table say to each other is read out as part of the scene. */
  readonly readPlayerAsides = this._readPlayerAsides.asReadonly();

  constructor() {
    this.load();
  }

  /** Sets how fast lines are typed out, `off` showing them whole; saved in this browser. */
  setTypewriterSpeed(speed: VnTypewriterSpeed): void {
    this._typewriterSpeed.set(speed);
    this.save();
  }

  /** Sets how portraits come onto and leave the stage; saved in this browser. */
  setPortraitAnimation(animation: VnPortraitAnimation): void {
    this._portraitAnimation.set(animation);
    this.save();
  }

  /** Sets the size of the text novel mode reads out; saved in this browser. */
  setTextSize(size: VnTextSize): void {
    this._textSize.set(size);
    this.save();
  }

  /** Sets how fast auto play moves on, held between half and double speed; saved in this browser. */
  setAutoPlaySpeed(speed: number): void {
    this._autoPlaySpeed.set(clampSpeed(speed));
    this.save();
  }

  /** Sets whether novel mode tones its motion down; saved in this browser. */
  setReduceMotion(reduce: boolean): void {
    this._reduceMotion.set(reduce);
    this.save();
  }

  /** Flips whether novel mode tones its motion down; saved in this browser. */
  toggleReduceMotion(): void {
    this.setReduceMotion(!this._reduceMotion());
  }

  /**
   * Sets how strongly the screen is darkened and blurred behind the text, from 0 (not at all) to 3.
   *
   * Saved in this browser.
   */
  setReadability(level: VnReadability): void {
    this._readability.set(level);
    this.save();
  }

  /**
   * Sets how lines are laid out on screen; saved in this browser.
   *
   * `bubble` draws a speech balloon over the speaker's portrait on the stage, and falls back to
   * `adv` for a line whose speaker has no portrait there. `adv` draws a dark window across the foot
   * of the screen with the speaker's name on a tab. `nvl` draws a dark panel over most of the screen
   * with the speaker's name above the line.
   */
  setLayout(layout: VnLayout): void {
    this._layout.set(layout);
    this.save();
  }

  /** Sets whether what the people at the table say to each other is read out too; saved in this browser. */
  setReadPlayerAsides(read: boolean): void {
    this._readPlayerAsides.set(read);
    this.save();
  }

  /** Remembers which chat tab novel mode reads, so it opens on that tab next time; saved in this browser. */
  setChatTabIdentifier(identifier: string): void {
    this._chatTabIdentifier.set(identifier);
    this.save();
  }

  private load(): void {
    let snapshot: VnSettingsSnapshot | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) snapshot = JSON.parse(raw) as VnSettingsSnapshot;
    } catch {
      snapshot = null;
    }
    if (!snapshot) return;
    this._typewriterSpeed.set(pick(snapshot.typewriterSpeed, VN_TYPEWRITER_SPEEDS, 'normal'));
    this._portraitAnimation.set(pick(snapshot.portraitAnimation, VN_PORTRAIT_ANIMATIONS, 'slide'));
    this._textSize.set(pick(snapshot.textSize, VN_TEXT_SIZES, 'normal'));
    this._autoPlaySpeed.set(clampSpeed(snapshot.autoPlaySpeed));
    this._reduceMotion.set(snapshot.reduceMotion === true);
    this._chatTabIdentifier.set(typeof snapshot.chatTabIdentifier === 'string' ? snapshot.chatTabIdentifier : '');
    this._readability.set(pickReadability(snapshot.readability));
    this._layout.set(pick(snapshot.layout, VN_LAYOUTS, 'bubble'));
    this._readPlayerAsides.set(snapshot.readPlayerAsides === true);
  }

  private save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          typewriterSpeed: this._typewriterSpeed(),
          portraitAnimation: this._portraitAnimation(),
          textSize: this._textSize(),
          autoPlaySpeed: this._autoPlaySpeed(),
          reduceMotion: this._reduceMotion(),
          chatTabIdentifier: this._chatTabIdentifier(),
          readability: this._readability(),
          layout: this._layout(),
          readPlayerAsides: this._readPlayerAsides(),
        })
      );
    } catch {
      return;
    }
  }
}
