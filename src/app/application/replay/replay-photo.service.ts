import { inject, Injectable } from '@angular/core';
import { Logger } from '@axe/core/logging/logger';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { downloadBlob } from '@axe/core/util/download-blob';
import type { ReplayCastMember } from '@axe/domain/replay/replay-cast';
import { buildTablePhotoLayout } from '@axe/domain/replay/table-photo';
import { type DrawableImage, loadDrawableImages } from '@axe/infrastructure/replay/drawable-image';
import { paintTablePhoto } from '@axe/infrastructure/replay/table-photo-painter';

export interface TablePhotoRequest {
  cast: readonly ReplayCastMember[];
  roomName: string;
  /** The line burnt in under the heading. How the date reads follows the interface language, so the caller decides. */
  subtitle: string;
  fileName: string;
}

export interface TablePhotoResult {
  saved: boolean;
  /** How many did not fit on the sheet. */
  omitted: number;
}

/**
 * A keepsake photograph of the table.
 *
 * It loads the portraits from this browser and hands back a single png.
 * A piece whose picture is gone keeps its frame and name: leaving it out would erase that it was there.
 */
@Injectable({ providedIn: 'root' })
export class ReplayPhotoService {
  private readonly imageStorage = inject(ImageStorage);

  /**
   * Draws the cast into a single picture and hands it to the browser to download as a png.
   *
   * Nothing is saved when there is nobody to draw or the browser cannot draw it. `omitted` says how
   * many did not fit either way.
   */
  async save(request: TablePhotoRequest): Promise<TablePhotoResult> {
    const layout = buildTablePhotoLayout(
      request.cast.map((member) => ({
        identifier: member.identifier,
        name: member.name,
        imageIdentifier: member.imageIdentifier,
      }))
    );
    if (layout.cells.length < 1) return { saved: false, omitted: 0 };

    const images = await this.loadImages(layout.cells.map((cell) => cell.imageIdentifier));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = layout.width;
      canvas.height = layout.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { saved: false, omitted: layout.omitted };

      paintTablePhoto(
        ctx,
        layout,
        { imageOf: (identifier) => images.get(identifier) ?? null },
        request.roomName,
        request.subtitle
      );

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), 'image/png'));
      if (!blob) return { saved: false, omitted: layout.omitted };

      downloadBlob(blob, `${request.fileName}.png`);
      return { saved: true, omitted: layout.omitted };
    } finally {
      // Loaded images are always released; a failed drawing is exactly when they would otherwise pile up.
      for (const image of images.values()) image.close?.();
    }
  }

  private loadImages(identifiers: readonly string[]): Promise<Map<string, DrawableImage>> {
    return loadDrawableImages(this.imageStorage, identifiers, (identifier, reason) =>
      Logger.warn('[TablePhoto] 絵を読めませんでした', identifier, reason)
    );
  }
}
