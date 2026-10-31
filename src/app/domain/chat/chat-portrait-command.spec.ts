import {
  findImageIdentifierByName,
  parsePortraitCommand,
  portraitCommandSite,
  portraitNamedAtLineEnd,
  stripPortraitCommand,
} from '@axe/domain/chat/chat-portrait-command';

describe('chat-portrait-command', () => {
  describe('parsePortraitCommand / stripPortraitCommand', () => {
    it('recognises the hide command', () => {
      expect(parsePortraitCommand('hello @hide')).toEqual({ type: 'hide' });
    });

    it('reads hide however it is typed', () => {
      expect(parsePortraitCommand('hello @HIDE')).toEqual({ type: 'hide' });
      expect(parsePortraitCommand('hello ＠ｈｉｄｅ')).toEqual({ type: 'hide' });
    });

    it('recognises a numeric command', () => {
      expect(parsePortraitCommand('hello @12')).toEqual({ type: 'index', position: 12 });
    });

    it('reads a full-width number as a number', () => {
      expect(parsePortraitCommand('hello ＠２')).toEqual({ type: 'index', position: 2 });
    });

    it('reads a zero as the position it is, which no portrait holds', () => {
      expect(parsePortraitCommand('hello @0')).toEqual({ type: 'index', position: 0 });
    });

    it('recognises the name command', () => {
      expect(parsePortraitCommand('hello @笑顔')).toEqual({ type: 'name', name: '笑顔' });
    });

    it('keeps a name that ends in digits whole', () => {
      expect(parsePortraitCommand('hello @笑顔2')).toEqual({ type: 'name', name: '笑顔2' });
    });

    it('takes nothing from a line that ends in no command', () => {
      expect(parsePortraitCommand('hello')).toEqual({ type: 'none' });
      expect(parsePortraitCommand('mail@example.com')).toEqual({ type: 'none' });
    });

    it('strips a trailing command', () => {
      expect(stripPortraitCommand('hello @hide')).toBe('hello ');
      expect(stripPortraitCommand('hello')).toBe('hello');
    });
  });

  describe('findImageIdentifierByName', () => {
    const entries = [
      { label: '通常', identifier: 'id-normal' },
      { label: '笑顔', identifier: 'id-smile' },
      { label: '怒り', identifier: 'id-angry' },
    ];

    it('prefers an exact match', () => {
      expect(findImageIdentifierByName(entries, '笑顔')).toEqual({ identifier: 'id-smile', index: 1 });
    });

    it('falls back to a prefix match', () => {
      expect(findImageIdentifierByName(entries, '怒')).toEqual({ identifier: 'id-angry', index: 2 });
    });

    it('returns nothing when there is no match', () => {
      expect(findImageIdentifierByName(entries, '不存在')).toEqual({ identifier: '', index: 0 });
    });

    it('ignores the case and the width of what was typed', () => {
      const cased = [
        { label: 'Smile', identifier: 'id-smile' },
        { label: 'Angry', identifier: 'id-angry' },
      ];
      expect(findImageIdentifierByName(cased, 'smile')).toEqual({ identifier: 'id-smile', index: 0 });
      expect(findImageIdentifierByName(cased, 'ＡＮＧＲＹ')).toEqual({ identifier: 'id-angry', index: 1 });
    });

    it('never settles on a portrait nobody named', () => {
      const unnamed = [
        { label: '', identifier: 'id-first' },
        { label: '笑顔', identifier: 'id-smile' },
      ];
      expect(findImageIdentifierByName(unnamed, '笑')).toEqual({ identifier: 'id-smile', index: 1 });
      expect(findImageIdentifierByName(unnamed, '')).toEqual({ identifier: '', index: 0 });
    });
  });

  describe('portraitCommandSite', () => {
    it('spans the command from its mark to the end of its word', () => {
      const text = 'hello @笑顔 ';
      const site = portraitCommandSite(text)!;
      expect(text.slice(site.from, site.to)).toBe('@笑顔');
      expect(site.command).toEqual({ type: 'name', name: '笑顔' });
    });

    it('spans a command that is the whole line', () => {
      const site = portraitCommandSite('＠２')!;
      expect([site.from, site.to]).toEqual([0, 2]);
      expect(site.command).toEqual({ type: 'index', position: 2 });
    });

    it('finds nothing where no space comes before the mark', () => {
      expect(portraitCommandSite('mail@example.com')).toBeNull();
    });
  });

  describe('portraitNamedAtLineEnd', () => {
    it('takes a name the command reads back whole', () => {
      expect(portraitNamedAtLineEnd('笑顔')).toBe(true);
      expect(portraitNamedAtLineEnd('笑顔2')).toBe(true);
    });

    it('leaves out a name with a space in it, or one read as a position or as hide', () => {
      expect(portraitNamedAtLineEnd('笑顔 大')).toBe(false);
      expect(portraitNamedAtLineEnd(' 笑顔')).toBe(false);
      expect(portraitNamedAtLineEnd('2')).toBe(false);
      expect(portraitNamedAtLineEnd('Hide')).toBe(false);
      expect(portraitNamedAtLineEnd('')).toBe(false);
    });
  });

  describe('a stamp put right after the portrait command', () => {
    it('ends the command as a space would, and stays in the line as the command is taken off', () => {
      const text = 'こんにちは @笑顔［笑:sfx:laugh］';
      expect(parsePortraitCommand(text)).toEqual({ type: 'name', name: '笑顔' });
      expect(stripPortraitCommand(text)).toBe('こんにちは ［笑:sfx:laugh］');
    });
  });
});
