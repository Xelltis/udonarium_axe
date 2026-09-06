import { resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { HotbarSlotKind } from '@axe/domain/hotbar/hotbar-slot-kind';

const KIND_ICONS: Record<HotbarSlotKind, string> = {
  chat: 'chat_bubble',
  effect: 'auto_awesome',
  range: 'radar',
  diceDeploy: 'casino',
  panel: 'article',
  focus: 'my_location',
  sound: 'volume_up',
  cutIn: 'slideshow',
  prefill: 'edit_note',
  turn: 'skip_next',
  appearance: 'masks',
  group: 'playlist_play',
};

const KIND_COLORS: Record<HotbarSlotKind, string> = {
  chat: '#455a64',
  effect: '#6a1b9a',
  range: '#1565c0',
  diceDeploy: '#ef6c00',
  panel: '#455a64',
  focus: '#1565c0',
  sound: '#ad1457',
  cutIn: '#ad1457',
  prefill: '#455a64',
  turn: '#ef6c00',
  appearance: '#00838f',
  group: '#6a1b9a',
};

const DICE_PATTERN = /\d*[dD]\d+/;
const EFFECT_TOKEN_PATTERN = /《.+》/;

export function hotbarSlotIcon(kind: HotbarSlotKind, argument: string, icon = ''): string {
  const held = icon.trim();
  if (held.length > 0) return held;
  if (kind !== 'chat') return KIND_ICONS[kind];
  return chatMacroIcon(argument);
}

export function hotbarSlotColor(kind: HotbarSlotKind, color = ''): string {
  const resolved = resolveBuffColor(color);
  return resolved.length > 0 ? resolved : KIND_COLORS[kind];
}

/**
 * `resolvedName` is what the slot points at, looked up as it is drawn, so a rename shows through.
 */
export function hotbarSlotLabel(argument: string, label = '', resolvedName = ''): string {
  const held = label.trim();
  if (held.length > 0) return held;
  if (resolvedName.trim().length > 0) return resolvedName.trim();
  return firstLine(argument);
}

function firstLine(argument: string): string {
  for (const line of argument.split('\n')) {
    const held = line.trim();
    if (held.length > 0) return held;
  }
  return '';
}

function chatMacroIcon(argument: string): string {
  const text = firstLine(argument);
  if (text.startsWith(':')) return 'favorite';
  if (text.startsWith('&')) return 'auto_fix_high';
  if (EFFECT_TOKEN_PATTERN.test(text)) return 'auto_awesome';
  if (DICE_PATTERN.test(text)) return 'casino';
  return KIND_ICONS.chat;
}
