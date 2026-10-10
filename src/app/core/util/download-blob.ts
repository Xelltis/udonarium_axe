/**
 * How long a download's object url is kept after the link is clicked.
 *
 * iOS Safari reads the blob some time after the click, not during it, and a url let go of at once
 * leaves it nothing to read, so the file never arrives.
 */
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

/**
 * Hands a blob to the browser as a file to save.
 * The build-click-release dance around a download link lives in one place.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}
