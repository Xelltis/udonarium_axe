import { readFileSync } from 'node:fs';

/** The templates whose small buttons stay on screen on a phone. */
const SMALL_BUTTON_TEMPLATES = [
  'src/app/features/hotbar/hotbar-bar/hotbar-bar.component.html',
  'src/app/features/chat/chat-tab-strip/chat-tab-strip.component.html',
  'src/app/features/chat/chat-input/chat-input.component.html',
];

describe('small buttons that stay on screen on a phone', () => {
  it('are given a larger place to be pressed on a touch screen', () => {
    const bare: string[] = [];
    for (const template of SMALL_BUTTON_TEMPLATES) {
      const source = readFileSync(template, 'utf8');
      for (const [, classes] of source.matchAll(/<button[^>]*?\sclass="([^"]*)"/g)) {
        const tokens = new Set(classes.split(/\s+/));
        const small = tokens.has('size-6') || (tokens.has('h-6') && tokens.has('w-5'));
        if (small && !tokens.has('touch-target')) bare.push(`${template}: ${classes.slice(0, 80)}`);
      }
    }

    expect(bare).toEqual([]);
  });

  it('reach further than they are drawn', () => {
    const css = readFileSync('src/styles.css', 'utf8');

    expect(css).toMatch(/body\.touch-input \.touch-target::after\s*\{[^}]*inset:\s*-/);
  });
});
