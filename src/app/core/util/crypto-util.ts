/**
 * The SHA-256 digest of bytes, or of a string encoded as UTF-8; needs a secure
 * context, where `crypto.subtle` exists.
 */
export async function sha256(input: ArrayBuffer | string): Promise<Uint8Array> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/** The SHA-256 digest of bytes or a UTF-8 string as lowercase hex. */
export async function sha256Hex(input: ArrayBuffer | string): Promise<string> {
  const hash = await sha256(input);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The SHA-256 of a string as URL-safe base64 without padding, as used to turn a room id, name and
 * password into the room name on the signalling service.
 *
 * A null or undefined input gives an empty string.
 */
export async function sha256Base64Url(str: string): Promise<string> {
  if (str == null) return '';
  const hash = await sha256(str);
  const base64 = btoa(String.fromCharCode(...hash))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=*$/g, '');
  return base64;
}
