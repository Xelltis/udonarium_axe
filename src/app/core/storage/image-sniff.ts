/**
 * Whether these bytes actually begin like a picture.
 *
 * A blob's declared type is whatever handed it over said it was: a zip entry carries no type
 * of its own, and what a reader puts there is guessed from the file name. Bytes that arrive
 * from somewhere else are checked against what the format itself has to start with, so a text
 * file named `background.webp` is turned away rather than stored and drawn as a broken image.
 */
export async function looksLikeImage(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (head.length < 4) return false;

  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);

  // PNG and its animated sibling share a signature.
  if (starts(0x89, 0x50, 0x4e, 0x47)) return true;
  if (starts(0xff, 0xd8, 0xff)) return true;
  if (starts(0x47, 0x49, 0x46, 0x38)) return true;
  if (starts(0x42, 0x4d)) return true;
  // RIFF....WEBP
  if (starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42) return true;
  // ....ftyp — avif and heif alike
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return true;

  return false;
}
