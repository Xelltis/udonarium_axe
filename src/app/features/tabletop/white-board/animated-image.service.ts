import { inject, Injectable, signal } from '@angular/core';
import { isGifBytes, READ_AGAIN_AFTER_MS, readWhetherMoves } from '@axe/core/storage/animated-image';
import { ImageState } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';

/** How much of a file tells whether it is a GIF. */
const GIF_HEAD_BYTES = 6;

/**
 * Remembers which pictures move.
 *
 * The answer is in the bytes rather than in anything the storehouse knows, so it is read
 * once per picture and kept. Until it is read a picture is taken as still, and whatever
 * asked is told again when the bytes come back.
 *
 * Every GIF is taken as moving, one image or many: the boards saved so far left every GIF out of the
 * picture they wear and hang it over the board, and a GIF told still now would be drawn nowhere.
 *
 * Only an answer actually read from bytes is kept. A picture still on its way from another
 * peer, or one whose bytes cannot be fetched, is left unanswered and asked about again:
 * remembering "still" for those would leave a moving picture neither hung nor painted, since
 * the board leaves what moves out of the picture it wears.
 */
@Injectable({ providedIn: 'root' })
export class AnimatedImageService {
  private readonly imageStorage = inject(ImageStorage);
  private readonly answers = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly asking = new Map<string, Promise<boolean>>();
  /** When each picture that could not be read last failed, so it is not read again before a while has passed. */
  private readonly failedAt = new Map<string, number>();
  /** The pictures read while only their thumbnail had come, not read again until they come whole. */
  private readonly readFromThumbnail = new Set<string>();

  /**
   * Whether a picture moves, answered at once from what is known.
   *
   * An unknown picture answers false and starts reading its bytes. The answer is kept in a signal,
   * so a template or computed that asked hears again once the bytes are read.
   */
  isAnimated(identifier: string): boolean {
    const known = this.answers().get(identifier);
    if (known !== undefined) return known;
    const failed = this.failedAt.get(identifier);
    if (failed !== undefined && Date.now() - failed < READ_AGAIN_AFTER_MS) return false;
    if (this.readFromThumbnail.has(identifier) && this.imageStorage.get(identifier)?.state === ImageState.THUMBNAIL) {
      return false;
    }
    void this.probe(identifier);
    return false;
  }

  /**
   * Finds out whether a picture moves by reading its bytes as far as they say, once however many ask.
   *
   * A picture whose bytes cannot be read answers false without that being remembered as its answer;
   * the board, drawn again and again, asks of it again only after a while (see `isAnimated`), while
   * one that asks to know, as the editor saving the board, reads it every time. The board asks again
   * by itself once, after its first failure; after that, as it is drawn again, so a picture that never
   * reads, as one a host keeps from other pages, is not asked for on a clock. Nor is the answer read
   * while only its thumbnail had come kept, as a thumbnail is drawn still: the board asks no more of
   * it until it has come whole.
   */
  probe(identifier: string): Promise<boolean> {
    const known = this.answers().get(identifier);
    if (known !== undefined) return Promise.resolve(known);
    // One reading is enough; whoever else asks in the meantime waits for the same one.
    const asked = this.asking.get(identifier);
    if (asked) return asked;

    const reading = this.read(identifier).finally(() => this.asking.delete(identifier));
    this.asking.set(identifier, reading);
    return reading;
  }

  private async read(identifier: string): Promise<boolean> {
    const fromThumbnail = this.imageStorage.get(identifier)?.state === ImageState.THUMBNAIL;
    let animated: boolean;
    try {
      const blob = await this.blobOf(identifier);
      if (!blob || blob.size < 1) return false;
      const head = await blob.slice(0, GIF_HEAD_BYTES).arrayBuffer();
      animated =
        isGifBytes(head) || (await readWhetherMoves((length) => blob.slice(0, length).arrayBuffer(), blob.size));
    } catch {
      // Unreadable for now; the picture is drawn as it always was and asked about again after a while.
      const firstFailure = !this.failedAt.has(identifier);
      this.failedAt.set(identifier, Date.now());
      if (firstFailure) setTimeout(() => this.answers.update((current) => new Map(current)), READ_AGAIN_AFTER_MS + 1);
      return false;
    }
    this.failedAt.delete(identifier);
    if (fromThumbnail) {
      this.readFromThumbnail.add(identifier);
      return animated;
    }
    this.readFromThumbnail.delete(identifier);
    this.answers.update((current) => new Map(current).set(identifier, animated));
    return animated;
  }

  /** The bytes of a picture, fetched whole, as its URL hands them out; null for a picture not held. */
  private async blobOf(identifier: string): Promise<Blob | null> {
    const file = this.imageStorage.get(identifier);
    const url = file?.url ?? '';
    if (!url) return null;
    const response = await fetch(url);
    return response.blob();
  }
}
