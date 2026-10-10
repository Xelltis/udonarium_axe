import { readFileSync } from 'node:fs';

const TEMPLATE = 'src/app/features/mobile/mobile-shell/mobile-shell.component.html';
const LANGUAGES = ['ja', 'en', 'ko'];
/** The narrowest phone screen the menu is laid out for. */
const NARROWEST_SCREEN_PX = 320;
/** One step of Tailwind's spacing scale, in pixels at the default root size. */
const SPACING_STEP_PX = 4;
/** The label's font size, which is also the width of a full-width letter. */
const LABEL_FONT_PX = 12;
/** A generous width for a narrow letter of the label, so a word is thought wider rather than narrower. */
const NARROW_LETTER_PX = 7.5;
/** The border, side padding, icon and gap the button with words draws around its longest word. */
const WORDS_BUTTON_CHROME_PX = 2 + 2 * 2 * SPACING_STEP_PX + 18 + 1.5 * SPACING_STEP_PX;

/** Japanese breaks between any two letters; every other label breaks only at spaces. */
function wordsOf(label: string): string[] {
  return label.split(/\s+|(?<=[\u3040-\u30ff\u4e00-\u9fff])|(?=[\u3040-\u30ff\u4e00-\u9fff])/).filter(Boolean);
}

/** A full-width letter, Hangul included, takes the whole font size; any other is taken as a narrow one. */
function widthOf(word: string): number {
  const fullWidth = /[\u3000-\u9fff\uac00-\ud7af]/;
  return [...word].reduce((sum, letter) => sum + (fullWidth.test(letter) ? LABEL_FONT_PX : NARROW_LETTER_PX), 0);
}

describe('the bottom row of the phone menu', () => {
  const template = readFileSync(TEMPLATE, 'utf8');
  const footer = /<footer\s+class="([^"]*)"[^>]*>([\s\S]*?)<\/footer>/.exec(template);
  const footerClasses = new Set((footer?.[1] ?? '').split(/\s+/));
  const buttons = [...(footer?.[2] ?? '').matchAll(/<button[^>]*?\sclass="([^"]*)"/g)].map(
    ([, classes]) => new Set(classes.split(/\s+/))
  );
  const iconButtons = buttons.filter((classes) => classes.has('w-12'));
  const wordsButton = buttons.find((classes) => classes.has('flex-1'));
  const gap =
    Number(/^gap-(\d+(?:\.\d+)?)$/.exec([...footerClasses].find((token) => token.startsWith('gap-')) ?? '')?.[1] ?? 0) *
    SPACING_STEP_PX;
  const sidePadding = Number(/max\((\d+(?:\.\d+)?)rem/.exec(footer?.[1] ?? '')?.[1] ?? 0) * 16 * 2;

  it('has one button with words and the rest drawn as icons of a set width', () => {
    expect(wordsButton).toBeDefined();
    expect(iconButtons.length).toBe(buttons.length - 1);
  });

  it('keeps the icons in one row on the narrowest screen', () => {
    const row = sidePadding + iconButtons.length * 48 + (iconButtons.length - 1) * gap;

    expect(row).toBeLessThanOrEqual(NARROWEST_SCREEN_PX);
  });

  it('gives the button with words a row of its own on any screen too narrow to hold its longest word beside the icons', () => {
    const labels = LANGUAGES.map(
      (language) =>
        /"useDesktop":\s*"([^"]*)"/.exec(readFileSync(`src/assets/i18n/${language}.json`, 'utf8'))?.[1] ?? ''
    );
    const longestWord = Math.max(...labels.flatMap(wordsOf).map(widthOf));
    const oneRow = sidePadding + iconButtons.length * (48 + gap) + WORDS_BUTTON_CHROME_PX + longestWord;
    const ownRowBelow = Number(
      /^max-\[(\d+)px\]:basis-full$/.exec(
        [...(wordsButton ?? [])].find((token) => token.endsWith(':basis-full')) ?? ''
      )?.[1] ?? 0
    );

    expect(labels.every(Boolean)).toBe(true);
    expect(footerClasses.has('flex-wrap')).toBe(true);
    expect(ownRowBelow).toBeGreaterThanOrEqual(oneRow);
  });

  it('draws every button tall enough to be pressed', () => {
    const short = buttons.filter((classes) => {
      const minHeight = [...classes].map((token) => /^min-h-(\d+)$/.exec(token)?.[1]).find(Boolean);
      return Number(minHeight ?? 0) * SPACING_STEP_PX < 44;
    });

    expect(short).toEqual([]);
  });
});
