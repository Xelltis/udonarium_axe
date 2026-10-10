/**
 * Whether the browser runs on an iPhone or an iPad.
 *
 * An iPad asks for the desktop site by default and then calls itself a Mac, so a Mac that takes
 * more than one touch at a time is counted as one as well.
 */
export function isAppleTouchDevice(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}
