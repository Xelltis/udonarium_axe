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
 * Whether a picture moves, read from the head of its file: an APNG (an acTL chunk before its first
 * pixels), a WebP that says it is animated (the flag of its VP8X chunk, or an ANIM chunk), an AVIF
 * of the image-sequence brand, or a GIF with a second image. Where the head ends before it says either
 * way, the picture is taken as moving, so a reader that only has the head never stills a moving one.
 */
export function isAnimatedImageBytes(buffer: ArrayBuffer): boolean {
  return animationOfHead(buffer) !== false;
}

/** Whether the bytes are of a GIF, which a reader may take as moving at its word (see `AnimatedImageService`). */
export function isGifBytes(buffer: ArrayBuffer): boolean {
  return buffer.byteLength >= 3 && ascii(new DataView(buffer), 0, 3) === 'GIF';
}

/**
 * Whether the bytes, the head of a picture's file or all of it, say the picture moves: true or false
 * where they do, null where they end before saying.
 */
function animationOfHead(buffer: ArrayBuffer): boolean | null {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  if (startsWith(view, PNG_SIGNATURE)) return pngAnimation(view);
  if (ascii(view, 0, 3) === 'GIF') return gifHasSecondFrame(view);
  if (ascii(view, 0, 4) === 'RIFF' && ascii(view, 8, 4) === 'WEBP') return webpAnimation(view);
  if (ascii(view, 4, 4) === 'ftyp') return avifAnimation(view);
  return false;
}

/** An APNG's acTL chunk comes before its first IDAT: true where it does, false where IDAT comes first, null where neither has come. */
function pngAnimation(view: DataView): boolean | null {
  if (isAnimatedPng(view.buffer as ArrayBuffer)) return true;
  let offset = 8;
  while (offset + 8 <= view.byteLength) {
    if (ascii(view, offset + 4, 4) === 'IDAT') return false;
    offset += 12 + view.getUint32(offset);
  }
  return null;
}

/** A WebP says it is animated in the flags of its VP8X chunk, the first, and with an ANIM chunk after; a plain lossy or lossless one stands still. */
function webpAnimation(view: DataView): boolean | null {
  const first = ascii(view, 12, 4);
  if (first === 'VP8 ' || first === 'VP8L') return false;
  if (first === 'VP8X' && view.byteLength > 20) return (view.getUint8(20) & 0x02) !== 0;
  return hasWebPAnimation(view) ? true : null;
}

/** An AVIF of the image-sequence brand, major or compatible, is a moving one. */
function avifAnimation(view: DataView): boolean {
  const size = Math.min(view.getUint32(0), view.byteLength);
  for (let at = 8; at + 4 <= size; at += 4) {
    if (at === 12) continue;
    if (ascii(view, at, 4) === 'avis') return true;
  }
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
 * Whether the picture held in a blob moves: an APNG, an animated WebP or AVIF, a GIF of more than one
 * image, or an SVG, which may carry animation of its own. The head of the file is read, and all of it
 * only where the head ends before saying. Read once per blob and kept; a blob that cannot be read is
 * answered still for now and read again when next asked.
 */
export function blobMoves(blob: Blob): Promise<boolean> {
  let told = toldOfBlobs.get(blob);
  if (!told) {
    told = readWhetherBlobMoves(blob).then(
      (moves) => {
        knownOfBlobs.set(blob, moves);
        return moves;
      },
      () => {
        toldOfBlobs.delete(blob);
        return false;
      }
    );
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
  const head = await blob.slice(0, HEAD_BYTES).arrayBuffer();
  const told = animationOfHead(head);
  if (told !== null || blob.size <= head.byteLength) return told === true;
  return animationOfHead(await blob.arrayBuffer()) === true;
}

/** How much of a file is read first to tell whether it moves, which each format says near its start. */
const HEAD_BYTES = 64 * 1024;

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
