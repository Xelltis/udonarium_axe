import { inject, Injectable, signal } from '@angular/core';
import { isAnimatedImageBytes } from '@axe/core/storage/animated-image';
import { ImageStorage } from '@axe/core/storage/image-storage';

/** How much of a file has to be read to find out whether it moves. */
const HEAD_BYTES = 64 * 1024;

/**
 * Remembers which pictures move.
 *
 * The answer is in the bytes rather than in anything the storehouse knows, so it is read
 * once per picture and kept. Until it is read a picture is taken as still, and whatever
 * asked is told again when the bytes come back.
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

  /**
   * Whether a picture moves, answered at once from what is known.
   *
   * An unknown picture answers false and starts reading its bytes. The answer is kept in a signal,
   * so a template or computed that asked hears again once the bytes are read.
   */
  isAnimated(identifier: string): boolean {
    const known = this.answers().get(identifier);
    if (known !== undefined) return known;
    void this.probe(identifier);
    return false;
  }

  /**
   * Finds out whether a picture moves by reading the start of its bytes, once however many ask.
   *
   * A picture that cannot be read yet answers false without that being remembered, so it is read
   * again next time.
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
    let head: ArrayBuffer;
    try {
      head = await this.headOf(identifier);
    } catch {
      // Unreadable for now; the picture is drawn as it always was and asked about again later.
      return false;
    }
    if (head.byteLength < 1) return false;

    const animated = isAnimatedImageBytes(head);
    this.answers.update((current) => new Map(current).set(identifier, animated));
    return animated;
  }

  private async headOf(identifier: string): Promise<ArrayBuffer> {
    const file = this.imageStorage.get(identifier);
    const url = file?.url ?? '';
    if (!url) return new ArrayBuffer(0);
    const response = await fetch(url);
    const blob = await response.blob();
    return blob.slice(0, HEAD_BYTES).arrayBuffer();
  }
}
