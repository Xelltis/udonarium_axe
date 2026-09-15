import { readFileSync } from 'node:fs';

/** The stylesheet with its comments taken out, so braces and at-signs in prose are not read as rules. */
function stylesheet(): string {
  return readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The end of the block whose opening brace is at `open`, just past its closing brace. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return i + 1;
  }
  return css.length;
}

/** The stylesheet as it applies everywhere, with every at-rule block taken out. */
function topLevelOf(css: string): string {
  let rest = css;
  for (let at = /@[a-z-]+[^{;]*\{/.exec(rest); at; at = /@[a-z-]+[^{;]*\{/.exec(rest)) {
    const open = at.index + at[0].length - 1;
    rest = rest.slice(0, at.index) + rest.slice(blockEnd(rest, open));
  }
  return rest;
}

/** The inside of every block that opens with exactly this prelude, joined together. */
function blocksOf(css: string, prelude: string): string {
  const inside: string[] = [];
  for (let from = css.indexOf(`${prelude} {`); from >= 0; from = css.indexOf(`${prelude} {`, from + 1)) {
    const open = from + prelude.length + 1;
    inside.push(css.slice(open + 1, blockEnd(css, open) - 1));
  }
  return inside.join('\n');
}

/** The declarations of the rule written for exactly this selector. */
function declarationsOf(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|\\n)[ \\t]*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return rule?.[1] ?? '';
}

describe('long presses on the table', () => {
  const css = stylesheet();

  it('open no menu to save a picture, anywhere on the table', () => {
    expect(declarationsOf(topLevelOf(css), 'game-table')).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it('open no menu to save the picture of a speaker in the novel mode, whose own menu is a long press', () => {
    const hosts = /body\.touch-input\s*:is\(([^)]*)\)\s*\{\s*-webkit-touch-callout:\s*none/.exec(css)?.[1] ?? '';
    expect(hosts.split(',').map((host) => host.trim())).toContain('visual-novel-overlay');
  });

  it('lift no picture off the table to be dropped somewhere else where a finger does the pointing', () => {
    expect(declarationsOf(blocksOf(css, '@media (pointer: coarse)'), 'game-table img')).toMatch(
      /-webkit-user-drag:\s*none/
    );
  });

  it('leave a picture on the table free to be dragged out of the page with a mouse', () => {
    const held = [...topLevelOf(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(
        ([, selector, declarations]) => /game-table/.test(selector) && /-webkit-user-drag:\s*none/.test(declarations)
      )
      .map(([, selector]) => selector.trim());

    expect(held).toEqual([]);
  });
});
