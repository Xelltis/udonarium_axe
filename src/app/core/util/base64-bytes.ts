const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/**
 * Bytes written as text that survives a round trip through XML.
 *
 * Anything a table keeps packed - the cells the fog remembers, the stuff a chunk of the world
 * is built out of - goes over the wire as one string, so it is one attribute rather than a
 * child object per cell.
 */
export function encodeBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? ALPHABET[c & 63] : '=';
  }
  return out;
}

/**
 * Decoded straight into the caller's own buffer, filling as much of it as the text holds.
 *
 * Returns how many bytes were written. Anything that is not part of the alphabet is passed
 * over rather than read as a zero.
 */
export function decodeBytesInto(text: string, out: Uint8Array): number {
  let held = 0;
  let heldBits = 0;
  let written = 0;
  for (let i = 0; i < text.length && written < out.length; i++) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code] : -1;
    if (value < 0) continue;
    held = (held << 6) | value;
    heldBits += 6;
    if (heldBits < 8) continue;
    heldBits -= 8;
    out[written++] = (held >> heldBits) & 0xff;
  }
  return written;
}

/** The same, for a caller with no buffer of its own to fill. */
export function decodeBytes(text: string, limit = Infinity): Uint8Array {
  const room = Math.min(limit, (text.length * 3) >> 2);
  const out = new Uint8Array(Math.max(0, room));
  const written = decodeBytesInto(text, out);
  return written === out.length ? out : out.subarray(0, written);
}
