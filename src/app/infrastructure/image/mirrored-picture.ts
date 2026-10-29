/**
 * A copy of the picture at a url turned left for right, as an object url, for drawing it where it
 * is cut and moved as a background, which no transform reaches.
 *
 * Null for a picture that does not load, or one the page may not read back. A picture that moves
 * is copied as it stands at first; the copy is a still.
 */
export async function mirroredPictureUrl(url: string): Promise<string | null> {
  const picture = new Image();
  picture.src = url;
  try {
    await picture.decode();
  } catch {
    return null;
  }
  const width = picture.naturalWidth;
  const height = picture.naturalHeight;
  if (!(width > 0 && height > 0)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(picture, 0, 0);
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
