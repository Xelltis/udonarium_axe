import { VN_EMOTE_DEFAULT } from '@axe/domain/visual-novel/vn-emote';
import { vnEmoteLabel, vnEmoteLabels } from '@axe/domain/visual-novel/vn-emote-label';

const japanese = (key: string) =>
  ({
    'feature.visualNovel.kind.narration': '地の文',
    'feature.visualNovel.shape.shout': '叫び',
    'feature.visualNovel.bubbleAnim.shake': 'ゆれ',
    'feature.visualNovel.portraitEmote.tremble': 'ぶるぶる',
    'feature.visualNovel.flipOn': '反転中',
    'feature.visualNovel.stageExit': '退場',
  })[key] ?? key;

const english = (key: string) =>
  ({
    'feature.visualNovel.shape.shout': 'Shout',
    'feature.visualNovel.bubbleAnim.shake': 'Shake',
  })[key] ?? key;

describe('vnEmoteLabels()', () => {
  it('says nothing about a line staged no particular way', () => {
    expect(vnEmoteLabels(VN_EMOTE_DEFAULT, japanese)).toEqual([]);
  });

  it('names each setting that differs from the default', () => {
    expect(
      vnEmoteLabels(
        { ...VN_EMOTE_DEFAULT, kind: 'narration', shape: 'shout', portraitEmote: 'tremble', exited: true },
        japanese
      )
    ).toEqual(['地の文', '叫び', 'ぶるぶる', '退場']);
  });

  it('leaves a mark as the glyph it is, which belongs to no language', () => {
    expect(vnEmoteLabels({ ...VN_EMOTE_DEFAULT, emotionMark: 'anger' }, japanese)).toEqual(['💢']);
  });

  it('reads in the language the room is played in', () => {
    const emote = { ...VN_EMOTE_DEFAULT, shape: 'shout', bubbleAnimation: 'shake' } as const;
    expect(vnEmoteLabels(emote, japanese)).toEqual(['叫び', 'ゆれ']);
    expect(vnEmoteLabels(emote, english)).toEqual(['Shout', 'Shake']);
  });
});

describe('vnEmoteLabel()', () => {
  it('brackets the labels for a chip', () => {
    expect(vnEmoteLabel({ ...VN_EMOTE_DEFAULT, shape: 'shout', bubbleAnimation: 'shake' }, japanese)).toBe(
      '〔叫び・ゆれ〕'
    );
  });

  it('is empty when there is nothing to say', () => {
    expect(vnEmoteLabel(VN_EMOTE_DEFAULT, japanese)).toBe('');
  });
});
