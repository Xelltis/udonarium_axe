import { Pipe, PipeTransform } from '@angular/core';
import {
  contrastRatio,
  lchToRgb,
  parseHexColor,
  relativeLuminance,
  rgbToCss,
  rgbToLch,
} from '@axe/core/util/tonal-color';
import { chatBubbleBaseTone } from '@axe/domain/ui/chat-bubble-base';

/** What the bubble aims for when it is worked out: the reading standard for body text. */
export const CHAT_TARGET_RATIO = 4.5;

/**
 * How badly a pair has to read before the panel says anything about it.
 *
 * Saying so at the standard itself means saying so about a pair that missed it by a
 * hundredth, which reads as the panel refusing to be satisfied. This is the figure below
 * which a colour is genuinely hard to make out rather than merely short of the mark.
 */
export const CHAT_WARN_RATIO = 3;

/** Only a whisper of the speaker's hue: more of it costs the contrast the text needs. */
const BUBBLE_CHROMA = 8;

/** How finely the search walks the tone, and how far it may go before it gives up. */
const TONE_STEP = 0.5;
const TONE_FLOOR = 6;
const TONE_CEILING = 98;

/**
 * The bubble nearest the page's own background that the chosen colour can be read on.
 *
 * The colour belongs to the reader and is never touched, so the bubble is what moves, and
 * it leaves the background it shares with every other panel only as far as it must, in
 * whichever direction is nearer.
 */
export function autoChatBubble(color: string, theme: 'light' | 'dark', base?: number): string {
  const rgb = parseHexColor(color);
  if (!rgb) return '';

  const { chroma, hue } = rgbToLch(rgb);
  const tint = Math.min(chroma, BUBBLE_CHROMA);
  const textLum = relativeLuminance(rgb);
  const baseTone = base ?? chatBubbleBaseTone(theme);
  // Measured on the colour as it will be written out, so what is returned is what was tested:
  // a tone that clears the standard as a float can fall a hair under it once it is a byte.
  const shown = (tone: number) => parseHexColor(cssToHex(rgbToCss(lchToRgb({ tone, chroma: tint, hue }))))!;
  const at = (tone: number) => relativeLuminance(shown(tone));
  const reads = (tone: number) => contrastRatio(textLum, at(tone)) >= CHAT_TARGET_RATIO;

  if (reads(baseTone)) return rgbToCss(lchToRgb({ tone: baseTone, chroma: tint, hue }));

  for (let away = TONE_STEP; away <= 100; away += TONE_STEP) {
    const up = baseTone + away;
    const down = baseTone - away;
    const upReads = up <= TONE_CEILING && reads(up);
    const downReads = down >= TONE_FLOOR && reads(down);
    if (upReads && downReads) {
      const better = contrastRatio(textLum, at(up)) >= contrastRatio(textLum, at(down)) ? up : down;
      return rgbToCss(lchToRgb({ tone: better, chroma: tint, hue }));
    }
    if (upReads) return rgbToCss(lchToRgb({ tone: up, chroma: tint, hue }));
    if (downReads) return rgbToCss(lchToRgb({ tone: down, chroma: tint, hue }));
  }

  const best =
    contrastRatio(textLum, at(TONE_CEILING)) >= contrastRatio(textLum, at(TONE_FLOOR)) ? TONE_CEILING : TONE_FLOOR;
  return rgbToCss(lchToRgb({ tone: best, chroma: tint, hue }));
}

/** How well a colour reads on a given bubble, or on the one it would be given. */
export function chatColorContrast(color: string, bubble: string, theme: 'light' | 'dark'): number {
  const text = parseHexColor(color);
  if (!text) return 0;
  const shown = parseHexColor(bubble) ?? parseHexColor(cssToHex(autoChatBubble(color, theme)));
  if (!shown) return 0;
  return contrastRatio(relativeLuminance(text), relativeLuminance(shown));
}

export function cssToHex(css: string): string {
  const match = /rgb\((\d+),(\d+),(\d+)\)/.exec(css);
  if (!match) return css;
  return '#' + [1, 2, 3].map((i) => Number(match[i]).toString(16).padStart(2, '0')).join('');
}

/** A border that stands off the bubble it surrounds, whichever way there is room to go. */
function borderFor(bubbleCss: string): string {
  const rgb = parseHexColor(cssToHex(bubbleCss));
  if (!rgb) return bubbleCss;
  const { tone, chroma, hue } = rgbToLch(rgb);
  return rgbToCss(lchToRgb({ tone: tone > 50 ? tone - 14 : tone + 16, chroma, hue }));
}

@Pipe({ name: 'chatColorStyle', pure: true })
export class ChatColorStylePipe implements PipeTransform {
  /**
   * The colour a message is shown in, and the bubble it sits on.
   *
   * The colour is the reader's own and is used exactly as it was chosen. The bubble is
   * theirs too when they have set one for this theme; where they have not, one is worked
   * out that the colour can be read on.
   */
  transform(
    color: string | null | undefined,
    theme: 'light' | 'dark' = 'light',
    bubble?: string | null,
    base?: number
  ): Record<string, string> | null {
    if (!color) return null;
    if (!parseHexColor(color)) return null;

    const chosen =
      bubble && parseHexColor(bubble) ? rgbToCss(parseHexColor(bubble)!) : autoChatBubble(color, theme, base);

    return {
      color,
      'background-color': chosen,
      '--bubble-bg': chosen,
      '--ui-bubble-caret-border': borderFor(chosen),
    };
  }
}
