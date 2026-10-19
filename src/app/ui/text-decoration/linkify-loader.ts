import { signal } from '@angular/core';
import type linkifyHtml from 'linkify-html';
import type { find } from 'linkifyjs';

/** The parts of linkify that turn addresses in text into links. */
export interface Linkify {
  readonly linkifyHtml: typeof linkifyHtml;
  readonly find: typeof find;
}

const loaded = signal<Linkify | null>(null);
let loading: Promise<Linkify | null> | null = null;

/**
 * Fetches linkify, once, and answers with it; null when it cannot be fetched, as when a release
 * has replaced the page's code, and text then stays without links.
 *
 * It is kept out of the code the page starts with, since text with an address in it is seldom
 * on screen the moment a room opens.
 */
export function loadLinkify(): Promise<Linkify | null> {
  loading ??= Promise.all([import('linkify-html'), import('linkifyjs')]).then(
    ([html, core]) => {
      const linkify: Linkify = { linkifyHtml: html.default, find: core.find };
      loaded.set(linkify);
      return linkify;
    },
    () => null
  );
  return loading;
}

/**
 * Linkify when it has arrived, and null until then, asking for it on the first call. Read in a
 * template or a computed, so text drawn before it arrived is drawn again with its links.
 */
export function linkifyIfLoaded(): Linkify | null {
  const linkify = loaded();
  if (!linkify) void loadLinkify();
  return linkify;
}

/**
 * Back to linkify not yet fetched, for specs that watch it arrive: a test runner may keep this
 * module across spec files, so another file can have fetched it first.
 */
export function forgetLinkify(): void {
  loaded.set(null);
  loading = null;
}
