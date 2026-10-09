import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { stampLabelKey, stampNameKey, stampOf } from '@axe/domain/chat/stamp-catalog';

/**
 * The words that stand in for a stamp wherever it cannot be drawn, in brackets: the words written
 * on it, the name of a table mark, or for a picture from the room the name it has in a set, or else
 * the name of its file. Empty for a stamp this version does not know.
 */
export function stampWords(
  stampId: string,
  t: TranslateFn,
  nameInSet: (imageIdentifier: string) => string = () => ''
): string {
  const ref = stampOf(stampId);
  if (!ref) return '';
  let words: string;
  if (ref.kind === 'image') {
    const name =
      nameInSet(ref.imageIdentifier).trim() ||
      (ImageStorage.instance.get(ref.imageIdentifier)?.name ?? '').replace(/\.[^.]+$/, '').trim();
    words = name.length > 0 ? name : t('ui.stamp.picture');
  } else {
    words = t(ref.stamp.family === 'motif' ? stampNameKey(ref.stamp) : stampLabelKey(ref.stamp));
  }
  return t('ui.stamp.standIn', { words });
}
