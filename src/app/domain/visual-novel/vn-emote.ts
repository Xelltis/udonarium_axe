export type VnMessageKind = 'normal' | 'narration' | 'location' | 'scene';
export type VnBubbleShape = 'normal' | 'thought' | 'shout' | 'whisper';
export type VnBubbleAnimation = 'none' | 'shake' | 'pop' | 'pulse' | 'float';
export type VnPortraitEmote = 'none' | 'jump' | 'tremble' | 'zoom' | 'nod' | 'sway' | 'droop';
export type VnEmotionMark = 'none' | 'surprise' | 'question' | 'anger' | 'sweat' | 'heart' | 'note' | 'silence';

export const VN_MESSAGE_KINDS: readonly VnMessageKind[] = ['normal', 'narration', 'location', 'scene'];
export const VN_BUBBLE_SHAPES: readonly VnBubbleShape[] = ['normal', 'thought', 'shout', 'whisper'];
export const VN_BUBBLE_ANIMATIONS: readonly VnBubbleAnimation[] = ['none', 'shake', 'pop', 'pulse', 'float'];
export const VN_PORTRAIT_EMOTES: readonly VnPortraitEmote[] = [
  'none',
  'jump',
  'tremble',
  'zoom',
  'nod',
  'sway',
  'droop',
];
export const VN_EMOTION_MARKS: readonly VnEmotionMark[] = [
  'none',
  'surprise',
  'question',
  'anger',
  'sweat',
  'heart',
  'note',
  'silence',
];

export interface VnEmote {
  kind: VnMessageKind;
  shape: VnBubbleShape;
  bubbleAnimation: VnBubbleAnimation;
  portraitEmote: VnPortraitEmote;
  emotionMark: VnEmotionMark;
  flipped: boolean;
  exited: boolean;
}

export const VN_EMOTE_DEFAULT: VnEmote = {
  kind: 'normal',
  shape: 'normal',
  bubbleAnimation: 'none',
  portraitEmote: 'none',
  emotionMark: 'none',
  flipped: false,
  exited: false,
};

export const VN_EMOTION_MARK_CHARS: Record<Exclude<VnEmotionMark, 'none'>, string> = {
  surprise: '！',
  question: '？',
  anger: '💢',
  sweat: '💧',
  heart: '♥',
  note: '♪',
  silence: '…',
};

const FLIP_CODE = 'flip';
const EXIT_CODE = 'exit';

/**
 * How a line's staging is written down beside it.
 *
 * Only what differs from the default is written, so a plain line says nothing at all. The
 * prefixes keep two settings from ever meaning the same word, and let a reader skip a token it
 * has never heard of rather than throwing the whole line's staging away: a room where one
 * player runs an older build should lose the one effect it cannot name, not all of them.
 */
const CODE_PREFIX = {
  kind: 'kind:',
  shape: 'shape:',
  bubbleAnimation: 'bubble:',
  portraitEmote: 'portrait:',
  emotionMark: 'mark:',
} as const;

function isMember<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

/** Writes a line's staging as space-separated codes, leaving out every default; a plain line gives an empty string. */
export function encodeVnEmote(emote: VnEmote): string {
  const codes: string[] = [];
  if (emote.kind !== 'normal') codes.push(CODE_PREFIX.kind + emote.kind);
  if (emote.shape !== 'normal') codes.push(CODE_PREFIX.shape + emote.shape);
  if (emote.bubbleAnimation !== 'none') codes.push(CODE_PREFIX.bubbleAnimation + emote.bubbleAnimation);
  if (emote.portraitEmote !== 'none') codes.push(CODE_PREFIX.portraitEmote + emote.portraitEmote);
  if (emote.emotionMark !== 'none') codes.push(CODE_PREFIX.emotionMark + emote.emotionMark);
  if (emote.flipped) codes.push(FLIP_CODE);
  if (emote.exited) codes.push(EXIT_CODE);
  return codes.join(' ');
}

/**
 * Reads a line's staging back from its codes, starting from the defaults.
 *
 * Codes it does not recognise, including values from a newer build, are skipped one by one so the rest
 * still apply.
 */
