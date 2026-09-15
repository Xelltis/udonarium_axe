import { isAppleTouchDevice } from '@axe/core/util/apple-touch';

/**
 * Keeps an iPhone or an iPad from zooming the page onto a text box as it is focused.
 *
 * Safari zooms onto any box whose text is smaller than 16px, and the desktop layout sets it
 * smaller on purpose. Capping the scale at one stops that zoom, while Safari there still lets the
 * reader pinch the page larger. Elsewhere the same cap would take the pinch away as well, so
 * nothing else is touched.
 */
export function keepFocusFromZoomingOnAppleTouch(
  doc: Document,
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>
): void {
  if (!isAppleTouchDevice(nav.userAgent, nav.maxTouchPoints)) return;
  const viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport || /maximum-scale/.test(viewport.content)) return;
  viewport.content = `${viewport.content}, maximum-scale=1`;
}
