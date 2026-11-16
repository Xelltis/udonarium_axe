import {
  decodeI18nMessage,
  encodeI18nList,
  encodeI18nMessage,
  isI18nMessage,
} from '@axe/application/i18n/i18n-message';
import { TranslateFn } from '@axe/application/i18n/translate.token';

/** A translator that writes the key and its parameters out, so a test can see what reached it. */
const t: TranslateFn = (key, params) =>
  `${key}(${Object.entries(params ?? {})
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',')})`;

describe('i18n messages', () => {
  it('packs a key with its parameters and translates it back for the reader', () => {
    const packed = encodeI18nMessage('feature.zone.chat.joined', { name: '勇者' });

    expect(isI18nMessage(packed)).toBe(true);
    expect(decodeI18nMessage(packed, t)).toBe('feature.zone.chat.joined(name=勇者)');
  });

  it('translates a packed parameter before filling it in', () => {
    const packed = encodeI18nMessage('feature.coin.message.flipped', {
      who: 'GM',
      face: encodeI18nMessage('feature.coin.face.front'),
    });

    expect(decodeI18nMessage(packed, t)).toBe('feature.coin.message.flipped(who=GM,face=feature.coin.face.front())');
  });

  it('joins a packed list with its separator once each part is translated', () => {
    const packed = encodeI18nList(
      [encodeI18nMessage('feature.vote.votePrefix'), 'はい', encodeI18nMessage('a.b')],
      ' / '
    );

    expect(decodeI18nMessage(packed, t)).toBe('feature.vote.votePrefix() / はい / a.b()');
  });

  it('leaves text that was never packed, or whose parameters no longer parse, as it is', () => {
    expect(isI18nMessage('hello')).toBe(false);
    expect(decodeI18nMessage('hello', t)).toBe('hello');
    expect(decodeI18nMessage('@i18n:some.key:{broken', t)).toBe('@i18n:some.key:{broken');
    expect(decodeI18nMessage(null, t)).toBe('');
  });
});