export function decodeVnEmote(code: string | null | undefined): VnEmote {
  const emote = { ...VN_EMOTE_DEFAULT };
  if (code == null) return emote;
  for (const token of code.split(/\s+/)) {
    if (token.length < 1) continue;
    if (token === FLIP_CODE) {
      emote.flipped = true;
    } else if (token === EXIT_CODE) {
      emote.exited = true;
    } else if (token.startsWith(CODE_PREFIX.kind)) {
      const value = token.slice(CODE_PREFIX.kind.length);
      if (isMember(VN_MESSAGE_KINDS, value)) emote.kind = value;
    } else if (token.startsWith(CODE_PREFIX.shape)) {
      const value = token.slice(CODE_PREFIX.shape.length);
      if (isMember(VN_BUBBLE_SHAPES, value)) emote.shape = value;
    } else if (token.startsWith(CODE_PREFIX.bubbleAnimation)) {
      const value = token.slice(CODE_PREFIX.bubbleAnimation.length);
      if (isMember(VN_BUBBLE_ANIMATIONS, value)) emote.bubbleAnimation = value;
    } else if (token.startsWith(CODE_PREFIX.portraitEmote)) {
      const value = token.slice(CODE_PREFIX.portraitEmote.length);
      if (isMember(VN_PORTRAIT_EMOTES, value)) emote.portraitEmote = value;
    } else if (token.startsWith(CODE_PREFIX.emotionMark)) {
      const value = token.slice(CODE_PREFIX.emotionMark.length);
      if (isMember(VN_EMOTION_MARKS, value)) emote.emotionMark = value;
    }
  }
  return emote;
}

/** Whether a line's staging differs from the default in any way. */
export function hasVnEmote(emote: VnEmote): boolean {
  return encodeVnEmote(emote).length > 0;
}

/**
 * The staging of a line, from beside it where it is now kept, or from the end of the line
 * itself for anything said before it was kept apart.
 */
export function vnEmoteOf(code: string | null | undefined, text: string): VnEmote {
  if (code != null && code.length > 0) return decodeVnEmote(code);
  const { text: _body, ...emote } = parseLegacyVnEmoteSuffix(text);
  return emote;
}

/** What was said, without the staging an older line carries at the end of it. */
export function vnBodyOf(code: string | null | undefined, text: string): string {
  if (text == null) return '';
  if (code != null && code.length > 0) return text;
  return splitLegacyVnEmoteSuffix(text).text;
}

const LEGACY_FLIP_TOKEN = '反転';
const LEGACY_EXIT_TOKEN = '退場';

const LEGACY_MESSAGE_KIND_TOKENS: Record<Exclude<VnMessageKind, 'normal'>, string> = {
  narration: '地の文',
  location: 'ロケーション',
  scene: '場面転換',
};

const LEGACY_SHAPE_TOKENS: Record<Exclude<VnBubbleShape, 'normal'>, string> = {
  thought: 'もやもや',
  shout: '叫び',
  whisper: 'ささやき',
};

const LEGACY_BUBBLE_ANIMATION_TOKENS: Record<Exclude<VnBubbleAnimation, 'none'>, string> = {
  shake: 'ゆれ',
  pop: 'ぽよん',
  pulse: 'ドキドキ',
  float: 'ふわふわ',
};

const LEGACY_PORTRAIT_EMOTE_TOKENS: Record<Exclude<VnPortraitEmote, 'none'>, string> = {
  jump: 'ジャンプ',
  tremble: 'ぶるぶる',
  zoom: 'ズーム',
  nod: 'うなずき',
  sway: 'ゆらゆら',
  droop: 'しょんぼり',
};

const LEGACY_SUFFIX_PATTERN = /\s*〔([^〔〕]+)〕\s*$/;

function invert<T extends string>(tokens: Record<T, string>): Map<string, T> {
  return new Map(Object.entries(tokens).map(([key, token]) => [token as string, key as T]));
}

const LEGACY_MESSAGE_KIND_BY_TOKEN = invert(LEGACY_MESSAGE_KIND_TOKENS);
const LEGACY_SHAPE_BY_TOKEN = invert(LEGACY_SHAPE_TOKENS);
const LEGACY_BUBBLE_ANIMATION_BY_TOKEN = invert(LEGACY_BUBBLE_ANIMATION_TOKENS);
const LEGACY_PORTRAIT_EMOTE_BY_TOKEN = invert(LEGACY_PORTRAIT_EMOTE_TOKENS);
const LEGACY_EMOTION_MARK_BY_TOKEN = invert(VN_EMOTION_MARK_CHARS);

