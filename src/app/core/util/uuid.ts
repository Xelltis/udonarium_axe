/** A random version 4 UUID from the browser's crypto; needs a secure context, as `crypto.randomUUID` does. */
export function generateUuid(): string {
  return crypto.randomUUID();
}
