import { signal } from '@angular/core';
import { imageStampIdentifier, isImageStampId } from '@axe/domain/map-editor/image-stamp';
import { StampDef } from '@axe/domain/map-editor/stamp-types';
import { STAMPS } from '@axe/domain/map-editor/stamps';
import { imageTextureIdentifier, isImageTextureId, normalizeTextureId } from '@axe/domain/map-editor/textures';
import { isTextureId, TEXTURE_ASSET_URLS } from '@axe/domain/media/texture-catalog';
import { getRasterImage } from '@axe/infrastructure/map-editor/raster-image';
import { RenderHelpers } from '@axe/infrastructure/map-editor/render-scene';
import { getStampImage, loadStampImage } from '@axe/infrastructure/map-editor/stamp-image';
import { createImageTexturePattern } from '@axe/infrastructure/map-editor/texture-pattern';

const STAMP_BY_ID: ReadonlyMap<string, StampDef> = new Map(STAMPS.map((def) => [def.id, def]));

/**
 * The pictures a map editor draws with: the textures cells are filled with, the stamps and the
 * placed images.
 *
 * A picture that is not loaded yet is drawn as nothing and fetched, and `tick` moves once it has
 * arrived, so whatever reads it draws the board again with the picture in it.
 */
export class MapEditorImageCache {
  private readonly arrivals = signal(0);
  private readonly pendingStamps = new Set<string>();
  private readonly pendingImages = new Set<string>();

  /** Moves each time a picture asked for before it was loaded has arrived. */
  readonly tick = this.arrivals.asReadonly();

  /**
   * @param urlOf Where a picture kept in the room's image store is, by its identifier.
   * @param loadImage Fetches a picture from where it is.
   */
  constructor(
    private readonly urlOf: (identifier: string) => string | undefined,
    private readonly loadImage: (url: string) => Promise<HTMLImageElement>
  ) {}

  /** What the scene renderer draws textures, stamps and placed images with on a canvas. */
  helpersFor(ctx: CanvasRenderingContext2D): RenderHelpers {
    return {
      texturePattern: (fill, cellPx) => {
        const url = this.textureUrlOf(fill.textureId);
        const image = url ? this.picture(url) : null;
        return image ? createImageTexturePattern(ctx, image, cellPx, fill.scale, fill.rotation) : null;
      },
      stampImage: (item) => this.stamp(item.stampId, item.size, item.color),
      rasterImage: (item) => this.image(item.imageIdentifier),
    };
  }

  /** A stamp drawn at a size and in a colour, or null until it has loaded. */
  stamp(stampId: string, size: number, color: string | null): HTMLImageElement | null {
    if (isImageStampId(stampId)) return this.image(imageStampIdentifier(stampId));
    const def = STAMP_BY_ID.get(stampId);
    if (!def) return null;
    const image = getStampImage(def, size, color);
    if (!image) this.fetchStamp(def, size, color);
    return image;
  }

  /** A picture kept in the room's image store, or null until it has loaded or where there is none. */
  image(identifier: string): HTMLImageElement | null {
    const url = this.urlOf(identifier);
    return url ? this.picture(url) : null;
  }

  private textureUrlOf(textureId: string): string | null {
    if (isImageTextureId(textureId)) return this.urlOf(imageTextureIdentifier(textureId)) ?? null;
    const id = normalizeTextureId(textureId);
    return isTextureId(id) ? TEXTURE_ASSET_URLS[id] : null;
  }

  private picture(url: string): HTMLImageElement | null {
    const image = getRasterImage(url);
    if (!image) this.fetchPicture(url);
    return image;
  }

  private fetchStamp(def: StampDef, size: number, color: string | null): void {
    const key = def.id + '|' + size + '|' + (color ?? '');
    if (this.pendingStamps.has(key)) return;
    this.pendingStamps.add(key);
    loadStampImage(def, size, color)
      .then(() => {
        this.pendingStamps.delete(key);
        this.arrivals.update((v) => v + 1);
      })
      .catch(() => this.pendingStamps.delete(key));
  }

  private fetchPicture(url: string): void {
    if (this.pendingImages.has(url)) return;
    this.pendingImages.add(url);
    this.loadImage(url)
      .then(() => {
        this.pendingImages.delete(url);
        this.arrivals.update((v) => v + 1);
      })
      .catch(() => this.pendingImages.delete(url));
  }
}
