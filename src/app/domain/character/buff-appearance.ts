import { BuffTiming, isBuffTimingToken, resolveBuffTiming } from '@axe/domain/character/buff-timing';
export interface BuffColor {
  id: string;
  hex: string;
}

export interface BuffAppearance {
  color?: string;
  icon?: string;
  timing?: BuffTiming;
  trigger?: string;
}

export const DEFAULT_BUFF_COLOR = 'rgba(0,0,0,0.7)';

export const BUFF_COLORS: readonly BuffColor[] = [
  { id: 'red', hex: '#c62828' },
  { id: 'orange', hex: '#ef6c00' },
  { id: 'yellow', hex: '#f9a825' },
  { id: 'green', hex: '#2e7d32' },
  { id: 'blue', hex: '#1565c0' },
  { id: 'purple', hex: '#6a1b9a' },
  { id: 'pink', hex: '#ad1457' },
  { id: 'gray', hex: '#455a64' },
];

const COLOR_ALIASES: Record<string, string> = {
  赤: 'red',
  橙: 'orange',
  黄: 'yellow',
  緑: 'green',
  青: 'blue',
  紫: 'purple',
  桃: 'pink',
  灰: 'gray',
  grey: 'gray',
};

const DEFAULT_TOKENS = ['default', 'none', '既定', 'なし', '黒'];
const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Turns a colour token into a css colour. Empty for a reset and for anything unknown. */
export function resolveBuffColor(token: string): string {
  const normalized = (token ?? '').trim();
  if (normalized.length < 1) return '';
  if (HEX_PATTERN.test(normalized)) return normalized.toLowerCase();

  const lowered = normalized.toLowerCase();
  if (DEFAULT_TOKENS.includes(lowered)) return '';

  const id = COLOR_ALIASES[normalized] ?? COLOR_ALIASES[lowered] ?? lowered;
  return BUFF_COLORS.find((color) => color.id === id)?.hex ?? '';
}

/**
 * Whether a chat token names a buff colour: a hex, a known colour name or alias, or a word asking
 * for the default one. Blank text never does.
 */
export function isBuffColorToken(token: string): boolean {
  const normalized = (token ?? '').trim().toLowerCase();
  if (normalized.length < 1) return false;
  return DEFAULT_TOKENS.includes(normalized) || resolveBuffColor(normalized).length > 0;
}

/** Sorts tokens such as a colour name and an icon, in whichever order they come. */
export function parseBuffAppearance(tokens: readonly string[]): BuffAppearance {
  const appearance: BuffAppearance = {};
  for (const token of tokens) {
    const value = (token ?? '').trim();
    if (value.length < 1) continue;
    if (isBuffColorToken(value)) {
      appearance.color = resolveBuffColor(value);
      continue;
    }
    if (isBuffTimingToken(value)) {
      appearance.timing = resolveBuffTiming(value)!;
      continue;
    }
    if (value.startsWith('@') && value.length > 1) {
      appearance.trigger = value.slice(1);
      continue;
    }
    appearance.icon = value;
  }
  return appearance;
}
