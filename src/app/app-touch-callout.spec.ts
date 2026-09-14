import { readFileSync } from 'node:fs';

/** The declarations of the global stylesheet's rule written for exactly this selector. */
function declarationsOf(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return rule?.[1] ?? '';
}

describe('long presses on the table', () => {
  const css = readFileSync('src/styles.css', 'utf8');

  it('open no menu to save a picture, anywhere on the table', () => {
    expect(declarationsOf(css, 'game-table')).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it('open no menu to save the picture of a speaker in the novel mode, whose own menu is a long press', () => {
    const hosts = /body\.touch-input\s*:is\(([^)]*)\)\s*\{\s*-webkit-touch-callout:\s*none/.exec(css)?.[1] ?? '';
    expect(hosts.split(',').map((host) => host.trim())).toContain('visual-novel-overlay');
  });

  it('lift no picture off the table to be dropped somewhere else', () => {
    expect(declarationsOf(css, 'game-table img')).toMatch(/-webkit-user-drag:\s*none/);
  });
});
