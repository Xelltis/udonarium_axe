import {
  buildLegacyVnEmoteSuffix,
  decodeVnEmote,
  encodeVnEmote,
  hasVnEmote,
  legacyVnSuffixSite,
  parseLegacyVnEmoteSuffix,
  splitLegacyVnEmoteSuffix,
  VN_EMOTE_DEFAULT,
  vnBodyOf,
  vnEmoteOf,
} from '@axe/domain/visual-novel/vn-emote';

describe('buildLegacyVnEmoteSuffix()', () => {
  it('returns nothing when everything is at its default', () => {
    expect(buildLegacyVnEmoteSuffix(VN_EMOTE_DEFAULT)).toBe('');
  });

  it('joins the shape, the balloon, the portrait and the mark into one suffix', () => {
    expect(
      buildLegacyVnEmoteSuffix({
        kind: 'normal',
        shape: 'shout',
        bubbleAnimation: 'shake',
        portraitEmote: 'jump',
        emotionMark: 'anger',
        flipped: false,
        exited: false,
      })
    ).toBe(' 〔叫び・ゆれ・ジャンプ・💢〕');
  });

  it('writes a suffix for even one of them', () => {
    expect(
      buildLegacyVnEmoteSuffix({
        kind: 'normal',
        shape: 'normal',
        bubbleAnimation: 'pop',
        portraitEmote: 'none',
        emotionMark: 'none',
        flipped: false,
        exited: false,
      })
    ).toBe(' 〔ぽよん〕');
    expect(
      buildLegacyVnEmoteSuffix({
        kind: 'normal',
        shape: 'thought',
        bubbleAnimation: 'none',
        portraitEmote: 'none',
        emotionMark: 'none',
        flipped: false,
        exited: false,
      })
    ).toBe(' 〔もやもや〕');
    expect(
      buildLegacyVnEmoteSuffix({
        kind: 'normal',
        shape: 'normal',
        bubbleAnimation: 'none',
        portraitEmote: 'none',
        emotionMark: 'surprise',
        flipped: false,
        exited: false,
      })
    ).toBe(' 〔！〕');
  });

  it('makes the round trip with the newer tokens as well', () => {
    const suffix = buildLegacyVnEmoteSuffix({
      kind: 'normal',
      shape: 'whisper',
      bubbleAnimation: 'float',
      portraitEmote: 'nod',
      emotionMark: 'sweat',
      flipped: false,
      exited: false,
    });
    expect(suffix).toBe(' 〔ささやき・ふわふわ・うなずき・💧〕');
    const parsed = parseLegacyVnEmoteSuffix(`ねえ、聞いて${suffix}`);
    expect(parsed.text).toBe('ねえ、聞いて');
    expect(parsed.shape).toBe('whisper');
    expect(parsed.bubbleAnimation).toBe('float');
    expect(parsed.portraitEmote).toBe('nod');
    expect(parsed.emotionMark).toBe('sweat');
  });
});

