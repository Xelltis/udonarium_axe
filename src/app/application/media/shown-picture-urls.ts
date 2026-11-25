import { DestroyRef, inject, Injectable } from '@angular/core';
import type { ImageFile } from '@axe/core/storage/image-file';

/**
 * URLs of their own for the pictures one showing shows, as a cut-in opened: each picture held here in
 * full is shown from a URL made for this showing alone, so that a moving picture that plays a set
 * number of times, an APNG or a GIF, plays from its start each time it is shown, as the browser keeps
 * one that played through at its last frame under the URL it was shown from. Provided where a showing
 * begins, and let go of with it. A picture whose bytes are not held here is shown from its own URL.
 */
@Injectable()
export class ShownPictureUrls {
  private readonly made = new Map<string, string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.made.values()) URL.revokeObjectURL(url);
      this.made.clear();
    });
  }

  /** The URL a picture is shown from in this showing: one made for it here, the same each time it is asked. */
  urlOf(image: ImageFile | null | undefined): string {
    if (!image) return '';
    const blob = image.blob;
    if (!blob) return image.url;
    let url = this.made.get(image.identifier);
    if (url === undefined) {
      url = URL.createObjectURL(blob);
      this.made.set(image.identifier, url);
    }
    return url;
  }
}
