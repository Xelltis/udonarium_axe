import { clamp } from '@axe/core/util/clamp';
import { hexChannels } from '@axe/core/util/hex-color';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';

/*
 * The colours a cut is painted in. A blade's two colours are often pale, and a pale crescent is lost
 * over a bright table; so its body is its dark colour taken to the full strength of its hue, with a
 * rim of the same hue taken nearly to black about it, a paler band within, and a heart that is all
 * but white. A colour with no hue to tell, a grey or a white, is left as it is.
 */

/** The colours of a cut, from its outline in to its heart. */
export interface BladeTones {
  readonly rim: string;
  readonly body: string;
  readonly pale: string;
  readonly hot: string;
  /** The light it throws about itself. */
  readonly glow: string;
}

/** How little colour a colour may have, from 0 to 1, and still be taken for having a hue. */
const HUED = 0.1;

/** A colour's hue in turns, how coloured it is and how light, each from 0 to 1. */
function hslOf(color: string): [number, number, number] {
  const [r, g, b] = (hexChannels(color) ?? [128, 128, 128]).map((channel) => channel / 255);
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const light = (high + low) / 2;
  const span = high - low;
  if (span < 0.001) return [0, 0, light];
  const strength = span / (1 - Math.abs(2 * light - 1));
  const hue = high === r ? ((g - b) / span + 6) % 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return [hue / 6, strength, light];
}

/** The hex colour of a hue in turns, a strength and a lightness. */
function hexOfHsl(hue: number, strength: number, light: number): string {
  const chroma = (1 - Math.abs(2 * light - 1)) * strength;
  const channel = (offset: number): string => {
    const at = (offset + hue * 12) % 12;
    const value = light - (chroma / 2) * Math.max(-1, Math.min(at - 3, 9 - at, 1));
    return Math.round(clamp(value, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** The colours a cut of a blade's light and dark colours is painted in; see the head of this file. */
export function bladeTonesOf(light: string, dark: string): BladeTones {
  const [hue, strength, lightness] = hslOf(dark);
  const hot = mixColor(light, '#ffffff', 0.7);
  if (strength < HUED) {
    return {
      rim: mixColor(dark, '#05070c', 0.85),
      body: mixColor(dark, '#05070c', lightness > 0.6 ? 0.25 : 0),
      pale: mixColor(dark, light, 0.6),
      hot,
      glow: mixColor(dark, light, 0.4),
    };
  }
  const body = hexOfHsl(hue, Math.max(strength, 0.92), clamp(lightness, 0.46, 0.54));
  return {
    rim: hexOfHsl(hue, 0.85, 0.13),
    body,
    pale: mixColor(hexOfHsl(hue, 1, 0.72), light, 0.25),
    hot,
    glow: hexOfHsl(hue, 1, 0.62),
  };
}
