/**
 * The kinds of lettering a cut-in's text can be set in at a click, each as a list of fonts the
 * common systems carry, so every screen in the room finds one of its own that looks alike, ending
 * in a generic family for a screen that has none of them.
 *
 * The value written onto the layer is the list itself, the same as one typed by hand, so nothing
 * new is saved or synced, and the default is the empty list.
 */
export const CUT_IN_FONT_PRESETS = [
  { id: 'default', fontFamily: '' },
  {
    id: 'gothic',
    fontFamily: '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif',
  },
  {
    id: 'mincho',
    fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif',
  },
  {
    id: 'rounded',
    fontFamily:
      '"Hiragino Maru Gothic ProN", "HG丸ｺﾞｼｯｸM-PRO", "M PLUS Rounded 1c", "Kosugi Maru", "Arial Rounded MT Bold", sans-serif',
  },
  {
    id: 'mono',
    fontFamily: '"Osaka-Mono", "MS Gothic", "Noto Sans Mono CJK JP", "Courier New", monospace',
  },
] as const;

export type CutInFontPreset = (typeof CUT_IN_FONT_PRESETS)[number];
