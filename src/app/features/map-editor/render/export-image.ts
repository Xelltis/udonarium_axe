import { isTextureId, TEXTURE_ASSET_URLS } from '@axe/domain/media/texture-catalog';
import { imageStampIdentifier, isImageStampId } from '@axe/features/map-editor/assets/image-stamp';
import { StampDef } from '@axe/features/map-editor/assets/stamp-types';
import {
  FillStyle,
  ImageItem,
  ImageLayer,
  MapScene,
  sceneHeightPx,
  sceneWidthPx,
  StampItem,
  StampLayer,
} from '@axe/features/map-editor/model/scene';
import { imageTextureIdentifier, isImageTextureId, normalizeTextureId } from '@axe/features/map-editor/model/textures';
import { getRasterImage, warmRasterImages } from '@axe/features/map-editor/render/raster-image';
import { RenderHelpers, renderScene } from '@axe/features/map-editor/render/render-scene';
import { getStampImage, warmStampImages } from '@axe/features/map-editor/render/stamp-image';
import { createImageTexturePattern } from '@axe/features/map-editor/render/texture-pattern';

const MAX_SIDE = 8192;

interface ExportOptions {
  scale?: number;
  drawGrid?: boolean;
  mimeType?: string;
  quality?: number;
  resolveImageUrl?: (id: string) => string | null;
}

function collectStampItems(scene: MapScene): StampItem[] {
  const items: StampItem[] = [];
  for (const layer of scene.layers) {
    if (layer.kind === 'stamp') items.push(...(layer as StampLayer).items);
  }
  return items;
}

function collectImageItems(scene: MapScene): ImageItem[] {
  const items: ImageItem[] = [];
  for (const layer of scene.layers) {
    if (layer.kind === 'image') items.push(...(layer as ImageLayer).items);
  }
  return items;
}

function fillTextureIdentifier(fill: FillStyle | null | undefined, out: Set<string>): void {
  if (fill && fill.type === 'texture' && isImageTextureId(fill.textureId)) {
    out.add(imageTextureIdentifier(fill.textureId));
  }
}

function collectImageTextureIdentifiers(scene: MapScene): string[] {
  const ids = new Set<string>();
  for (const layer of scene.layers) {
    if (layer.kind === 'cell') {
      for (const fill of Object.values(layer.cells)) fillTextureIdentifier(fill, ids);
    } else if (layer.kind === 'shape') {
      for (const item of layer.items) {
        fillTextureIdentifier(item.fill, ids);
        fillTextureIdentifier(item.stroke?.fill, ids);
      }
    }
  }
  return [...ids];
}

function fillBuiltinTextureUrl(fill: FillStyle | null | undefined, out: Set<string>): void {
  if (!fill || fill.type !== 'texture') return;
  const id = normalizeTextureId(fill.textureId);
  if (isTextureId(id)) out.add(TEXTURE_ASSET_URLS[id]);
}

function collectBuiltinTextureUrls(scene: MapScene): string[] {
  const urls = new Set<string>();
  for (const layer of scene.layers) {
    if (layer.kind === 'cell') {
      for (const fill of Object.values(layer.cells)) fillBuiltinTextureUrl(fill, urls);
    } else if (layer.kind === 'shape') {
      for (const item of layer.items) {
        fillBuiltinTextureUrl(item.fill, urls);
        fillBuiltinTextureUrl(item.stroke?.fill, urls);
      }
    }
  }
  return [...urls];
}

function clampScale(scene: MapScene, requested: number): number {
  const width = sceneWidthPx(scene);
  const height = sceneHeightPx(scene);
  const longest = Math.max(width, height) || 1;
  const scale = requested > 0 ? requested : 1;
  if (longest * scale <= MAX_SIDE) return scale;
  return MAX_SIDE / longest;
}

interface OffscreenTarget {
  ctx: CanvasRenderingContext2D;
  toBlob(mimeType: string, quality: number): Promise<Blob | null>;
}

