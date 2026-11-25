import { isAnimatedPng } from '@axe/core/storage/image-downscale';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

function startsWith(view: DataView, bytes: number[], offset = 0): boolean {
  if (view.byteLength < offset + bytes.length) return false;
  return bytes.every((byte, index) => view.getUint8(offset + index) === byte);
}

function ascii(view: DataView, offset: number, length: number): string {
  if (view.byteLength < offset + length) return '';
  let text = '';
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(view.getUint8(offset + index));
  return text;
}

/**
 * Whether a picture moves.
 *
 * Only the head of the file is read, which is where each format says so: png carries an
 * acTL chunk before its first pixels, webp an ANIM chunk in the same place. A gif is taken
 * at its word without counting frames - one that turns out to hold a single frame is drawn
 * exactly as it would have been anyway.
 */
export function isAnimatedImageBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);

  if (startsWith(view, PNG_SIGNATURE)) return isAnimatedPng(buffer);
  if (ascii(view, 0, 3) === 'GIF') return gifHasSecondFrame(view) !== false;
  if (ascii(view, 0, 4) === 'RIFF' && ascii(view, 8, 4) === 'WEBP') return hasWebPAnimation(view);
  return false;
}

/**
 * Whether a GIF holds a second image, walking its blocks: true where it does, false where it ends with
 * one alone, and null where the bytes run out before either is known, as for the head of a file.
 */
export function gifHasSecondFrame(view: DataView): boolean | null {
  if (view.byteLength < 13) return null;
  const tableSize = (packed: number) => ((packed & 0x80) === 0 ? 0 : 3 * 2 ** ((packed & 0x07) + 1));
  let at = 13 + tableSize(view.getUint8(10));
  let images = 0;
  const skipSubBlocks = (from: number): number | null => {
    let offset = from;
    while (offset < view.byteLength) {
      const size = view.getUint8(offset);
      offset += 1 + size;
      if (size === 0) return offset;
    }
    return null;
  };
  while (at < view.byteLength) {
    const kind = view.getUint8(at);
    if (kind === 0x3b) return false;
    if (kind === 0x21) {
      const next = skipSubBlocks(at + 2);
      if (next === null) return null;
      at = next;
      continue;
    }
    if (kind !== 0x2c) return false;
    images++;
    if (images >= 2) return true;
    if (at + 10 > view.byteLength) return null;
    const next = skipSubBlocks(at + 10 + tableSize(view.getUint8(at + 9)) + 1);
    if (next === null) return null;
    at = next;
  }
  return null;
}

/**
 * Whether the picture held in a blob moves: an APNG, an animated WebP, a GIF of more than one image,
 * or an SVG, which may carry animation of its own. Read once per blob and kept.
 */
export function blobMoves(blob: Blob): Promise<boolean> {
  let told = toldOfBlobs.get(blob);
  if (!told) {
    told = readWhetherBlobMoves(blob)
      .catch(() => false)
      .then((moves) => {
        knownOfBlobs.set(blob, moves);
        return moves;
      });
    toldOfBlobs.set(blob, told);
  }
  return told;
}

/** Whether a blob's picture moves, where {@link blobMoves} has told it already; undefined before. */
export function knownBlobMoves(blob: Blob): boolean | undefined {
  return knownOfBlobs.get(blob);
}

const toldOfBlobs = new WeakMap<Blob, Promise<boolean>>();
const knownOfBlobs = new WeakMap<Blob, boolean>();

async function readWhetherBlobMoves(blob: Blob): Promise<boolean> {
  if (blob.type === 'image/svg+xml') return true;
  const head = await blob.slice(0, 64 * 1024).arrayBuffer();
  if (ascii(new DataView(head), 0, 3) === 'GIF' && blob.size > head.byteLength) {
    return gifHasSecondFrame(new DataView(await blob.arrayBuffer())) === true;
  }
  return isAnimatedImageBytes(head);
}

function hasWebPAnimation(view: DataView): boolean {
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const fourCC = ascii(view, offset, 4);
    if (fourCC === 'ANIM' || fourCC === 'ANMF') return true;
    const size = view.getUint32(offset + 4, true);
    if (!Number.isFinite(size)) return false;
    offset += 8 + size + (size % 2);
  }
  return false;
}
