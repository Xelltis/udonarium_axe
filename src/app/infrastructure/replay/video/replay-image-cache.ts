import type { DrawableImage } from '@axe/infrastructure/replay/drawable-image';
import type { ReplayFrameAssets } from '@axe/infrastructure/replay/replay-canvas';

/**
 * A picture that ships with the app, named by its own path, as the textures of generated dungeons
 * are. It can be loaded by that path even when this browser was never told of it, as when a
 * recording is played back in a later session.
 */
const BUNDLED_ASSET = /^(\.\/)?assets\/images\/[\w./-]+\.(png|jpe?g|gif|webp|svg)$/i;

/** Where a picture is found by its identifier: at once, or, in a worker, by asking the page for it. */
export interface ReplayImageSource {
  get(
    identifier: string
  ): { blob: Blob | null; url: string } | null | Promise<{ blob: Blob | null; url: string } | null>;
}

/** How much decoded picture the cache keeps before letting the least recently drawn go, in bytes. */
export const REPLAY_IMAGE_BUDGET_BYTES = 640 * 1024 * 1024;

interface Entry {
  image: DrawableImage;
  bytes: number;
}

/**
 * The pictures a replay video draws, decoded as they are first wanted.
 *
 * Each is scaled down once, with the best resampling the browser has, to no larger than the video
 * can show, so drawing it every frame never resamples a huge picture and memory is not spent on
 * pixels that never reach the screen. When the decoded pictures pass the budget, those drawn least
 * recently are let go and decoded again if they are wanted back. A picture that ships with the app is
 * loaded by its path when this browser holds no record of it. One it neither holds nor can load is
 * remembered as missing and drawn as absent.
 */
export class ReplayImageCache implements ReplayFrameAssets {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly missing = new Set<string>();
  private bytes = 0;
  private disposed = false;

  /**
   * @param storage where the pictures are stored.
   * @param maxSide the longest side a picture is kept at.
   * @param onLoaded told whenever a picture becomes ready, so a preview can draw again.
   */
  constructor(
    private readonly storage: ReplayImageSource,
    private readonly maxSide: number,
    private readonly onLoaded: () => void = () => undefined,
    private readonly budgetBytes = REPLAY_IMAGE_BUDGET_BYTES
  ) {}

  /** The picture ready to draw, or null while it loads or when there is none. Asks for it when it is not ready. */
  imageOf(identifier: string): DrawableImage | null {
    if (identifier.length < 1) return null;
    const entry = this.entries.get(identifier);
    if (entry) {
      this.entries.delete(identifier);
      this.entries.set(identifier, entry);
      return entry.image;
    }
    void this.load(identifier);
    return null;
  }

  /** Whether every picture named is ready or known to be missing. */
  has(identifiers: Iterable<string>): boolean {
    for (const identifier of identifiers) {
      if (identifier.length < 1 || this.missing.has(identifier)) continue;
      if (!this.entries.has(identifier)) return false;
    }
    return true;
  }

  /** Loads every picture named, settling once all are ready or known to be missing. */
  async ensure(identifiers: Iterable<string>): Promise<void> {
    const loads: Promise<void>[] = [];
    for (const identifier of identifiers) {
      if (identifier.length < 1 || this.entries.has(identifier) || this.missing.has(identifier)) continue;
      loads.push(this.load(identifier));
    }
    await Promise.all(loads);
  }

  /** Lets every picture go. The cache loads nothing more afterwards. */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.image.close?.();
    this.entries.clear();
    this.bytes = 0;
  }

  private load(identifier: string): Promise<void> {
    if (this.disposed || this.missing.has(identifier)) return Promise.resolve();
    const running = this.pending.get(identifier);
    if (running) return running;

    const loading = this.decode(identifier)
      .then((image) => {
        if (!image) {
          this.missing.add(identifier);
          return;
        }
        if (this.disposed) {
          image.close?.();
          return;
        }
        const bytes = Math.max(1, image.width * image.height * 4);
        this.entries.set(identifier, { image, bytes });
        this.bytes += bytes;
        this.evict(identifier);
        this.onLoaded();
      })
      .catch(() => {
        this.missing.add(identifier);
      })
      .finally(() => this.pending.delete(identifier));
    this.pending.set(identifier, loading);
    return loading;
  }

  private async decode(identifier: string): Promise<DrawableImage | null> {
    const stored = await this.storage.get(identifier);
    const url = stored?.url || (BUNDLED_ASSET.test(identifier) ? identifier : '');
    const blob = stored?.blob ?? (url.length > 0 ? await fetchBlob(url) : null);
    if (!blob || typeof createImageBitmap !== 'function') return null;

    const full = await createImageBitmap(blob);
    const longest = Math.max(full.width, full.height);
    if (longest <= this.maxSide) return full as DrawableImage;
    const ratio = this.maxSide / longest;
    try {
      const scaled = await createImageBitmap(full, {
        resizeWidth: Math.max(1, Math.round(full.width * ratio)),
        resizeHeight: Math.max(1, Math.round(full.height * ratio)),
        resizeQuality: 'high',
      });
      return scaled as DrawableImage;
    } finally {
      full.close();
    }
  }

  /** Lets the pictures drawn least recently go until the rest fit the budget, never the one just loaded. */
  private evict(keep: string): void {
    for (const [identifier, entry] of this.entries) {
      if (this.bytes <= this.budgetBytes) return;
      if (identifier === keep) continue;
      entry.image.close?.();
      this.entries.delete(identifier);
      this.bytes -= entry.bytes;
    }
  }
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}
