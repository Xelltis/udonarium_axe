import { inject, Injectable, signal } from '@angular/core';
import { isGifBytes, READ_AGAIN_AFTER_MS, readWhetherMoves } from '@axe/core/storage/animated-image';
import { ImageState } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';

/** How much of a file tells whether it is a GIF. */
const GIF_HEAD_BYTES = 6;

/**
 * Why a picture read is left without a kept answer, and what is to ask of it again.
 *
 * - `resting`: its bytes could not be read at `since`. The board takes it as still until the rest is
 *   over; `wake` is the one clock, if any, set to read it again once the rest is over.
 * - `awaitingWhole`: it was read while only its thumbnail had come, which is drawn still. It is read
 *   again once it has come whole and the board is drawn for that.
 */
type Unanswered =
  | { readonly kind: 'resting'; readonly since: number; wake: ReturnType<typeof setTimeout> | null }
  | { readonly kind: 'awaitingWhole' };

/**
 * Remembers which pictures move.
 *
 * The answer is in the bytes rather than in anything the storehouse knows, so it is read
 * once per picture and kept. Until it is read a picture is taken as still, and whatever
 * asked is told again when an answer is kept.
 *
 * Every GIF is taken as moving, one image or many: the boards saved so far left every GIF out of the
 * picture they wear and hang it over the board, and a GIF told still now would be drawn nowhere.
 *
 * Only an answer actually read from the whole picture's bytes is kept. A read that keeps none leaves
 * the picture with one way to be read again, settled in `leaveUnanswered`: remembering "still" for
 * those would leave a moving picture neither hung nor painted, since the board leaves what moves out
 * of the picture it wears. The service reads such a picture again by itself rather than telling the
 * board to ask, so a read that fails again tells nobody, and no two unreadable pictures wake each
 * other on a clock.
 */
@Injectable({ providedIn: 'root' })
export class AnimatedImageService {
  private readonly imageStorage = inject(ImageStorage);
  private readonly answers = signal<ReadonlyMap<string, boolean>>(new Map());
  /** The reads under way: one reading is enough, and whoever else asks in the meantime waits for it. */
  private readonly asking = new Map<string, Promise<boolean>>();
  private readonly unanswered = new Map<string, Unanswered>();

  /**
   * Whether a picture moves, answered at once from what is known.
   *
   * An unknown picture answers false and starts reading its bytes. The answer is kept in a signal,
   * so a template or computed that asked hears again once the bytes are read.
   *
   * A picture at rest after a failed read is not read; asked during the rest, as the board is drawn
   * again, it is read once the rest is over. One read from its thumbnail is not read again while only
   * the thumbnail is held.
   */
  isAnimated(identifier: string): boolean {
    const known = this.answers().get(identifier);
    if (known !== undefined) return known;
    const left = this.unanswered.get(identifier);
    if (left?.kind === 'resting' && Date.now() - left.since < READ_AGAIN_AFTER_MS) {
      this.wakeAfterRest(identifier, left);
      return false;
    }
    if (left?.kind === 'awaitingWhole' && this.onlyThumbnail(identifier)) return false;
    void this.probe(identifier);
    return false;
  }

  /**
   * Finds out whether a picture moves by reading its bytes as far as they say, once however many ask.
   *
   * It reads whatever rest the picture is at, for one that asks to know, as the editor saving the
   * board. A picture whose bytes cannot be read answers false without that being kept as its answer.
   */
  probe(identifier: string): Promise<boolean> {
    const known = this.answers().get(identifier);
    if (known !== undefined) return Promise.resolve(known);
    const asked = this.asking.get(identifier);
    if (asked) return asked;

    const reading: Promise<boolean> = this.read(identifier).finally(() => {
      if (this.asking.get(identifier) === reading) this.asking.delete(identifier);
    });
    this.asking.set(identifier, reading);
    return reading;
  }

  private async read(identifier: string): Promise<boolean> {
    const fromThumbnail = this.onlyThumbnail(identifier);
    let animated: boolean;
    try {
      const blob = await this.blobOf(identifier);
      if (!blob || blob.size < 1) return false;
      const head = await blob.slice(0, GIF_HEAD_BYTES).arrayBuffer();
      animated =
        isGifBytes(head) || (await readWhetherMoves((length) => blob.slice(0, length).arrayBuffer(), blob.size));
    } catch {
      this.leaveUnanswered(identifier, 'unreadable');
      return false;
    }
    if (fromThumbnail) {
      this.leaveUnanswered(identifier, 'thumbnail');
      return animated;
    }
    this.forget(identifier);
    this.answers.update((current) => new Map(current).set(identifier, animated));
    return animated;
  }

  /**
   * Settles how a picture read without a kept answer is read again; every such read ends here.
   *
   * - Unreadable: it rests. After its first failure in a row the service reads it again once the
   *   rest is over; after a later one, only if the board asks during the rest, or had asked during
   *   the rest before it, as when the editor saving the board read it in the meantime.
   * - Read from its thumbnail: if it came whole while it was read, it is read again at once, as the
   *   board, drawn for its coming while the read was under way, was handed that read; otherwise it
   *   awaits coming whole.
   */
  private leaveUnanswered(identifier: string, why: 'unreadable' | 'thumbnail'): void {
    const before = this.unanswered.get(identifier);
    const pending = before?.kind === 'resting' ? before.wake : null;
    if (pending !== null) clearTimeout(pending);
    if (why === 'unreadable') {
      const rest: Unanswered = { kind: 'resting', since: Date.now(), wake: null };
      this.unanswered.set(identifier, rest);
      if (before?.kind !== 'resting' || pending !== null) this.wakeAfterRest(identifier, rest);
      return;
    }
    if (this.onlyThumbnail(identifier)) {
      this.unanswered.set(identifier, { kind: 'awaitingWhole' });
      return;
    }
    this.unanswered.delete(identifier);
    this.asking.delete(identifier);
    void this.probe(identifier);
  }

  /** Sets the one clock that reads a resting picture again once its rest is over, unless one is set. */
  private wakeAfterRest(identifier: string, rest: Extract<Unanswered, { kind: 'resting' }>): void {
    if (rest.wake !== null) return;
    const left = Math.max(0, rest.since + READ_AGAIN_AFTER_MS - Date.now());
    rest.wake = setTimeout(() => {
      rest.wake = null;
      if (this.unanswered.get(identifier) === rest) void this.probe(identifier);
    }, left + 1);
  }

  /** Drops what was left of a picture once its answer is kept. */
  private forget(identifier: string): void {
    const left = this.unanswered.get(identifier);
    if (left?.kind === 'resting' && left.wake !== null) clearTimeout(left.wake);
    this.unanswered.delete(identifier);
  }

  private onlyThumbnail(identifier: string): boolean {
    return this.imageStorage.get(identifier)?.state === ImageState.THUMBNAIL;
  }

  /**
   * The bytes of a picture, fetched whole, as its URL hands them out; null for a picture not held.
   * A response other than a success, as a host refusing for a while, throws, so it is not read as a picture.
   */
  private async blobOf(identifier: string): Promise<Blob | null> {
    const file = this.imageStorage.get(identifier);
    const url = file?.url ?? '';
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The picture was refused (${response.status}).`);
    return response.blob();
  }
}
