import { parseHexColor, rgbToLch } from '@axe/core/util/tonal-color';

/** The background every other panel on the page has when no skin is painted: `--ui-elevated`. */
const STANDARD_HEX: Record<'light' | 'dark', string> = { light: '#e8dded', dark: '#21262d' };

const STANDARD_TONE: Record<'light' | 'dark', number> = {
  light: rgbToLch(parseHexColor(STANDARD_HEX.light)!).tone,
  dark: rgbToLch(parseHexColor(STANDARD_HEX.dark)!).tone,
};

let tone: Record<'light' | 'dark', number> = { ...STANDARD_TONE };

/** Where the panels sit now. A bubble is worked out against this and nothing else. */
export function chatBubbleBaseTone(theme: 'light' | 'dark'): number {
  return tone[theme];
}

/**
 * Moves the tone a bubble is measured against, which a skin has to do.
 *
 * A skin that lifts or drops its panels changes the page a bubble sits on, and a bubble
 * worked out against a page that is no longer there is either invisible or shouting.
 */
export function setChatBubbleBaseTone(theme: 'light' | 'dark', value: number): void {
  tone = { ...tone, [theme]: value };
}

/** Back to the tones the stylesheet's own light and dark blocks carry. */
export function resetChatBubbleBaseTone(): void {
  tone = { ...STANDARD_TONE };
}
