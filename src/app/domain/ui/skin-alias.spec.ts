import { readFileSync } from 'node:fs';
import { TOKEN_ALIASES, scopedTokens } from '@axe/domain/ui/skin-alias';

describe('the names a scoped preview also has to set', () => {
  it('lists every alias the stylesheet declares, and nothing it does not', () => {
    const css = readFileSync('src/styles.css', 'utf-8');
    const declared = new Map<string, string>();
    for (const match of css.matchAll(/(--color-ui-[a-z-]+):\s*var\((--ui-[a-z-]+)\)\s*;/g)) {
      declared.set(match[2], match[1]);
    }

    expect(Object.fromEntries([...declared].sort())).toEqual(Object.fromEntries(Object.entries(TOKEN_ALIASES).sort()));
  });

  it('writes a colour under both names so a utility class can find it', () => {
    const scoped = scopedTokens({ '--ui-bg': '#123456', '--ui-accent': '#abcdef' });

    expect(scoped['--ui-bg']).toBe('#123456');
    expect(scoped['--color-ui-bg']).toBe('#123456');
    expect(scoped['--color-ui-accent']).toBe('#abcdef');
  });

  it('leaves out an alias for a colour it was not given', () => {
    expect(scopedTokens({ '--ui-bg': '#123456' })['--color-ui-accent']).toBeUndefined();
  });
});
