import { TOKEN_ALIASES } from '@axe/domain/ui/skin-alias';
import { STANDARD_TOKENS } from '@axe/domain/ui/skin-standard';
import { readGlobalStyles } from '@axe/testing/global-styles';

type Rgb = [number, number, number];

/** A `#rrggbb` or `rgba(r, g, b, a)` colour laid over an opaque one beneath it. */
function colourOver(colour: string, under: Rgb): Rgb {
  const hex = colour.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  const [r, g, b, a = 1] = colour.match(/[\d.]+/g)!.map(Number);
  return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
}

/** The WCAG contrast ratio between two opaque colours. */
function contrast(one: Rgb, other: Rgb): number {
  const luminance = ([r, g, b]: Rgb) => {
    const channel = (value: number) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [lighter, darker] = [luminance(one), luminance(other)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The colours a skin recipe mixes, which the standard skin sets by hand instead. */
function tokensDeclaredIn(block: string): Set<string> {
  return new Set([...block.matchAll(/(--ui-[a-z-]+)\s*:/g)].map((match) => match[1]));
}

describe('the standard skin, which is what a room wears until it is given another', () => {
  const css = readGlobalStyles();

  /**
   * A colour a utility class can reach for has to be set wherever a room may be standing.
   *
   * The recipes mix every one of them, so a token added there and nowhere else works on every
   * skin but the one a room starts in, where the class falls back to whatever it inherits.
   */
  it('sets every colour the stylesheet gives a utility class a name for', () => {
    const named = Object.keys(TOKEN_ALIASES).filter((token) => !token.startsWith('--ui-shadow'));

    for (const mode of ['light', 'dark'] as const) {
      for (const token of named) {
        expect(STANDARD_TOKENS[mode][token], `${token} on the standard ${mode} skin`).toBeTruthy();
      }
    }
  });

  /**
   * The faintest text is what the notes under the fields are written in, small as they are, and the
   * panel's title stands in the title bar's muted colour; both stay readable on either ladder.
   */
  it('keeps its faintest text and the panel titles readable on both ladders', () => {
    for (const mode of ['light', 'dark'] as const) {
      const tokens = STANDARD_TOKENS[mode];
      const ground = colourOver(tokens['--ui-bg'], [0, 0, 0]);
      const panel = colourOver(tokens['--ui-panel-bg'], ground);
      const titlebar = colourOver(tokens['--ui-titlebar-bg'], ground);

      expect(contrast(colourOver(tokens['--ui-text-dim'], panel), panel), `faint text, ${mode}`).toBeGreaterThanOrEqual(
        3
      );
      expect(
        contrast(colourOver(tokens['--ui-titlebar-muted'], titlebar), titlebar),
        `panel titles, ${mode}`
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it('sets them in the stylesheet as well, which is what a page wears before any skin is chosen', () => {
    const named = Object.keys(TOKEN_ALIASES).filter((token) => !token.startsWith('--ui-shadow'));
    const declared = tokensDeclaredIn(css);

    for (const token of named) {
      expect(declared.has(token), `${token} in styles.css`).toBe(true);
    }
  });
});
