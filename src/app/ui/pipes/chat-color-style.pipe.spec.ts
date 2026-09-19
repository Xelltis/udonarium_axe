import { parseHexColor, relativeLuminance, rgbToLch } from '@axe/core/util/tonal-color';
import { chatBubbleBaseTone, setChatBubbleBaseTone } from '@axe/domain/ui/chat-bubble-base';
import { autoChatBubble, chatColorContrast, ChatColorStylePipe } from '@axe/ui/pipes/chat-color-style.pipe';

const PALETTE = [
  '#000000',
  '#333333',
  '#888888',
  '#cccccc',
  '#ffffff',
  '#ff0000',
  '#990000',
  '#ffcc00',
  '#00cc00',
  '#006633',
  '#0099ff',
  '#66ccff',
  '#0000ff',
  '#9900ff',
];

const THEMES = ['light', 'dark'] as const;

function rgbOf(css: string): [number, number, number] {
  const match = /rgb\((\d+),(\d+),(\d+)\)/.exec(css);
  if (!match) throw new Error(`not a colour: ${css}`);
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
}

describe('ChatColorStylePipe', () => {
  let pipe: ChatColorStylePipe;

  beforeEach(() => {
    pipe = new ChatColorStylePipe();
  });

  it('leaves the bubble alone where there is no colour to work from', () => {
    expect(pipe.transform('')).toBeNull();
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform('not a colour')).toBeNull();
  });

  it('uses the chosen colour for the text, exactly as it was chosen', () => {
    for (const colour of PALETTE) {
      for (const theme of THEMES) {
        expect(pipe.transform(colour, theme)?.['color']).toBe(colour);
      }
    }
  });

  it('takes the bubble the reader set, whatever it does to the contrast', () => {
    const style = pipe.transform('#000000', 'dark', '#010101')!;

    expect(style['background-color']).toBe('rgb(1,1,1)');
    expect(style['--bubble-bg']).toBe('rgb(1,1,1)');
  });

  it('works one out where none was set, and ignores one that is not a colour', () => {
    const auto = pipe.transform('#006633', 'dark')!;

    expect(auto['background-color']).toBe(autoChatBubble('#006633', 'dark'));
    expect(pipe.transform('#006633', 'dark', 'nonsense')!['background-color']).toBe(auto['background-color']);
  });

  it('gives the caret a colour that stands off the bubble it points out of', () => {
    const style = pipe.transform('#ff0000')!;

    expect(style['--bubble-bg']).toBe(style['background-color']);
    expect(style['--ui-bubble-caret-border']).not.toBe(style['background-color']);
  });
});

describe('autoChatBubble()', () => {
  it('holds every colour to the reading standard, on either theme', () => {
    for (const colour of PALETTE) {
      for (const theme of THEMES) {
        expect(chatColorContrast(colour, '', theme)).toBeGreaterThanOrEqual(4.4);
      }
    }
  });

  it('stays on the background the rest of the page has when the colour can be read there', () => {
    for (const colour of ['#0099ff', '#66ccff', '#ffcc00', '#00cc00', '#ffffff', '#cccccc']) {
      const tone = rgbToLch(rgbOf(autoChatBubble(colour, 'dark'))).tone;

      expect(Math.abs(tone - rgbToLch(parseHexColor('#21262d')!).tone)).toBeLessThan(2);
    }
  });

  it('carries only a whisper of the hue, so the bubble stays out of the text way', () => {
    expect(rgbToLch(rgbOf(autoChatBubble('#ff0000', 'dark'))).chroma).toBeLessThanOrEqual(9);
  });

  it('says nothing for a colour it cannot read', () => {
    expect(autoChatBubble('not a colour', 'dark')).toBe('');
  });
});

describe('chatColorContrast()', () => {
  it('measures against the bubble that was set, when one was', () => {
    const white = relativeLuminance([1, 1, 1]);

    expect(chatColorContrast('#000000', '#ffffff', 'dark')).toBeCloseTo((white + 0.05) / 0.05, 1);
  });

  it('measures against the bubble it would be given, when none was', () => {
    expect(chatColorContrast('#006633', '', 'dark')).toBeGreaterThanOrEqual(4.4);
  });
});

describe('working a bubble out', () => {
  it('searches once for a colour, however many lines ask for it', () => {
    const math = vi.spyOn(Math, 'pow');
    try {
      const first = autoChatBubble('#123456', 'light', 61.5);
      const searched = math.mock.calls.length;

      for (let line = 0; line < 50; line++) expect(autoChatBubble('#123456', 'light', 61.5)).toBe(first);

      expect(searched).toBeGreaterThan(0);
      expect(math.mock.calls.length).toBe(searched);
    } finally {
      math.mockRestore();
    }
  });

  it('works it out again once a skin has moved the page it sits on', () => {
    const was = chatBubbleBaseTone('light');
    try {
      setChatBubbleBaseTone('light', 96);
      const onPale = autoChatBubble('#654321', 'light');
      setChatBubbleBaseTone('light', 70);
      const onDeeper = autoChatBubble('#654321', 'light');

      expect(onDeeper).not.toBe(onPale);
      expect(onDeeper).toBe(autoChatBubble('#654321', 'light', 70));
    } finally {
      setChatBubbleBaseTone('light', was);
    }
  });
});
