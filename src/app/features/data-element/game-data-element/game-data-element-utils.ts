/**
 * Escapes a sheet value for use as HTML, so what somebody typed shows as written rather than as
 * markup.
 */
export function escapeHtml(text: string | number): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Whether a sheet value is a web address starting with http or https, which the sheet shows as a
 * link. A number never is.
 */
export function isUrlText(text: string | number): boolean {
  if (typeof text !== 'string') return false;
  return text.startsWith('https://') || text.startsWith('http://');
}