function createTarget(width: number, height: number): OffscreenTarget | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return {
      ctx: ctx as CanvasRenderingContext2D,
      toBlob: (mimeType, quality) =>
        new Promise<Blob | null>((resolve) => {
          if (typeof canvas.toBlob !== 'function') {
            resolve(null);
            return;
          }
          canvas.toBlob((blob) => resolve(blob), mimeType, quality);
        }),
    };
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    return {
      ctx,
      toBlob: (mimeType, quality) => {
        if (typeof canvas.convertToBlob !== 'function') return Promise.resolve(null);
        return canvas.convertToBlob({ type: mimeType, quality }).catch(() => null);
      },
    };
  }
  return null;
}

/**
 * Draws the whole map into an image file for exporting.
 *
 * Every stamp, picture and texture is loaded first, so nothing is left out of the image. The image
 * is scaled down where its longest side would pass 8192px. WebP is asked for unless told otherwise,
 * and PNG is made where the browser cannot make the type asked for.
 */
export async function exportSceneToBlob(scene: MapScene, defs: StampDef[], opts: ExportOptions = {}): Promise<Blob> {
  const scale = clampScale(scene, opts.scale ?? 1);
  const outW = Math.max(1, Math.round(sceneWidthPx(scene) * scale));
  const outH = Math.max(1, Math.round(sceneHeightPx(scene) * scale));

  const target = createTarget(outW, outH);
  if (!target) throw new Error('2D canvas context unavailable');

  await warmStampImages(
    collectStampItems(scene).map((item) => ({ stampId: item.stampId, size: item.size, color: item.color })),
    defs
  );

  const resolveImageUrl = opts.resolveImageUrl;
  const builtinUrls = collectBuiltinTextureUrls(scene);
  if (resolveImageUrl) {
    const identifiers = [
      ...collectImageItems(scene).map((item) => item.imageIdentifier),
      ...collectImageTextureIdentifiers(scene),
      ...collectStampItems(scene)
        .filter((item) => isImageStampId(item.stampId))
        .map((item) => imageStampIdentifier(item.stampId)),
    ];
    const urls = identifiers
      .map((identifier) => resolveImageUrl(identifier))
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
    await warmRasterImages([...urls, ...builtinUrls]);
  } else if (builtinUrls.length > 0) {
    await warmRasterImages(builtinUrls);
  }

  const defById = new Map(defs.map((def) => [def.id, def]));
  const helpers: RenderHelpers = {
    texturePattern: (fill, cellPx) => {
      if (isImageTextureId(fill.textureId)) {
        if (!resolveImageUrl) return null;
        const url = resolveImageUrl(imageTextureIdentifier(fill.textureId));
        const image = url ? getRasterImage(url) : null;
        return image ? createImageTexturePattern(target.ctx, image, cellPx, fill.scale, fill.rotation) : null;
      }
      const id = normalizeTextureId(fill.textureId);
      if (!isTextureId(id)) return null;
      const image = getRasterImage(TEXTURE_ASSET_URLS[id]);
      return image ? createImageTexturePattern(target.ctx, image, cellPx, fill.scale, fill.rotation) : null;
    },
    stampImage: (item) => {
      if (isImageStampId(item.stampId)) {
        if (!resolveImageUrl) return null;
        const url = resolveImageUrl(imageStampIdentifier(item.stampId));
        return url ? getRasterImage(url) : null;
      }
      const def = defById.get(item.stampId);
      return def ? getStampImage(def, item.size, item.color) : null;
    },
    rasterImage: (item) => {
      if (!resolveImageUrl) return null;
      const url = resolveImageUrl(item.imageIdentifier);
      return url ? getRasterImage(url) : null;
    },
  };

  target.ctx.save();
  target.ctx.scale(scale, scale);
  renderScene(target.ctx, scene, helpers, { drawGrid: opts.drawGrid });
  target.ctx.restore();

  const mimeType = opts.mimeType ?? 'image/webp';
  const quality = opts.quality ?? 0.92;
  const preferred = await target.toBlob(mimeType, quality);
  if (preferred && (preferred.type === mimeType || mimeType !== 'image/webp')) return preferred;
  const png = await target.toBlob('image/png', quality);
  if (png) return png;
  if (preferred) return preferred;
  throw new Error('canvas toBlob produced no output');
}
