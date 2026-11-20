import { inject, Injectable } from '@angular/core';
import { PictureSizeService } from '@axe/application/media/picture-size.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import type { CutIn } from '@axe/domain/media/cut-in';

type Shape = { width: number; height: number };

/**
 * How a cut-in is sized, for the cut-in editor and the AI link alike, so the two never size one
 * differently: by a side, its aspect kept or not; on keeping its aspect; on turning into a video or
 * back; on original size; on a new picture. The proportions kept are the cut-in's own, a video's
 * default size or its picture's own size (`CutIn.ownShape`, `PictureSizeService`), and where the
 * picture has not been read yet, the cut-in is sized once it has, as it then stands.
 */
@Injectable({ providedIn: 'root' })
export class CutInSizingService {
  private readonly pictures = inject(PictureSizeService);
  private readonly objectStore = inject(ObjectStore);

  /** The proportions the cut-in keeps as it stands, null where its picture has not been read yet. */
  shapeOf(cutIn: CutIn): Shape | null {
    return cutIn.ownShape(this.pictures.sizeOf(cutIn.cutInImage.url));
  }

  /**
   * Sizes the cut-in by one side, the other following its own proportions while it keeps its aspect
   * and they are known, as `CutIn.resizeSide` holds both to the bounds; a side that is no number
   * changes nothing.
   */
  resize(cutIn: CutIn, side: 'width' | 'height', value: number): void {
    cutIn.resizeSide(side, value, cutIn.keepImageAspect ? this.shapeOf(cutIn) : null);
  }

  /** Keeps the cut-in's aspect or stops keeping it; kept, its height follows its width at its own proportions. */
  keepAspect(cutIn: CutIn, keep: boolean): void {
    cutIn.keepImageAspect = keep;
    if (keep) this.snapWhileKept(cutIn);
  }

  /**
   * Makes a change that may turn the cut-in into a video or back into a picture, and sizes it to its
   * new kind where it does: a video to a video's default size, a picture to the picture (see
   * {@link fitPicture}).
   */
  changeKind(cutIn: CutIn, write: () => void): void {
    const wasVideo = cutIn.playsVideo;
    write();
    if (wasVideo === cutIn.playsVideo) return;
    if (cutIn.playsVideo) cutIn.setSize(cutIn.defVideoSizeWidth, cutIn.defVideoSizeHeight);
    else this.fitPicture(cutIn);
  }

  /** Shows the cut-in at its own size or not; at its own size, it is sized to it (see {@link fitOwn}). */
  setOriginalSize(cutIn: CutIn, original: boolean): void {
    cutIn.originalSize = original;
    this.fitOwn(cutIn);
  }

  /**
   * Shows a new picture on the cut-in, sized to it where the cut-in is shown at its own size or keeps
   * its aspect (see {@link fitPicture}).
   */
  setPicture(cutIn: CutIn, identifier: string): void {
    if (cutIn.imageIdentifier === identifier) return;
    cutIn.imageIdentifier = identifier;
    if (cutIn.originalSize) this.fitOwn(cutIn);
    else if (cutIn.keepImageAspect) this.snapWhileKept(cutIn);
  }

  /** Writes the cut-in's own size onto it while it is shown at its own size, which its bounds do not hold. */
  fitOwn(cutIn: CutIn): void {
    if (!cutIn.originalSize) return;
    this.whenShaped(cutIn, (shape) => {
      if (cutIn.originalSize) cutIn.fitOwnSize(shape.width, shape.height);
    });
  }

  /**
   * Sizes a picture cut-in to its picture: at original size its own size as it is, and otherwise its
   * proportions at the picture's width, held to a picture's bounds.
   */
  private fitPicture(cutIn: CutIn): void {
    this.whenShaped(cutIn, (shape) => {
      if (cutIn.playsVideo) return;
      if (cutIn.originalSize) cutIn.fitOwnSize(shape.width, shape.height);
      else cutIn.resizeSide('width', shape.width, shape);
    });
  }

  /** Has the height follow the width the cut-in has at its own proportions, while it still keeps its aspect. */
  private snapWhileKept(cutIn: CutIn): void {
    this.whenShaped(cutIn, (shape) => {
      if (cutIn.keepImageAspect) cutIn.resizeSide('width', cutIn.width, shape);
    });
  }

  /**
   * Does what sizing a cut-in takes with its own proportions: at once where they are known, and
   * otherwise once its picture has been read, where the cut-in is still in the room and shows the same
   * picture; nothing for a picture cut-in with no picture.
   */
  private whenShaped(cutIn: CutIn, then: (shape: Shape) => void): void {
    const shape = this.shapeOf(cutIn);
    if (shape) {
      then(shape);
      return;
    }
    const url = cutIn.cutInImage.url;
    if (!url) return;
    void this.pictures.read(url).then(() => {
      if (this.objectStore.get(cutIn.identifier) !== cutIn || cutIn.cutInImage.url !== url) return;
      const read = this.shapeOf(cutIn);
      if (read) then(read);
    });
  }
}
