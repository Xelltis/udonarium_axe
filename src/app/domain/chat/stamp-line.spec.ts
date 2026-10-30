import { joinStampLine, saidWithStamp, standInForStamp } from '@axe/domain/chat/stamp-line';

describe('the line a stamp is sent with', () => {
  it('puts the words standing in for the stamp on a last line of their own, after what was said', () => {
    expect(joinStampLine('いくぞ！', '［斬る!］')).toBe('いくぞ！\n［斬る!］');
    expect(joinStampLine('', '［斬る!］')).toBe('［斬る!］');
  });

  it('reads back what was said, all of it but the stand-in, and nothing for a stamp on its own', () => {
    expect(saidWithStamp(joinStampLine('一行目\n二行目', '［了解］'))).toBe('一行目\n二行目');
    expect(saidWithStamp(joinStampLine('', '［了解］'))).toBe('');
  });

  it('reads back the words standing in for the stamp, whatever was said with it', () => {
    expect(standInForStamp(joinStampLine('一行目\n二行目', '［了解］'))).toBe('［了解］');
    expect(standInForStamp(joinStampLine('', '［了解］'))).toBe('［了解］');
  });
});
