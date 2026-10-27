/** The browsers whose setting for graphics acceleration the notice can name, and the rest. */
export type AccelerationBrowser = 'chrome' | 'edge' | 'firefox' | 'other';

/**
 * Which browser a user agent belongs to, as far as where its graphics acceleration is turned on
 * goes. Edge and the other browsers built on Chromium say Chrome as well, so they are picked out
 * first; one whose settings the notice cannot name is the rest.
 */
export function accelerationBrowserOf(userAgent: string): AccelerationBrowser {
  if (/\bEdg(e|A|iOS)?\//.test(userAgent)) return 'edge';
  if (/\bFirefox\//.test(userAgent)) return 'firefox';
  if (/\b(OPR|Vivaldi|YaBrowser|SamsungBrowser|Whale)\//.test(userAgent)) return 'other';
  return /\bChrome\//.test(userAgent) ? 'chrome' : 'other';
}
