import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { stampLabelKey, stampNameKey, stampOf } from '@axe/domain/chat/stamp-catalog';

/**
 * What a stamp is called where it is written out rather than drawn: the words written on it, the
 * name of a table mark, or for a picture from the room the name it has in a set, or else the name of
 * its file. Empty for a stamp this version does not know.
 */
export function stampLabel(
  stampId: string,
  t: TranslateFn,
  nameInSet: (imageIdentifier: string) => string = () => ''
): string {
  const ref = stampOf(stampId);
  if (!ref) return '';
  if (ref.kind === 'image') {
    const name =
      nameInSet(ref.imageIdentifier).trim() ||
      (ImageStorage.instance.get(ref.imageIdentifier)?.name ?? '').replace(/\.[^.]+$/, '').trim();
    return name.length > 0 ? name : t('ui.stamp.picture');
  }
  return t(ref.stamp.family === 'motif' ? stampNameKey(ref.stamp) : stampLabelKey(ref.stamp));
}

/**
 * The words that stand in for a stamp wherever it cannot be drawn: what it is called, in brackets.
 * Empty for a stamp this version does not know.
 */
export function stampWords(
  stampId: string,
  t: TranslateFn,
  nameInSet: (imageIdentifier: string) => string = () => ''
): string {
  const label = stampLabel(stampId, t, nameInSet);
  return label.length > 0 ? t('ui.stamp.standIn', { words: label }) : '';
}