describe('parseLegacyVnEmoteSuffix()', () => {
  it('makes it with the kind of line too', () => {
    const narration = buildLegacyVnEmoteSuffix({
      kind: 'narration',
      shape: 'normal',
      bubbleAnimation: 'none',
      portraitEmote: 'none',
      emotionMark: 'none',
      flipped: false,
      exited: false,
    });
    expect(narration).toBe(' 〔地の文〕');
    const parsedNarration = parseLegacyVnEmoteSuffix(`一行は森の奥へ進んだ。${narration}`);
    expect(parsedNarration.kind).toBe('narration');
    expect(parsedNarration.text).toBe('一行は森の奥へ進んだ。');

    const parsedLocation = parseLegacyVnEmoteSuffix('忘れられた森 〔ロケーション〕');
    expect(parsedLocation.kind).toBe('location');
    expect(parsedLocation.text).toBe('忘れられた森');
  });

  it('reads a suffix it wrote back and takes it off the text', () => {
    const suffix = buildLegacyVnEmoteSuffix({
      kind: 'normal',
      shape: 'thought',
      bubbleAnimation: 'pulse',
      portraitEmote: 'tremble',
      emotionMark: 'none',
      flipped: false,
      exited: false,
    });
    const parsed = parseLegacyVnEmoteSuffix(`考え中…${suffix}`);
    expect(parsed.text).toBe('考え中…');
    expect(parsed.shape).toBe('thought');
    expect(parsed.bubbleAnimation).toBe('pulse');
    expect(parsed.portraitEmote).toBe('tremble');
  });

  it('leaves text without one alone', () => {
    const parsed = parseLegacyVnEmoteSuffix('こんにちは');
    expect(parsed.text).toBe('こんにちは');
    expect(parsed.shape).toBe('normal');
    expect(parsed.bubbleAnimation).toBe('none');
    expect(parsed.portraitEmote).toBe('none');
  });

  it('does not read a bracket holding an unknown token as one', () => {
    const parsed = parseLegacyVnEmoteSuffix('メモ 〔重要〕');
    expect(parsed.text).toBe('メモ 〔重要〕');
    expect(parsed.shape).toBe('normal');
  });

  it('does not read one holding two tokens of a kind as one', () => {
    const parsed = parseLegacyVnEmoteSuffix('やあ 〔ゆれ・ぽよん〕');
    expect(parsed.text).toBe('やあ 〔ゆれ・ぽよん〕');
    expect(parsed.bubbleAnimation).toBe('none');
  });

  it('ignores a bracket that is not at the end', () => {
    const parsed = parseLegacyVnEmoteSuffix('〔叫び〕という表記について');
    expect(parsed.text).toBe('〔叫び〕という表記について');
    expect(parsed.shape).toBe('normal');
  });
});

describe('the flip token', () => {
  it('makes the round trip', () => {
    const suffix = buildLegacyVnEmoteSuffix({ ...VN_EMOTE_DEFAULT, shape: 'shout', flipped: true });
    expect(suffix).toBe(' 〔叫び・反転〕');
    const parsed = parseLegacyVnEmoteSuffix(`どけっ！${suffix}`);
    expect(parsed.text).toBe('どけっ！');
    expect(parsed.shape).toBe('shout');
    expect(parsed.flipped).toBe(true);
  });

  it('reads a suffix that carries nothing else', () => {
    const parsed = parseLegacyVnEmoteSuffix('ふりむく 〔反転〕');
    expect(parsed.flipped).toBe(true);
    expect(parsed.text).toBe('ふりむく');
  });
});

describe('the exit token', () => {
  it('makes the round trip', () => {
    const suffix = buildLegacyVnEmoteSuffix({ ...VN_EMOTE_DEFAULT, flipped: true, exited: true });
    expect(suffix).toBe(' 〔反転・退場〕');
    const parsed = parseLegacyVnEmoteSuffix(`またね${suffix}`);
    expect(parsed.text).toBe('またね');
    expect(parsed.flipped).toBe(true);
    expect(parsed.exited).toBe(true);
  });

  it('leaves a line without one unexited', () => {
    expect(parseLegacyVnEmoteSuffix('やあ 〔叫び〕').exited).toBe(false);
  });
});

describe('splitLegacyVnEmoteSuffix()', () => {
  it('parts the body from the suffix', () => {
    const split = splitLegacyVnEmoteSuffix('やあ 〔叫び・ゆれ〕');
    expect(split.text).toBe('やあ');
    expect(split.suffix).toBe('〔叫び・ゆれ〕');
  });

  it('returns an empty suffix when there is none', () => {
    const split = splitLegacyVnEmoteSuffix('やあ');
    expect(split.text).toBe('やあ');
    expect(split.suffix).toBe('');
  });
});

describe('encodeVnEmote()', () => {
  it('writes nothing when everything is at its default', () => {
    expect(encodeVnEmote(VN_EMOTE_DEFAULT)).toBe('');
    expect(hasVnEmote(VN_EMOTE_DEFAULT)).toBe(false);
  });

  it('writes only what differs from the default', () => {
    expect(encodeVnEmote({ ...VN_EMOTE_DEFAULT, shape: 'shout', bubbleAnimation: 'shake' })).toBe(
      'shape:shout bubble:shake'
    );
    expect(encodeVnEmote({ ...VN_EMOTE_DEFAULT, exited: true })).toBe('exit');
  });

  it('makes the round trip with every setting at once', () => {
    const emote = {
      kind: 'narration',
      shape: 'whisper',
      bubbleAnimation: 'float',
      portraitEmote: 'droop',
      emotionMark: 'sweat',
      flipped: true,
      exited: true,
    } as const;
    expect(decodeVnEmote(encodeVnEmote(emote))).toEqual(emote);
  });
});

