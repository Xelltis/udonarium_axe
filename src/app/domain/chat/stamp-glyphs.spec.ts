import { sealStampSvg } from '@axe/domain/chat/stamp-glyphs';

describe('the seals stamps are drawn as', () => {
  it('fills a seal with one character, stands two of a script written downward one above the other, and presses the rest across', () => {
    expect(sealStampSvg('草', '#d2382b').match(/<text /g)).toHaveLength(1);
    expect(sealStampSvg('了解', '#d2382b').match(/<text /g)).toHaveLength(2);

    const across = sealStampSvg('SEEN', '#d2382b');
    expect(across.match(/<text /g)).toHaveLength(1);
    expect(across).toContain('textLength="70"');
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
