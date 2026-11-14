import { clamp, clamp01 } from '@axe/core/util/clamp';
import { hexChannels } from '@axe/core/util/hex-color';

/** A colour apart from its clearness: the colour as six hex digits, and how opaque it is, from clear at 0 to solid at 1. */
export interface PaintedColor {
  readonly colour: string;
  readonly opacity: number;
}

const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;

/**
 * A colour as the page reports one it has worked out, `rgb()` or `rgba()` with its parts in numbers,
 * or as one is written in hex, taken apart into the colour and how opaque it is. Null for a colour
 * written any other way.
 */
export function paintedColorOf(text: string): PaintedColor | null {
  const written = text.trim();
  const parts = RGB.exec(written);
  if (!parts) {
    const channels = written.startsWith('#') ? hexChannels(written) : null;
    return channels ? { colour: hexOf(channels), opacity: 1 } : null;
  }
  const channels = [parts[1], parts[2], parts[3]].map(Number);
  const alpha = parts[4] === undefined ? 1 : Number(parts[4]) / (parts[5] ? 100 : 1);
  if (![...channels, alpha].every(Number.isFinite)) return null;
  return { colour: hexOf(channels), opacity: clamp01(alpha) };
}

function hexOf(channels: readonly number[]): string {
  const digits = channels.map((channel) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, '0')
  );
  return `#${digits.join('')}`;
}
