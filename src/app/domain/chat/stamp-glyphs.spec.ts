import { stampsOfFamily } from '@axe/domain/chat/stamp-catalog';
import { motifStampSvg, sealStampSvg } from '@axe/domain/chat/stamp-glyphs';

describe('the pictures stamps are drawn as', () => {
  it('draws every table mark, and nothing for one it does not know', () => {
    for (const stamp of stampsOfFamily('motif')) {
      expect(motifStampSvg(stamp.key, stamp.color), stamp.key).toMatch(/^<svg [^>]*viewBox="0 0 100 100"/);
    }
    expect(motifStampSvg('dragon', '#000000')).toBe('');
  });

  it('writes the number the die came up on it', () => {
    expect(motifStampSvg('critical', '#f2b300')).toContain('>20</text>');
    expect(motifStampSvg('fumble', '#6b7383')).toContain('>1</text>');
  });

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

  it('writes the words of a seal as words, never as markup', () => {
    expect(sealStampSvg('<b>', '#d2382b')).toContain('&lt;b&gt;');
  });

  it('draws the same seal once and hands it out after that', () => {
    expect(sealStampSvg('神', '#d2382b')).toBe(sealStampSvg('神', '#d2382b'));
  });
});
