import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { stampLabelKey, stampNameKey, stampOf } from '@axe/domain/chat/stamp-catalog';

/**
 * The words that stand in for a stamp wherever it cannot be drawn, in brackets: the words written
 * on it, the name of a table mark, or the name of a picture from the room. Empty for a stamp this
 * version does not know.
 */
export function stampWords(stampId: string, t: TranslateFn): string {
  const ref = stampOf(stampId);
  if (!ref) return '';
  let words: string;
  if (ref.kind === 'image') {
    const name = (ImageStorage.instance.get(ref.imageIdentifier)?.name ?? '').replace(/\.[^.]+$/, '').trim();
    words = name.length > 0 ? name : t('ui.stamp.picture');
  } else {
    words = t(ref.stamp.family === 'motif' ? stampNameKey(ref.stamp) : stampLabelKey(ref.stamp));
  }
  return t('ui.stamp.standIn', { words });
}
