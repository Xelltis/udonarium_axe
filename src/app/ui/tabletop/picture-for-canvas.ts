import { afterRenderEffect, DestroyRef, inject } from '@angular/core';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { pictureOfElement, PictureRegion } from '@axe/infrastructure/image/element-picture';

/** A part of a piece the page lays out itself, for the canvas to draw the piece from a picture of. */
export interface PictureForCanvas {
  /** The piece the picture is of. */
  readonly identifier: () => string;
  /** The part of the page to picture, once it is there. */
  readonly element: () => HTMLElement | undefined;
  /** Whether the canvas is to draw the piece from a picture now; while not, the canvas has none of it. */
  readonly pictured: () => boolean;
  /** Reads everything the part's look follows, so that it is pictured again whenever any of it changes. */
  readonly follows: () => void;
  /**
   * The region of the part to picture, in its own pixels, which is also where the picture lies off
   * the piece's own corner: for a part whose drawing overflows a box of no size. Its own box where
   * not given.
   */
  readonly region?: (element: HTMLElement) => PictureRegion | null;
}

/**
 * Has the canvas draw a piece from a picture of a part of it the page lays out, taken once the page
 * has laid the part out, and again after the page lays it out anew for a change of what it looks
 * like or of the theme. The picture is taken back once the piece is gone, or while it is not to be
 * pictured. Must be called in an injection context.
 */
export function pictureForCanvas(part: PictureForCanvas): void {
  const pictures = inject(PiecePicturesService);
  const theme = inject(ThemeService);
  /** The latest picture asked for, which alone is handed over once it is taken. */
  let asked = 0;
  let handed: string | null = null;
  const takeBack = () => {
    asked++;
    if (handed) pictures.forget(handed);
    handed = null;
  };
  afterRenderEffect({
    read: () => {
      if (!part.pictured()) {
        takeBack();
        return;
      }
      const identifier = part.identifier();
      part.follows();
      theme.resolved();
      const element = part.element();
      if (!element) return;
      const region = part.region
        ? part.region(element)
        : { left: 0, top: 0, width: element.offsetWidth, height: element.offsetHeight };
      if (!region) return;
      const ask = ++asked;
      void pictureOfElement(element, region).then((picture) => {
        if (ask !== asked || !picture) return;
        if (handed && handed !== identifier) pictures.forget(handed);
        handed = identifier;
        pictures.show(identifier, {
          url: URL.createObjectURL(picture),
          widthPx: region.width,
          heightPx: region.height,
          offsetX: region.left,
          offsetY: region.top,
        });
      });
    },
  });
  inject(DestroyRef).onDestroy(takeBack);
}
