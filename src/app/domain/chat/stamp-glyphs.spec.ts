import { sealStampSvg } from '@axe/domain/chat/stamp-glyphs';

describe('the seals stamps are drawn as', () => {
  it('fills a seal with one character, stands two of a script written downward one above the other, and presses the rest across', () => {
    expect(sealStampSvg('草', '#d2382b').match(/<text /g)).toHaveLength(1);
    expect(sealStampSvg('了解', '#d2382b').match(/<text /g)).toHaveLength(2);

    const across = sealStampSvg('SEEN', '#d2382b');
    expect(across.match(/<text /g)).toHaveLength(1);
    expect(across).toContain('textLength="70"');
  });

  it('stands three characters in a column, and sets four in two columns read from the right, as on a seal', () => {
    const three = sealStampSvg('それな', '#d2382b');
    expect([...three.matchAll(/<text x="(\d+)" y="(\d+)"[^>]*>(.)</g)].map((m) => [m[3], m[1]])).toEqual([
      ['そ', '50'],
      ['れ', '50'],
      ['な', '50'],
    ]);

    const four = sealStampSvg('そうだね', '#d2382b');
    expect([...four.matchAll(/<text x="(\d+)" y="(\d+)"[^>]*>(.)</g)].map((m) => [m[3], m[1], m[2]])).toEqual([
      ['そ', '64', '47'],
      ['う', '64', '79'],
      ['だ', '36', '47'],
      ['ね', '36', '79'],
    ]);
  });

  it('counts the long vowel mark among the letters written downward', () => {
    expect(sealStampSvg('ゲーム', '#d2382b').match(/<text /g)).toHaveLength(3);
  });

  it('keeps the words of a seal whole, out of the rough ink its rings are in', () => {
    const seal = sealStampSvg('了解', '#d2382b');
    const rough = seal.slice(seal.indexOf('<g filter='), seal.indexOf('</g>'));

    expect(rough).not.toContain('<text');
    expect(seal.slice(seal.indexOf('</g>'))).toContain('<text');
  });

  it('roughens the rings over the whole field, so their outer edge is not cut off', () => {
    expect(sealStampSvg('了解', '#d2382b')).toContain(
      '<filter id="axe-stamp-seal-rough" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
    );
  });

  it('writes the words of a seal as words, never as markup', () => {
    expect(sealStampSvg('<b>', '#d2382b')).toContain('&lt;b&gt;');
  });

  it('draws the same seal once and hands it out after that', () => {
    expect(sealStampSvg('神', '#d2382b')).toBe(sealStampSvg('神', '#d2382b'));
  });
});
