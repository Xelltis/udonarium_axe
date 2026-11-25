import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { ImageFile } from '@axe/core/storage/image-file';

/** The kinds of picture that can move, an APNG being a PNG: only these are given URLs of their own. */
const MAY_MOVE = /^image\/(png|apng|gif|webp|avif)$/;

/**
 * URLs of their own for the pictures one showing shows, as a cut-in opened: each picture held here in
 * full is shown from a URL made for this showing alone, so that a moving picture that plays a set
 * number of times, an APNG or a GIF, plays from its start each time it is shown, as the browser keeps
 * one that played through at its last frame under the URL it was shown from.
 *
 * Provided where showings are made, and let go of with it: a cut-in window holds one showing, and a
 * stage that shows one after another names each (see {@link urlOf}) or begins the next (see
 * {@link beginShowing}). A picture whose bytes are not held here, or of a kind that never moves, is
 * shown from its own URL. A picture whose bytes change, as its full bytes come after its thumbnail,
 * is given a new URL for them.
 */
@Injectable()
export class ShownPictureUrls {
  private readonly made = new Map<string, { readonly blob: Blob; readonly url: string }>();
  private readonly begun = signal(0);
  private showing: unknown = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.letGo());
  }

  /** Lets go of the URLs made so far, and gives the pictures shown from here on URLs of their own. */
  beginShowing(): void {
    this.letGo();
    this.begun.update((count) => count + 1);
  }

  /**
   * The URL a picture is shown from in this showing: one made for it here, the same each time it is
   * asked while its bytes stay the same. Asked for another `showing` than the last, as a stage names
   * the scene it plays, the URLs of the one before are let go of first.
   */
  urlOf(image: ImageFile | null | undefined, showing: unknown = null): string {
    this.begun();
    if (showing !== this.showing) {
      this.letGo();
      this.showing = showing;
    }
    if (!image) return '';
    const blob = image.blob;
    if (!blob || (blob.type !== '' && !MAY_MOVE.test(blob.type))) return image.url;
    const held = this.made.get(image.identifier);
    if (held?.blob === blob) return held.url;
    if (held) URL.revokeObjectURL(held.url);
    const url = URL.createObjectURL(blob);
    this.made.set(image.identifier, { blob, url });
    return url;
  }

  private letGo(): void {
    for (const { url } of this.made.values()) URL.revokeObjectURL(url);
    this.made.clear();
  }
}
