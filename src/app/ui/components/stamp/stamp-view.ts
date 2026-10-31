import type { TranslateFn } from '@axe/application/i18n/translate.token';
import type { ImageStorage } from '@axe/core/storage/image-storage';
import { stampArtUrl, stampLabelKey, StampMotion, stampNameKey, stampOf } from '@axe/domain/chat/stamp-catalog';
import { SEAL_FILTER_ID, sealStampSvg } from '@axe/domain/chat/stamp-glyphs';
import { escapeHtml } from '@axe/ui/text-decoration/decorate-chat-text';

/** The ink the name of a picture from the room is written in while the picture is not here. */
const MISSING_PICTURE_INK = '#8a8f99';

/** The white edge and the drop the words of a sound effect are written with, as in a comic. */
export const SOUND_EFFECT_EDGE = [
  '0.07em 0 0 #fff',
  '-0.07em 0 0 #fff',
  '0 0.07em 0 #fff',
  '0 -0.07em 0 #fff',
  '0.05em 0.05em 0 #fff',
  '-0.05em 0.05em 0 #fff',
  '0.05em -0.05em 0 #fff',
  '-0.05em -0.05em 0 #fff',
  '0.09em 0.11em 0 rgba(0, 0, 0, 0.35)',
].join(', ');

/** How a stamp is drawn: words written large, a seal's picture, or an image. */
export type StampView =
  | {
      readonly kind: 'words';
      readonly name: string;
      readonly words: string;
      readonly color: string;
      readonly tilt: number;
      readonly motion: StampMotion;
    }
  | {
      readonly kind: 'picture';
      readonly name: string;
      readonly svg: string;
      readonly tilt: number;
      readonly motion: StampMotion;
    }
  | { readonly kind: 'image'; readonly name: string; readonly url: string; readonly motion: StampMotion };

/** What drawing a stamp reads from the room and the reader's language. */
export interface StampViewSource {
  readonly t: TranslateFn;
  /** A room's picture, by the image it is, where it is here. */
  picture(imageIdentifier: string): { url: string; name: string } | null;
  /** The name a room's picture has in a set, or empty. */
  nameInSet(imageIdentifier: string): string;
}

/** What drawing a stamp reads from the room: its images, the names its sets give them, and the reader's language. */
export function roomStampViewSource(
  t: TranslateFn,
  images: ImageStorage,
  sets: { nameOf(imageIdentifier: string): string }
): StampViewSource {
  return {
    t,
    picture: (imageIdentifier) => {
      const image = images.get(imageIdentifier);
      return image?.url ? { url: image.url, name: image.name } : null;
    },
    nameInSet: (imageIdentifier) => sets.nameOf(imageIdentifier),
  };
}

/**
 * How a stamp is drawn. A sound effect is its words in heavy leaning letters; a seal is drawn; the
 * character's stamps and a stamp from a room's set are their pictures; while the picture of a stamp
 * from the room is not here, its name is written in grey in its place: the one in the room's sets,
 * the picture's own, or else the one the line it stands in gave it. Null for a stamp this version
 * does not know.
 */
export function stampViewOf(stampId: string, source: StampViewSource, writtenAs = ''): StampView | null {
  const ref = stampOf(stampId);
  if (!ref) return null;
  if (ref.kind === 'image') {
    const image = source.picture(ref.imageIdentifier);
    const name = source.nameInSet(ref.imageIdentifier) || image?.name || writtenAs || source.t('ui.stamp.picture');
    if (!image?.url) {
      const words = source.t('ui.stamp.standIn', { words: name });
      return { kind: 'words', name, words, color: MISSING_PICTURE_INK, tilt: 0, motion: 'pop' };
    }
    return { kind: 'image', name, url: image.url, motion: 'pop' };
  }
  const { stamp } = ref;
  const name = source.t(stampNameKey(stamp));
  const art = stampArtUrl(stamp);
  if (art) return { kind: 'image', name, url: art, motion: stamp.motion };
  const words = source.t(stampLabelKey(stamp));
  if (stamp.family === 'seal') {
    return { kind: 'picture', name, svg: sealStampSvg(words, stamp.color), tilt: stamp.tilt, motion: stamp.motion };
  }
  return { kind: 'words', name, words, color: stamp.color, tilt: stamp.tilt, motion: stamp.motion };
}

/** How large words are written for a box of the size given: smaller the more there are, within bounds. */
export function stampWordsSize(words: string, box: number): number {
  const length = Math.max(2, Array.from(words).length);
  return Math.round(box * Math.max(0.24, Math.min(0.6, 1.25 / length)));
}

/** How many stamps have been written out, for each to give its seal's filter an id of its own. */
let stampsWritten = 0;

/**
 * A stamp written out as markup, for text drawn as markup to hold, as a line of chat is: as tall as
 * the letters round it, or in a box of the size given in pixels. Every word in it is escaped, and
 * a seal gives its filter an id of its own, so no seal leans on another that may not be drawn: one
 * made from `key`, which a line written again gives again, so the same line is the same markup, or
 * else one counted afresh.
 */
export function stampMarkup(stampId: string, view: StampView, box: number | 'inline', key?: string): string {
  const height = box === 'inline' ? '1.5em' : `${box}px`;
  const name = escapeHtml(view.name);
  const width = view.kind === 'words' ? '' : `width:${height};`;
  const open = `<span class="chat-stamp inline-flex items-center justify-center align-middle select-none" data-stamp data-stamp-id="${escapeHtml(stampId)}" role="img" aria-label="${name}" title="${name}" style="${width}min-width:${height};height:${height}">`;
  switch (view.kind) {
    case 'words': {
      const size = box === 'inline' ? '1.1em' : `${stampWordsSize(view.words, box)}px`;
      return `${open}<span class="leading-none font-black whitespace-nowrap italic" style="color:${escapeHtml(view.color)};font-size:${size};text-shadow:${SOUND_EFFECT_EDGE};transform:rotate(${view.tilt}deg)">${escapeHtml(view.words)}</span></span>`;
    }
    case 'picture': {
      const own = key === undefined ? `${++stampsWritten}` : key.replace(/[^A-Za-z0-9_-]/g, '_');
      const svg = view.svg.replaceAll(SEAL_FILTER_ID, `${SEAL_FILTER_ID}-line-${own}`);
      return `${open}<span class="block size-full" style="transform:rotate(${view.tilt}deg)">${svg}</span></span>`;
    }
    case 'image':
      return `${open}<img class="size-full object-contain" draggable="false" src="${escapeHtml(view.url)}" alt="${name}" /></span>`;
  }
}
