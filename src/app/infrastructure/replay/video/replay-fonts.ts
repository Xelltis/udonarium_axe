/** The family the bundled Japanese face is registered under, kept apart from any Noto Sans JP the device has. */
export const REPLAY_FONT_JP = 'Axe Replay JP';
/** The family the bundled Korean face is registered under. */
export const REPLAY_FONT_KR = 'Axe Replay KR';

/** The faces that ship with the app for replay videos, by family, weight and where they are served. */
export const REPLAY_FONT_FACES: readonly { family: string; weight: string; path: string }[] = [
  { family: REPLAY_FONT_JP, weight: '400', path: 'assets/fonts/replay/noto-sans-jp-400.woff2' },
  { family: REPLAY_FONT_JP, weight: '700', path: 'assets/fonts/replay/noto-sans-jp-700.woff2' },
  { family: REPLAY_FONT_KR, weight: '400', path: 'assets/fonts/replay/noto-sans-kr-400.woff2' },
  { family: REPLAY_FONT_KR, weight: '700', path: 'assets/fonts/replay/noto-sans-kr-700.woff2' },
];

/** Where fonts are added and what they are made from: the page's, or a worker's. */
export interface ReplayFontHost {
  fonts: { add(face: FontFace): unknown } | undefined;
  FontFace: typeof FontFace | undefined;
}

const loaded = new WeakMap<object, Promise<boolean>>();

/**
 * Loads the faces replay videos are set in, once for each place they are added to, so a video reads
 * the same whatever fonts the device has. They are not part of the app's first load; they are
 * fetched the first time a video is previewed or made. Answers false where fonts cannot be added or
 * a face fails to load, and the video falls back to the device's own fonts; a load that failed is
 * tried again the next time, rather than leaving the rest of the session on the device's fonts.
 */
export function loadReplayFonts(host: ReplayFontHost = pageFontHost(), baseUrl = pageBaseUrl()): Promise<boolean> {
  const { fonts, FontFace: Face } = host;
  if (!fonts || !Face) return Promise.resolve(false);
  const known = loaded.get(fonts);
  if (known) return known;
  const loading = Promise.all(
    REPLAY_FONT_FACES.map(async (face) => {
      const font = new Face(face.family, `url(${new URL(face.path, baseUrl).href})`, {
        weight: face.weight,
        display: 'block',
      });
      await font.load();
      fonts.add(font);
    })
  ).then(
    () => true,
    () => {
      loaded.delete(fonts);
      return false;
    }
  );
  loaded.set(fonts, loading);
  return loading;
}

function pageFontHost(): ReplayFontHost {
  return {
    fonts: typeof document !== 'undefined' ? document.fonts : undefined,
    FontFace: typeof FontFace !== 'undefined' ? FontFace : undefined,
  };
}

function pageBaseUrl(): string {
  return typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
}
