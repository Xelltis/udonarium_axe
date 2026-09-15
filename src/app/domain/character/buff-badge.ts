import { ImageStorage } from '@axe/core/storage/image-storage';
import { DEFAULT_BUFF_COLOR } from '@axe/domain/character/buff-appearance';
import { buffExpires } from '@axe/domain/character/buff-timing';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

export interface BuffBadge {
  identifier: string;
  icon: string;
  /** Where the picture is, for an icon naming one that was brought in. Empty for a mark. */
  iconUrl: string;
  name: string;
  effect: string;
  strength: string;
  rounds: number;
  /** Whether the rounds mean anything: a buff that waits to be taken away counts nothing down. */
  expires: boolean;
  color: string;
}

const DEFAULT_ICON = '✦';
const STRENGTH_PATTERN = /[+\-−]?\d+(?:\.\d+)?/;

/** Takes the strength alone out of an effect field. Empty when there is no number. */
export function parseBuffStrength(effect: string): string {
  const matched = STRENGTH_PATTERN.exec(effect ?? '');
  if (!matched) return '';

  const normalized = matched[0].replace('−', '-');
  return Number(normalized) === 0 ? '' : normalized;
}

/** The colour a buff's badge is drawn in, or the translucent black default when none was set. */
export function buffColorOf(element: DataElement): string {
  const color = (element.getAttribute(DataElementAttribute.BUFF_COLOR) ?? '').trim();
  return color.length > 0 ? color : DEFAULT_BUFF_COLOR;
}

/**
 * The mark shown on a buff's badge, or `✦` when none was set. It may name a picture instead;
 * `buffIconUrlOf` tells which.
 */
export function buffIconOf(element: DataElement): string {
  const icon = (element.getAttribute(DataElementAttribute.BUFF_ICON) ?? '').trim();
  return icon.length > 0 ? icon : DEFAULT_ICON;
}

/**
 * The picture an icon stands for, or nothing where it is a mark to be written.
 *
 * An icon is a mark by default - an emoji, a letter - but it may instead name a picture that
 * was brought into the room. Which it is, is answered by asking whether a picture goes by that
 * name rather than by the shape of the text, so no emoji can ever be mistaken for one.
 */
export function buffIconUrlOf(icon: string): string {
  // An emoji is never the name of a picture, and asking after one is a lookup guaranteed to
  // miss. Every badge on every row asks, so the ones that cannot be a name do not.
  if (icon.length < 1 || !IDENTIFIER_LIKE.test(icon)) return '';
  return ImageStorage.instance.get(icon)?.url ?? '';
}

/** What a picture's name is made of, which no emoji is. */
const IDENTIFIER_LIKE = /^[A-Za-z0-9_.:-]+$/;

/** Folds one buff into a badge of its icon, its strength and the rounds left. */
export function toBuffBadges(buffRoot: DataElement | null): BuffBadge[] {
  if (!buffRoot) return [];

  const badges: BuffBadge[] = [];
  const walk = (element: DataElement) => {
    for (const child of element.children) {
      const data = child as DataElement;
      if (data.children.length > 0) {
        walk(data);
        continue;
      }
      if (!data.isNumberResource) continue;

      const rounds = Number(data.value);
      const effect = `${data.currentValue ?? ''}`;
      const icon = buffIconOf(data);
      badges.push({
        identifier: data.identifier,
        icon,
        iconUrl: buffIconUrlOf(icon),
        name: data.name,
        effect,
        strength: parseBuffStrength(effect),
        rounds: Number.isFinite(rounds) ? rounds : 0,
        expires: buffExpires(data),
        color: buffColorOf(data),
      });
    }
  };
  walk(buffRoot);
  return badges;
}
