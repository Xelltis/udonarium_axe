import { Injectable, signal } from '@angular/core';
import { mirroredPictureUrl } from '@axe/infrastructure/image/mirrored-picture';

/**
 * The pictures of fighters turned left for right, each made once and kept for the session, for the
 * effects that cut a fighter's picture apart and move the pieces, which a mirrored figure would
 * otherwise come apart unmirrored in.
 */
@Injectable({ providedIn: 'root' })
export class MirroredPictureService {
  private readonly made = signal<ReadonlyMap<string, string>>(new Map());
  private readonly asked = new Set<string>();

  /**
   * The picture at a url turned left for right; empty until it has been made, and for one that
   * cannot be. Asking starts the making, and the answer changes as it is done.
   */
  of(url: string): string {
    const made = this.made().get(url);
    if (made !== undefined) return made;
    if (url.length > 0 && !this.asked.has(url)) {
      this.asked.add(url);
      void mirroredPictureUrl(url).then((mirrored) =>
        this.made.update((held) => new Map(held).set(url, mirrored ?? ''))
      );
    }
    return '';
  }
}