describe('decodeVnEmote()', () => {
  it('reads nothing as the default', () => {
    expect(decodeVnEmote('')).toEqual(VN_EMOTE_DEFAULT);
    expect(decodeVnEmote(null)).toEqual(VN_EMOTE_DEFAULT);
    expect(decodeVnEmote(undefined)).toEqual(VN_EMOTE_DEFAULT);
  });

  it('does not mind the order', () => {
    expect(decodeVnEmote('exit shape:shout kind:scene')).toEqual({
      ...VN_EMOTE_DEFAULT,
      kind: 'scene',
      shape: 'shout',
      exited: true,
    });
  });

  it('passes over a token it does not know and keeps the rest', () => {
    expect(decodeVnEmote('shape:shout wobble:hard mark:heart')).toEqual({
      ...VN_EMOTE_DEFAULT,
      shape: 'shout',
      emotionMark: 'heart',
    });
    expect(decodeVnEmote('portrait:somersault')).toEqual(VN_EMOTE_DEFAULT);
  });

  it('lets the last of a kind stand', () => {
    expect(decodeVnEmote('shape:shout shape:whisper').shape).toBe('whisper');
  });

  it('is not troubled by runs of spaces', () => {
    expect(decodeVnEmote('  shape:shout   flip  ')).toEqual({ ...VN_EMOTE_DEFAULT, shape: 'shout', flipped: true });
  });
});

describe('vnEmoteOf()', () => {
  it('reads what is kept beside the line', () => {
    expect(vnEmoteOf('shape:shout', 'なんだって！？').shape).toBe('shout');
  });

  it('falls back to the end of an older line', () => {
    expect(vnEmoteOf('', 'なんだって！？ 〔叫び〕').shape).toBe('shout');
    expect(vnEmoteOf(null, 'またね 〔退場〕').exited).toBe(true);
  });

  it('lets what is kept beside the line win over what is written in it', () => {
    expect(vnEmoteOf('shape:whisper', 'なんだって！？ 〔叫び〕').shape).toBe('whisper');
  });

  it('reads a plain line as the default', () => {
    expect(vnEmoteOf('', 'こんにちは')).toEqual(VN_EMOTE_DEFAULT);
  });
});

describe('vnBodyOf()', () => {
  it('leaves a line alone when the staging is kept beside it', () => {
    expect(vnBodyOf('shape:shout', 'なんだって！？')).toBe('なんだって！？');
  });

  it('takes the older suffix off', () => {
    expect(vnBodyOf('', 'なんだって！？ 〔叫び・ゆれ〕')).toBe('なんだって！？');
  });

  it('leaves a bracket alone once the staging is kept beside the line', () => {
    expect(vnBodyOf('shape:shout', 'メモ 〔重要〕')).toBe('メモ 〔重要〕');
  });

  it('leaves a bracket it cannot read alone', () => {
    expect(vnBodyOf('', 'メモ 〔重要〕')).toBe('メモ 〔重要〕');
  });
});

describe('legacyVnSuffixSite', () => {
  it('places a bracket read as staging, and each word in it', () => {
    const text = 'やめろ 〔叫び・ ゆれ 〕';
    const site = legacyVnSuffixSite(text)!;
    expect(text.slice(site.from, site.to)).toBe('〔叫び・ ゆれ 〕');
    expect(site.read).toBe(true);
    expect(site.words.map((word) => [text.slice(word.from, word.to), word.known])).toEqual([
      ['叫び', true],
      ['ゆれ', true],
    ]);
  });

  it('marks the word that gives the whole bracket up', () => {
    const site = legacyVnSuffixSite('メモ 〔叫び・重要〕')!;
    expect(site.read).toBe(false);
    expect(site.words.map((word) => word.known)).toEqual([true, false]);
  });

  it('reads a bracket with a kind twice as no staging, though every word is known', () => {
    const site = legacyVnSuffixSite('〔叫び・もやもや〕')!;
    expect(site.read).toBe(false);
    expect(site.words.every((word) => word.known)).toBe(true);
  });

  it('finds nothing where no bracket ends the line', () => {
    expect(legacyVnSuffixSite('〔叫び〕 です')).toBeNull();
  });
});