/**
 * Reads the staging written into the end of the line itself, where an older line carries it.
 *
 * Anything unaccounted for gives the whole bracket up as ordinary text: written this way there
 * is no telling a staging note from something a player typed, so a bracket is only read as one
 * when every word in it is a word this writes.
 */
export function parseLegacyVnEmoteSuffix(text: string): VnEmote & { text: string } {
  const result = { ...VN_EMOTE_DEFAULT, text };
  const matched = LEGACY_SUFFIX_PATTERN.exec(text);
  if (!matched) return result;

  const tokens = matched[1].split('・').map((token) => token.trim());
  if (tokens.length < 1) return result;

  const parsed = { ...VN_EMOTE_DEFAULT };
  const seen = new Set<'kind' | 'shape' | 'bubble' | 'portrait' | 'mark' | 'flip' | 'exit'>();
  for (const token of tokens) {
    if (token === LEGACY_FLIP_TOKEN) {
      if (seen.has('flip')) return result;
      seen.add('flip');
      parsed.flipped = true;
      continue;
    }
    if (token === LEGACY_EXIT_TOKEN) {
      if (seen.has('exit')) return result;
      seen.add('exit');
      parsed.exited = true;
      continue;
    }
    const kind = LEGACY_MESSAGE_KIND_BY_TOKEN.get(token);
    if (kind) {
      if (seen.has('kind')) return result;
      seen.add('kind');
      parsed.kind = kind;
      continue;
    }
    const shape = LEGACY_SHAPE_BY_TOKEN.get(token);
    if (shape) {
      if (seen.has('shape')) return result;
      seen.add('shape');
      parsed.shape = shape;
      continue;
    }
    const bubbleAnimation = LEGACY_BUBBLE_ANIMATION_BY_TOKEN.get(token);
    if (bubbleAnimation) {
      if (seen.has('bubble')) return result;
      seen.add('bubble');
      parsed.bubbleAnimation = bubbleAnimation;
      continue;
    }
    const portraitEmote = LEGACY_PORTRAIT_EMOTE_BY_TOKEN.get(token);
    if (portraitEmote) {
      if (seen.has('portrait')) return result;
      seen.add('portrait');
      parsed.portraitEmote = portraitEmote;
      continue;
    }
    const emotionMark = LEGACY_EMOTION_MARK_BY_TOKEN.get(token);
    if (emotionMark) {
      if (seen.has('mark')) return result;
      seen.add('mark');
      parsed.emotionMark = emotionMark;
      continue;
    }
    return result;
  }

  return { ...parsed, text: text.slice(0, matched.index) };
}

/**
 * Writes the staging into the end of the line, the way an older line carries it.
 *
 * Nothing new is written this way; it stands only so that lines written before the staging was
 * kept apart can still be read back and checked.
 */
export function buildLegacyVnEmoteSuffix(emote: VnEmote): string {
  const tokens: string[] = [];
  if (emote.kind !== 'normal') tokens.push(LEGACY_MESSAGE_KIND_TOKENS[emote.kind]);
  if (emote.shape !== 'normal') tokens.push(LEGACY_SHAPE_TOKENS[emote.shape]);
  if (emote.bubbleAnimation !== 'none') tokens.push(LEGACY_BUBBLE_ANIMATION_TOKENS[emote.bubbleAnimation]);
  if (emote.portraitEmote !== 'none') tokens.push(LEGACY_PORTRAIT_EMOTE_TOKENS[emote.portraitEmote]);
  if (emote.emotionMark !== 'none') tokens.push(VN_EMOTION_MARK_CHARS[emote.emotionMark]);
  if (emote.flipped) tokens.push(LEGACY_FLIP_TOKEN);
  if (emote.exited) tokens.push(LEGACY_EXIT_TOKEN);
  if (tokens.length < 1) return '';
  return ` 〔${tokens.join('・')}〕`;
}

/**
 * Separates an older line into what was said and the staging bracket at its end.
 *
 * The suffix is empty, and the text returned whole, when the line has no bracket that reads as staging.
 */
export function splitLegacyVnEmoteSuffix(text: string): { text: string; suffix: string } {
  const parsed = parseLegacyVnEmoteSuffix(text);
  if (parsed.text === text) return { text, suffix: '' };
  return { text: parsed.text, suffix: text.slice(parsed.text.length).trim() };
}
