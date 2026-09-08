import { readFileSync } from 'node:fs';

import { STANDARD_TOKENS } from '@axe/domain/ui/skin-standard';

/** The block a selector opens, read straight out of the stylesheet the app ships. */
function declarationsOf(selector: string): Record<string, string> {
  const css = readFileSync('src/styles.css', 'utf-8');
  const opens = css.indexOf(`${selector} {`);
  expect(opens).toBeGreaterThan(-1);

  let depth = 0;
  let end = -1;
  const start = css.indexOf('{', opens);
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = css.slice(start + 1, end);
  const found: Record<string, string> = {};
  for (const match of body.matchAll(/(--ui-[a-z-]+):\s*([^;]+);/g)) {
    found[match[1]] = match[2].replace(/\s+/g, ' ').trim();
  }
  return found;
}

describe('the colours the standard skin stands for', () => {
  it.each([
    ['light', ':root.theme-light'],
    ['dark', ':root'],
  ] as const)('matches what the stylesheet carries on the %s ladder', (mode, selector) => {
    const stylesheet = declarationsOf(selector);

    for (const [name, value] of Object.entries(STANDARD_TOKENS[mode])) {
      expect(`${name}: ${stylesheet[name]}`).toBe(`${name}: ${value}`);
    }
  });

  it('covers every colour a skin of its own would paint', () => {
    expect(Object.keys(STANDARD_TOKENS.light).sort()).toEqual(Object.keys(STANDARD_TOKENS.dark).sort());
    expect(Object.keys(STANDARD_TOKENS.light).length).toBeGreaterThan(35);
  });
});
