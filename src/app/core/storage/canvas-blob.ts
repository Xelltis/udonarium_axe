/**
 * Encodes a canvas as a blob of the given type, resolving null where the canvas
 * cannot encode, as outside a browser.
 *
 * A browser that cannot write the type hands back PNG instead, so check the type of the result.
 */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/** Encodes a canvas as WebP, falling back to PNG where the browser cannot write WebP. */
export async function canvasToBlobPreferWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  return canvasToBlob(canvas, 'image/png', quality);
}
