import { TranslateFn } from '@axe/application/i18n/translate.token';
import { VN_EMOTION_MARK_CHARS, VnEmote } from '@axe/domain/visual-novel/vn-emote';

/**
 * How a line's staging reads to somebody looking at it.
 *
 * The words come from the same keys the buttons that set them are labelled with, so a room
 * played in English says "Shout" where a Japanese one says 叫び. Written into the line itself
 * the words would be fixed in Japanese for everyone; kept apart, they can be read in the reader's
 * own language. A mark is a glyph and belongs to no language, so it stands as it is.
 */
export function vnEmoteLabels(emote: VnEmote, translate: TranslateFn): string[] {
  const labels: string[] = [];
  if (emote.kind !== 'normal') labels.push(translate(`feature.visualNovel.kind.${emote.kind}`));
  if (emote.shape !== 'normal') labels.push(translate(`feature.visualNovel.shape.${emote.shape}`));
  if (emote.bubbleAnimation !== 'none')
    labels.push(translate(`feature.visualNovel.bubbleAnim.${emote.bubbleAnimation}`));
  if (emote.portraitEmote !== 'none')
    labels.push(translate(`feature.visualNovel.portraitEmote.${emote.portraitEmote}`));
  if (emote.emotionMark !== 'none') labels.push(VN_EMOTION_MARK_CHARS[emote.emotionMark]);
  if (emote.flipped) labels.push(translate('feature.visualNovel.flipOn'));
  if (emote.exited) labels.push(translate('feature.visualNovel.stageExit'));
  return labels;
}

/** The same, as one line for a chip that has room for only one. */
export function vnEmoteLabel(emote: VnEmote, translate: TranslateFn): string {
  const labels = vnEmoteLabels(emote, translate);
  return labels.length > 0 ? `〔${labels.join('・')}〕` : '';
}
