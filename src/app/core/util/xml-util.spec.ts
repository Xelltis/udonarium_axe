import {
  decodeEntityReference,
  encodeAttributeValue,
  encodeEntityReference,
  sanitizeXml,
  xml2element,
} from '@axe/core/util/xml-util';

describe('XmlUtil', () => {
  describe('encodeEntityReference()', () => {
    it('encodes an ampersand', () => {
      expect(encodeEntityReference('&')).toBe('&amp;');
    });

    it('encodes a less-than sign', () => {
      expect(encodeEntityReference('<')).toBe('&lt;');
    });

    it('encodes a greater-than sign', () => {
      expect(encodeEntityReference('>')).toBe('&gt;');
    });

    it('encodes a double quote', () => {
      expect(encodeEntityReference('"')).toBe('&quot;');
    });

    it('encodes a single quote', () => {
      expect(encodeEntityReference("'")).toBe('&apos;');
    });

    it('encodes several special characters at once', () => {
      expect(encodeEntityReference('<div class="test">&</div>')).toBe(
        '&lt;div class=&quot;test&quot;&gt;&amp;&lt;/div&gt;'
      );
    });

    it('leaves a string with nothing special in it alone', () => {
      expect(encodeEntityReference('hello world')).toBe('hello world');
    });

    it('returns an empty string for an empty string', () => {
      expect(encodeEntityReference('')).toBe('');
    });

    it('encodes a string carrying non-ascii text', () => {
      expect(encodeEntityReference('テスト&データ')).toBe('テスト&amp;データ');
    });
  });

  describe('encodeAttributeValue()', () => {
    it('escapes the markup characters as encodeEntityReference does', () => {
      expect(encodeAttributeValue('<a href="x">&\'</a>')).toBe(encodeEntityReference('<a href="x">&\'</a>'));
    });

    it('writes tabs and line breaks as character references', () => {
      expect(encodeAttributeValue('a\tb\nc\r\nd')).toBe('a&#9;b&#10;c&#13;&#10;d');
    });

    it('reads back with its line breaks through the parser', () => {
      const element = xml2element(`<node text="${encodeAttributeValue('first\nsecond')}" />`);
      expect(element?.getAttribute('text')).toBe('first\nsecond');
    });

    it('leaves a value without them as it is', () => {
      expect(encodeAttributeValue('plain テキスト')).toBe('plain テキスト');
    });
  });

  describe('sanitizeXml()', () => {
    function sanitizedByHand(xml: string): string {
      let result = '';
      for (let i = 0; i < xml.length; i++) {
        const code = xml.charCodeAt(i);
        if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) continue;
        if (code === 0xfffd || code === 0xfffe || code === 0xffff) continue;
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = i + 1 < xml.length ? xml.charCodeAt(i + 1) : 0;
          if (next < 0xdc00 || next > 0xdfff) continue;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
          const prev = i > 0 ? xml.charCodeAt(i - 1) : 0;
          if (prev < 0xd800 || prev > 0xdbff) continue;
        }
        result += xml[i];
      }
      return result.trim();
    }

    function randomText(seed: number, length: number): string {
      let state = seed;
      const next = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state;
      };
      const pool = [
        0x0000, 0x0008, 0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x001f, 0x0020, 0x0041, 0x3042, 0xd83d, 0xde00, 0xd800,
        0xdc00, 0xfffd, 0xfffe, 0xffff, 0x00e9,
      ];
      let text = '';
      for (let i = 0; i < length; i++) text += String.fromCharCode(pool[next() % pool.length]);
      return text;
    }

    it('drops control characters, lone surrogates and the replacement range', () => {
      expect(sanitizeXml('a\u0000b\u000bc\ufffdd')).toBe('abcd');
      expect(sanitizeXml('\ud83d\ude00')).toBe('\ud83d\ude00');
      expect(sanitizeXml('x\ud83dy\ude00z')).toBe('xyz');
      expect(sanitizeXml('  keep \t\n ')).toBe('keep');
    });

    it('agrees with a character by character walk over ten thousand random strings', () => {
      for (let seed = 1; seed <= 10000; seed++) {
        const text = randomText(seed, 1 + (seed % 24));
        expect(sanitizeXml(text)).toBe(sanitizedByHand(text));
      }
    });
  });

  describe('decodeEntityReference()', () => {
    it('decodes an ampersand', () => {
      expect(decodeEntityReference('&amp;')).toBe('&');
    });

    it('decodes a less-than sign', () => {
      expect(decodeEntityReference('&lt;')).toBe('<');
    });

    it('decodes a greater-than sign', () => {
      expect(decodeEntityReference('&gt;')).toBe('>');
    });

    it('decodes a double quote', () => {
      expect(decodeEntityReference('&quot;')).toBe('"');
    });

    it('decodes a single quote', () => {
      expect(decodeEntityReference('&apos;')).toBe("'");
    });

    it('decoding several entities together', () => {
      expect(decodeEntityReference('&lt;div&gt;&amp;&lt;/div&gt;')).toBe('<div>&</div>');
    });

    it('leaves a string with no entities alone', () => {
      expect(decodeEntityReference('hello world')).toBe('hello world');
    });

    it('returns an empty string for an empty string', () => {
      expect(decodeEntityReference('')).toBe('');
    });
  });

  describe('encode/decode the round trip', () => {
    it('comes back unchanged', () => {
      const original = 'Hello <World> & "test" \'value\'';
      const encoded = encodeEntityReference(original);
      const decoded = decodeEntityReference(encoded);
      expect(decoded).toBe(original);
    });
  });

  describe('xml2element()', () => {
    it('reads valid xml into an element', () => {
      const element = xml2element('<root><child>text</child></root>');
      expect(element).toBeTruthy();
      expect(element!.tagName).toBe('root');
    });

    it('reads xml carrying attributes', () => {
      const element = xml2element('<item name="test" value="123" />');
      expect(element).toBeTruthy();
      expect(element!.getAttribute('name')).toBe('test');
      expect(element!.getAttribute('value')).toBe('123');
    });

    it('reads xml carrying children', () => {
      const element = xml2element('<parent><child1/><child2/></parent>');
      expect(element!.children.length).toBe(2);
    });

    it('returns nothing for broken xml', () => {
      const element = xml2element('<unclosed>');
      expect(element).toBeNull();
    });

    it('strips the control characters', () => {
      const element = xml2element('<root>\x00\x01text</root>');
      expect(element).toBeTruthy();
      expect(element!.textContent).toBe('text');
    });

    it('strips the vertical tab and form feed', () => {
      const element = xml2element('<root>\x0B\x0Ctext</root>');
      expect(element).toBeTruthy();
      expect(element!.textContent).toBe('text');
    });

    it('keeps the tabs and line endings', () => {
      const element = xml2element('<root>\t\n\rtext</root>');
      expect(element).toBeTruthy();
      expect(element!.textContent).toContain('text');
      expect(element!.textContent).toContain('\t');
      expect(element!.textContent).toContain('\n');
    });

    it('strips the non-characters', () => {
      const element = xml2element('<root>\uFFFE\uFFFFtext</root>');
      expect(element).toBeTruthy();
      expect(element!.textContent).toBe('text');
    });

    it('keeps a valid surrogate pair, an emoji among them', () => {
      const element = xml2element('<root>\uD83D\uDE00</root>');
      expect(element).toBeTruthy();
      expect(element!.textContent).toBe('\uD83D\uDE00');
    });

    it('returns nothing for an empty string', () => {
      const element = xml2element('');
      expect(element).toBeNull();
    });
  });
});
