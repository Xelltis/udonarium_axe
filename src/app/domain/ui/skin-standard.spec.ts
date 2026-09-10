import { readFileSync } from 'node:fs';

import { TOKEN_ALIASES } from '@axe/domain/ui/skin-alias';
import { STANDARD_TOKENS } from '@axe/domain/ui/skin-standard';

/** The colours a skin recipe mixes, which the standard skin sets by hand instead. */
function tokensDeclaredIn(block: string): Set<string> {
  return new Set([...block.matchAll(/(--ui-[a-z-]+)\s*:/g)].map((match) => match[1]));
}

describe('the standard skin, which is what a room wears until it is given another', () => {
  const css = readFileSync('src/styles.css', 'utf-8');

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

  it('sets them in the stylesheet as well, which is what a page wears before any skin is chosen', () => {
    const named = Object.keys(TOKEN_ALIASES).filter((token) => !token.startsWith('--ui-shadow'));
    const declared = tokensDeclaredIn(css);

    for (const token of named) {
      expect(declared.has(token), `${token} in styles.css`).toBe(true);
    }
  });
});
