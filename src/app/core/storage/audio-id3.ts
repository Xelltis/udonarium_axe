/** The artwork an ID3v2 tag embeds: its bytes and the MIME type they are best read as. */
export interface EmbeddedArtwork {
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Where a tag's frames lie, as its header says, and which version lays them out. */
interface TagLayout {
  majorVersion: number;
  framesStart: number;
  tagEnd: number;
}

/** One frame's id and where its data lies. */
interface FrameLayout {
  id: string;
  dataStart: number;
  dataEnd: number;
}

const ID3_HEADER_SIZE = 10;
const FRAME_HEADER_SIZE_V2 = 6;
const FRAME_HEADER_SIZE_V3 = 10;
/** The text encodings an APIC description may be in; the two UTF-16 ones end in a two-byte null. */
const UTF16 = 1;
const UTF16BE = 2;

/**
 * An object URL for the artwork embedded in an ID3v2 tag, or null when the bytes carry none.
 *
 * ID3v2.2 (PIC), ID3v2.3 (APIC) and ID3v2.4 (APIC, syncsafe sizes) are read.
 */
export function extractArtworkUrl(buffer: ArrayBuffer): string | null {
  const artwork = readEmbeddedArtwork(buffer);
  if (!artwork) return null;
  return URL.createObjectURL(new Blob([artwork.bytes], { type: artwork.type }));
}

/**
 * The artwork embedded in an ID3v2 tag at the start of the bytes, or null when there is no tag, no
 * picture frame, or the frame is cut short. The first picture frame is taken.
 */
export function readEmbeddedArtwork(buffer: ArrayBuffer): EmbeddedArtwork | null {
  const bytes = new Uint8Array(buffer);
  const tag = readTagLayout(bytes);
  if (!tag) return null;

  const pictureId = tag.majorVersion === 2 ? 'PIC' : 'APIC';
  let offset = tag.framesStart;
  while (offset < tag.tagEnd) {
    const frame = readFrameLayout(bytes, offset, tag);
    if (!frame) break;
    if (frame.id === pictureId) {
      const artwork = readPictureFrame(bytes, frame.dataStart, frame.dataEnd, tag.majorVersion);
      if (artwork) return artwork;
    }
    offset = frame.dataEnd;
  }
  return null;
}

/** A 28-bit syncsafe integer, whose four bytes each leave bit 7 clear, as ID3v2 sizes are written. */
function syncsafe(bytes: Uint8Array<ArrayBuffer>, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

/** A plain 32-bit big-endian integer. */
function bigEndian32(bytes: Uint8Array<ArrayBuffer>, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function ascii(bytes: Uint8Array<ArrayBuffer>, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/**
 * The tag's layout from its header: null without the "ID3" mark. The frames start past the
 * extended header where the flags say there is one, whose size v2.4 writes syncsafe and v2.3 as a
 * plain integer that leaves out its own four bytes.
 */
function readTagLayout(bytes: Uint8Array<ArrayBuffer>): TagLayout | null {
  if (bytes.length < ID3_HEADER_SIZE || ascii(bytes, 0, 3) !== 'ID3') return null;
  const majorVersion = bytes[3];
  const hasExtendedHeader = (bytes[5] & 0x40) !== 0;
  const tagEnd = Math.min(ID3_HEADER_SIZE + syncsafe(bytes, 6), bytes.length);

  let framesStart = ID3_HEADER_SIZE;
  if (hasExtendedHeader && framesStart + 4 <= tagEnd) {
    framesStart += majorVersion === 4 ? syncsafe(bytes, framesStart) : 4 + bigEndian32(bytes, framesStart);
  }
  return { majorVersion, framesStart, tagEnd };
}

/**
 * The frame at the offset: null where the tag ends before a whole header, at padding (a size of
 * zero), or where the frame's data runs past the tag. v2.2 writes a three-byte id and size; v2.3
 * and v2.4 four bytes each, the size syncsafe in v2.4.
 */
function readFrameLayout(bytes: Uint8Array<ArrayBuffer>, offset: number, tag: TagLayout): FrameLayout | null {
  const headerSize = tag.majorVersion === 2 ? FRAME_HEADER_SIZE_V2 : FRAME_HEADER_SIZE_V3;
  if (offset + headerSize > tag.tagEnd) return null;

  let id: string;
  let size: number;
  if (tag.majorVersion === 2) {
    id = ascii(bytes, offset, offset + 3);
    size = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
  } else {
    id = ascii(bytes, offset, offset + 4);
    size = tag.majorVersion === 4 ? syncsafe(bytes, offset + 4) : bigEndian32(bytes, offset + 4);
  }
  if (size <= 0) return null;

  const dataStart = offset + headerSize;
  const dataEnd = dataStart + size;
  if (dataEnd > tag.tagEnd) return null;
  return { id, dataStart, dataEnd };
}

/**
 * The picture in a PIC or APIC frame: the text encoding byte, then the image format (three
 * letters in v2.2, a null-ended MIME type after), the picture type byte, a null-ended description in
 * that encoding, and the image bytes to the end of the frame.
 */
function readPictureFrame(
  bytes: Uint8Array<ArrayBuffer>,
  start: number,
  end: number,
  majorVersion: number
): EmbeddedArtwork | null {
  if (start >= end) return null;
  const encoding = bytes[start];
  let i = start + 1;

  let declaredType: string;
  if (majorVersion === 2) {
    if (i + 3 > end) return null;
    const format = ascii(bytes, i, i + 3).toUpperCase();
    declaredType = format === 'PNG' ? 'image/png' : 'image/jpeg';
    i += 3;
  } else {
    const typeStart = i;
    while (i < end && bytes[i] !== 0) i++;
    declaredType = ascii(bytes, typeStart, i);
    i++;
  }

  if (i >= end) return null;
  i++;
  i = skipText(bytes, i, end, encoding);
  if (i >= end) return null;

  const imageBytes = bytes.slice(i, end);
  if (imageBytes.length === 0) return null;
  return { type: artworkType(declaredType, imageBytes), bytes: imageBytes };
}

/** Where the bytes after a null-ended string start, the null being two bytes wide in UTF-16. */
function skipText(bytes: Uint8Array<ArrayBuffer>, start: number, end: number, encoding: number): number {
  let i = start;
  if (encoding === UTF16 || encoding === UTF16BE) {
    while (i + 1 < end && !(bytes[i] === 0 && bytes[i + 1] === 0)) i += 2;
    return i + 2;
  }
  while (i < end && bytes[i] !== 0) i++;
  return i + 1;
}

/** The MIME type the image bytes show themselves to be, or the declared one where they show nothing, JPEG as a last resort. */
function artworkType(declared: string, bytes: Uint8Array<ArrayBuffer>): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  const type = declared.toLowerCase();
  if (type.includes('png')) return 'image/png';
  if (type.includes('gif')) return 'image/gif';
  if (type.includes('webp')) return 'image/webp';
  return 'image/jpeg';
}
