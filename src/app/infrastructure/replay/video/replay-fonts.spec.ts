import {
  loadReplayFonts,
  REPLAY_FONT_FACES,
  REPLAY_FONT_JP,
  type ReplayFontHost,
} from '@axe/infrastructure/replay/video/replay-fonts';

function host(fails = false) {
  const added: { family: string; source: string; weight: string }[] = [];
  const made: string[] = [];
  class FakeFontFace {
    constructor(
      readonly family: string,
      readonly source: string,
      readonly descriptors: { weight: string }
    ) {
      made.push(family);
    }
    async load() {
      if (fails) throw new Error('404');
      return this;
    }
  }
  const fonts = {
    add: (face: FakeFontFace) =>
      added.push({ family: face.family, source: face.source, weight: face.descriptors.weight }),
  };
  return { host: { fonts, FontFace: FakeFontFace } as unknown as ReplayFontHost, added, made };
}

describe('loading the fonts of replay videos', () => {
  it('adds every bundled face, served from the app', async () => {
    const { host: page, added } = host();

    expect(await loadReplayFonts(page, 'https://example.test/axe/')).toBe(true);
    expect(added).toHaveLength(REPLAY_FONT_FACES.length);
    expect(added[0]).toEqual({
      family: REPLAY_FONT_JP,
      source: 'url(https://example.test/axe/assets/fonts/replay/noto-sans-jp-400.woff2)',
      weight: '400',
    });
  });

  it('loads them once however often it is asked', async () => {
    const { host: page, made } = host();
    await loadReplayFonts(page, 'https://example.test/');
    await loadReplayFonts(page, 'https://example.test/');

    expect(made).toHaveLength(REPLAY_FONT_FACES.length);
  });

  it('answers false when a face fails to load, so the device fonts are used', async () => {
    expect(await loadReplayFonts(host(true).host, 'https://example.test/')).toBe(false);
  });

  it('tries again after a face failed to load, rather than keeping to the device fonts from then on', async () => {
    let failing = true;
    const added: string[] = [];
    class FlakyFontFace {
      constructor(readonly family: string) {}
      async load() {
        if (failing) throw new Error('offline');
        return this;
      }
    }
    const page = {
      fonts: { add: (face: FlakyFontFace) => added.push(face.family) },
      FontFace: FlakyFontFace,
    } as unknown as ReplayFontHost;

    expect(await loadReplayFonts(page, 'https://example.test/')).toBe(false);
    failing = false;

    expect(await loadReplayFonts(page, 'https://example.test/')).toBe(true);
    expect(added).toHaveLength(REPLAY_FONT_FACES.length);
  });

  it('answers false where fonts cannot be added at all', async () => {
    expect(await loadReplayFonts({ fonts: undefined, FontFace: undefined })).toBe(false);
  });
});
