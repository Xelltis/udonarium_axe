import { type ChatDecoration, decoratedRunsOf } from '@axe/domain/chat/chat-decoration';
import { parsePortraitCommand } from '@axe/domain/chat/chat-portrait-command';
import {
  type ChatRichLine,
  type ChatRichSegment,
  normalMarks,
  parseChatRichText,
  sameRichMarks,
  serializeChatRichText,
} from '@axe/domain/chat/chat-rich-text';

/** How the chat draws a message, letter by letter: a leading quote mark plain, line breaks plain. */
function drawn(text: string): { letter: string; marks: ChatDecoration | null }[] {
  const letters = decoratedRunsOf(text).flatMap((run) =>
    [...run.text].map((letter) => ({ letter, marks: normalMarks(run.decoration) }))
  );
  let lineStart = true;
  let quote = 0;
  for (const letter of letters) {
    if (letter.letter === '\n') {
      letter.marks = null;
      lineStart = true;
      continue;
    }
    if (lineStart) {
      const rest = letters
        .slice(letters.indexOf(letter))
        .map((each) => each.letter)
        .join('');
      quote = /^>\s?/.exec(rest)?.[0].length ?? 0;
      lineStart = false;
    }
    if (quote > 0) {
      letter.marks = null;
      quote--;
    }
  }
  return letters;
}

function drawnAlike(a: string, b: string): boolean {
  const left = drawn(a);
  const right = drawn(b);
  return (
    left.length === right.length &&
    left.every((each, index) => each.letter === right[index].letter && sameRichMarks(each.marks, right[index].marks))
  );
}

/**
 * Whether two lines are drawn alike but for the decoration of a backslash, which is written after a
 * mark that would otherwise follow it, since right before the mark it would keep the mark from
 * taking effect, and of a leading quote mark, which is drawn plain whatever decoration it falls in.
 */
function sameButBackslashes(a: ChatRichLine, b: ChatRichLine): boolean {
  const letters = (line: ChatRichLine) =>
    line.segments.flatMap((segment) =>
      [...(segment.kind === 'text' ? segment.text : segment.raw)].map((letter) => ({ letter, marks: segment.marks }))
    );
  const left = letters(a);
  const right = letters(b);
  const quote = /^>\s?/.exec(left.map((each) => each.letter).join(''))?.[0].length ?? 0;
  return (
    left.length === right.length &&
    left.every(
      (each, index) =>
        each.letter === right[index].letter &&
        (each.letter === '\\' || index < quote || sameRichMarks(each.marks, right[index].marks))
    )
  );
}

/** The text written back from what the text reads as, with every line taken as edited. */
function canonical(text: string, language: 'ja' | 'en' | 'ko' = 'ja'): string {
  const lines: ChatRichLine[] = parseChatRichText(text).lines.map((line) => ({ segments: line.segments }));
  return serializeChatRichText(lines, { language }).text;
}

function roundTrip(text: string): string {
  return serializeChatRichText(parseChatRichText(text).lines, { language: 'ja' }).text;
}

const BOLD: ChatDecoration = { bold: true, italic: false, strike: false, size: null, font: null, color: null };

const UNCHANGED = [
  '',
  '\n',
  'a\n\nb\n',
  '  x  ',
  '2d6+3',
  '3 2d6>=7 攻撃',
  'CC<=50 目星',
  ':HP-5',
  's:HP-1d6',
  '&毒/3/HP-1',
  'hi @笑顔',
  'やった 爆発',
  '《火球》',
  '《vs》',
  'dice:金',
  '〔判定〕',
  '> q\n> r',
  '\\s',
  'C:\\a\\**x',
  'a ** b',
  '***',
  '[1d6]',
  '[赤]閉じない',
  '[/]',
  '**一\n二**',
  '＊＊x＊＊',
  '{HP}',
  't{HP}',
  '{HP^}',
  '｛ＨＰ｝',
  'at{HP}',
  '|漢字《かんじ》',
  '｜漢字《かん|じ》',
  '**{HP}**',
  '2d6+{筋力}',
  '[赤]a**b**c[/赤]',
  '\\**a** b',
  '了解［了解:seal:ok］',
  '**［ドッ:sfx:boom］**［絵:image:abc］',
  '［メモ:todo:later］',
];

const CHANGED = [
  '[red]x[/]',
  '[太字]x[/太字]',
  '[#F00]x[/#F00]',
  '[#e5484d]x[/]',
  '[赤]a[青]b[/赤]c[/青]',
  '****x',
  '[赤][/赤]x',
  '[赤]a\nb[/赤]',
  '[赤]> q[/赤]',
  '\\**lone',
];

describe('chat-rich-text', () => {
  describe('a text nobody edits', () => {
    it.each([...UNCHANGED, ...CHANGED])('is written back to the letter: %j', (text) => {
      expect(roundTrip(text)).toBe(text);
    });
  });

  describe('a text written again as edited', () => {
    it.each([...UNCHANGED, ...CHANGED])('is drawn the same: %j', (text) => {
      expect(drawnAlike(canonical(text), text), canonical(text)).toBe(true);
    });

    it.each(['ja', 'en', 'ko'] as const)('reads back to the same lines in %s', (language) => {
      for (const text of [...UNCHANGED, ...CHANGED]) {
        const once = parseChatRichText(canonical(text, language)).lines.map((line) => line.segments);
        const twice = parseChatRichText(canonical(canonical(text, language), language)).lines.map(
          (line) => line.segments
        );
        expect(twice, text).toEqual(once);
      }
    });

    it('keeps commands, spaces and chips to the letter', () => {
      for (const text of UNCHANGED.filter((each) => !/[*[\]［］\\]/.test(each))) {
        expect(canonical(text), text).toBe(text);
      }
    });

    it('writes decorations the shortest way, in the reader\u2019s language', () => {
      expect(canonical('[red]x[/]')).toBe('[赤]x[/赤]');
      expect(canonical('[red]x[/]', 'en')).toBe('[red]x[/red]');
      expect(canonical('[太字]x[/太字]')).toBe('**x**');
      expect(canonical('[赤]a\nb[/赤]')).toBe('[赤]a[/赤]\n[赤]b[/赤]');
      expect(canonical('[#F00]x[/]')).toBe('[#ff0000]x[/#ff0000]');
    });

    it('keeps literal marks from taking effect only where they would', () => {
      const lines = (text: string, marks: ChatDecoration | null = null): ChatRichLine[] => [
        { segments: [{ kind: 'text', text, marks }] },
      ];
      expect(serializeChatRichText(lines('a ** b'), { language: 'ja' }).text).toBe('a ** b');
      expect(serializeChatRichText(lines('**a** b'), { language: 'ja' }).text).toBe('\\**a\\** b');
      expect(serializeChatRichText(lines('[赤]x[/赤]'), { language: 'ja' }).text).toBe('\\[赤]x\\[/赤]');
      const mixed = serializeChatRichText(
        [
          {
            segments: [
              { kind: 'text', text: '1**', marks: null },
              { kind: 'text', text: 'x', marks: BOLD },
            ],
          },
        ],
        { language: 'ja' }
      ).text;
      expect(
        drawnAlike(mixed, '1\\*\\***x**') ||
          drawn(mixed)
            .map((each) => each.letter)
            .join('') === '1**x'
      ).toBe(true);
    });

    it('keeps literal stars, backslashes and brackets as they stand beside marks', () => {
      const RED_HUGE: ChatDecoration = { ...BOLD, bold: false, size: 'huge', color: '#e5484d' };
      const cases: ChatRichLine[] = [
        { segments: [{ kind: 'text', text: '[\\**]@', marks: null }] },
        {
          segments: [
            { kind: 'text', text: 't\\', marks: null },
            { kind: 'text', text: '\\', marks: RED_HUGE },
            { kind: 'text', text: '@red', marks: null },
          ],
        },
        {
          segments: [
            { kind: 'text', text: '****', marks: null },
            { kind: 'text', text: 'x', marks: BOLD },
            { kind: 'text', text: '***', marks: null },
          ],
        },
      ];
      for (const line of cases) {
        const text = serializeChatRichText([line], { language: 'ja' }).text;
        const meant = line.segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.raw)).join('');
        expect(
          drawn(text)
            .map((each) => each.letter)
            .join(''),
          text
        ).toBe(meant);
      }
    });

    it('moves a backslash that would keep a mark from taking effect past the mark', () => {
      const text = serializeChatRichText(
        [
          {
            segments: [
              { kind: 'text', text: 'a\\', marks: BOLD },
              { kind: 'text', text: 'b', marks: null },
            ],
          },
        ],
        { language: 'ja' }
      ).text;
      expect(
        drawn(text)
          .map((each) => each.letter)
          .join('')
      ).toBe('a\\b');
    });
  });

  describe('chips', () => {
    it('reads references, rubies, effects and a portrait command as chips', () => {
      const [line] = parseChatRichText('|漢字《かんじ》 2d6+{筋力} 《爆炎》 @笑顔').lines;
      expect(line.segments.filter((segment) => segment.kind !== 'text').map((segment) => segment.kind)).toEqual([
        'ruby',
        'reference',
        'effect',
        'portrait',
      ]);
    });

    it('reads a stamp put inside the line as a chip, with its identifier and name', () => {
      const [line] = parseChatRichText('了解［了解:seal:ok］です').lines;
      expect(line.segments).toEqual([
        { kind: 'text', text: '了解', marks: null },
        { kind: 'stamp', id: 'seal:ok', label: '了解', raw: '［了解:seal:ok］', marks: null },
        { kind: 'text', text: 'です', marks: null },
      ]);
    });

    it('writes no backslash for a decorated portrait ending a line, nor into a line nobody touched', () => {
      const RED = { ...BOLD, bold: false, color: '#e5484d' };
      const portrait = { kind: 'portrait', command: { type: 'name', name: 'face' }, raw: '@face' } as const;
      const write = (lines: ChatRichLine[]) => serializeChatRichText(lines, { language: 'ja' }).text;

      expect(
        write([
          {
            segments: [
              { kind: 'text', text: 'a ** b ', marks: null },
              { ...portrait, marks: BOLD },
            ],
          },
        ])
      ).toBe('a ** b @face');
      const [untouched] = parseChatRichText('[赤]x').lines;
      expect(
        write([
          untouched,
          {
            segments: [
              { kind: 'text', text: 'y ', marks: RED },
              { ...portrait, marks: RED },
            ],
          },
        ])
      ).toBe('[赤]x\n[赤]y[/赤] @face');
    });

    it('writes no backslash into a line for one that only moved past a mark', () => {
      const written = serializeChatRichText(
        [
          {
            segments: [
              { kind: 'text', text: 'x [赤] y a\\', marks: null },
              { kind: 'text', text: 'b', marks: BOLD },
            ],
          },
        ],
        { language: 'ja' }
      ).text;

      expect(written.startsWith('x [赤] y a')).toBe(true);
    });

    it('writes back as it was a line ending in a cut-in, read with the cut-ins that start from chat', () => {
      const cutInNames = new Set(['爆発']);
      const line = '[red]hi[/red] 爆発';
      const read = parseChatRichText(line, { cutInNames });
      expect(read.lines[0].segments.at(-1)?.kind).toBe('cutIn');
      expect(serializeChatRichText(read.lines, { language: 'ja' }).text).toBe(line);

      const palette = `${line}\n[red]a[/red] 爆発`;
      const rows = parseChatRichText(palette, { cutInNames, mode: 'palette' });
      expect(rows.lines.map((row) => row.segments.at(-1)?.kind)).toEqual(['cutIn', 'cutIn']);
      expect(serializeChatRichText(rows.lines, { language: 'ja', mode: 'palette' }).text).toBe(palette);
    });

    it('reads the last word as a cut-in only where one of that name starts from chat', () => {
      const kinds = (names: string[]) =>
        parseChatRichText('行くぞ 爆発', { cutInNames: new Set(names) }).lines[0].segments.map(
          (segment) => segment.kind
        );
      expect(kinds([])).toEqual(['text']);
      expect(kinds(['爆発'])).toEqual(['text', 'cutIn']);
    });

    it('leaves as text what a decoration mark cuts through', () => {
      const [line] = parseChatRichText('{H**P}**').lines;
      expect(line.segments.every((segment) => segment.kind === 'text')).toBe(true);
    });

    it('carries the decoration of the text around it', () => {
      const [line] = parseChatRichText('**a{HP}**').lines;
      expect(line.segments[1]).toMatchObject({ kind: 'reference', marks: BOLD });
    });

    it('closes the marks before the commands read off the end of the line, and the space before them', () => {
      const write = (segments: ChatRichSegment[]) => serializeChatRichText([{ segments }], { language: 'ja' }).text;
      const portrait = { kind: 'portrait', command: { type: 'name', name: '笑顔' }, raw: '@笑顔' } as const;
      const cutIn = { kind: 'cutIn', name: '爆発', soundOnly: false, raw: '爆発' } as const;

      const bold = write([
        { kind: 'text', text: 'hello ', marks: BOLD },
        { ...portrait, marks: BOLD },
      ]);
      const red = write([
        { kind: 'text', text: '行くぞ', marks: { ...BOLD, bold: false, color: '#e5484d' } },
        { kind: 'text', text: ' ', marks: { ...BOLD, bold: false, color: '#e5484d' } },
        { ...cutIn, marks: { ...BOLD, bold: false, color: '#e5484d' } },
      ]);

      expect(bold).toBe('**hello** @笑顔');
      expect(parsePortraitCommand(bold)).toEqual({ type: 'name', name: '笑顔' });
      expect(red).toBe('[赤]行くぞ[/赤] 爆発');
    });
  });

  describe('palettes', () => {
    it('keeps variables and tabs as they stand, and reads each other line as a message', () => {
      const text = '//HP=**1**\n◆◆戦闘\n2d6 {HP}';
      const read = parseChatRichText(text, { mode: 'palette' });
      expect(read.lines.map((line) => !!line.directive)).toEqual([true, true, false]);
      expect(serializeChatRichText(read.lines, { language: 'ja', mode: 'palette' }).text).toBe(text);
    });

    it('writes a variable or a tab as it now reads, not as it was first read', () => {
      const read = parseChatRichText('//HP=10\n◆◆戦闘', { mode: 'palette' });
      const edited = read.lines.map((line, index) => ({
        ...line,
        segments: [{ kind: 'text' as const, text: index === 0 ? '//HP=20' : '◆◆探索', marks: null }],
      }));

      expect(serializeChatRichText(edited, { language: 'ja', mode: 'palette' }).text).toBe('//HP=20\n◆◆探索');
    });

    it('keeps the marks a decoration in a variable line was typed as', () => {
      const line: ChatRichLine = {
        directive: true,
        segments: [
          { kind: 'text', text: '//dmg=', marks: null },
          { kind: 'text', text: 'x', marks: BOLD },
        ],
      };

      expect(serializeChatRichText([line], { language: 'ja', mode: 'palette' }).text).toBe('//dmg=**x**');
    });

    it('places a chip put into a variable line as one place, the way the editor counts it', () => {
      const line: ChatRichLine = {
        directive: true,
        segments: [
          { kind: 'text', text: '//x=', marks: null },
          { kind: 'reference', name: 'HP', targeted: false, useMax: false, raw: '{HP}', marks: null },
          { kind: 'text', text: '+1', marks: null },
        ],
      };
      const written = serializeChatRichText([line], { language: 'ja', mode: 'palette' });

      expect(written.text).toBe('//x={HP}+1');
      expect(written.toText({ line: 0, offset: 5 })).toBe(8);
      expect(written.toText({ line: 0, offset: 6 })).toBe(9);
      expect(written.toModel(9)).toEqual({ line: 0, offset: 6 });
    });
  });

  describe('places', () => {
    it('counts places by the pieces the line now holds, though it reads as its source did', () => {
      const [source] = parseChatRichText('見て @笑顔').lines;
      expect(source.segments.at(-1)?.kind).toBe('portrait');
      const typedOut = { segments: [{ kind: 'text' as const, text: '見て @笑顔', marks: null }], source: '見て @笑顔' };

      const written = serializeChatRichText([typedOut], { language: 'ja' });

      expect(written.text).toBe('見て @笑顔');
      expect(written.toText({ line: 0, offset: 4 }, 1)).toBe(4);
      expect(written.toModel(5)).toEqual({ line: 0, offset: 5 });
    });

    it('finds each letter and chip of the model in the text and back', () => {
      const text = '**ab**{HP}c\nd';
      const read = parseChatRichText(text);
      expect(read.toText({ line: 0, offset: 0 }, 1)).toBe(2);
      expect(read.toText({ line: 0, offset: 0 }, -1)).toBe(0);
      expect(read.toText({ line: 1, offset: 0 }, -1)).toBe(12);
      expect(read.toText({ line: 0, offset: 2 }, -1)).toBe(4);
      expect(read.toText({ line: 0, offset: 2 }, 1)).toBe(6);
      expect(read.toText({ line: 0, offset: 3 }, -1)).toBe(10);
      expect(read.toText({ line: 1, offset: 1 }, -1)).toBe(13);
      expect(read.toModel(3)).toEqual({ line: 0, offset: 1 });
      expect(read.toModel(8, -1)).toEqual({ line: 0, offset: 2 });
      expect(read.toModel(8, 1)).toEqual({ line: 0, offset: 3 });
      expect(read.toModel(12)).toEqual({ line: 1, offset: 0 });
    });

    it('goes there and back for every letter of a written text', () => {
      const written = serializeChatRichText(
        parseChatRichText('[赤]a**b**[/赤]{HP}\\**c').lines.map((line) => ({ segments: line.segments })),
        { language: 'ja' }
      );
      const length = written.lines[0].segments.reduce(
        (sum, segment) => sum + (segment.kind === 'text' ? segment.text.length : 1),
        0
      );
      for (let offset = 0; offset <= length; offset++) {
        const at = written.toText({ line: 0, offset }, 1);
        expect(written.toModel(at, 1), String(offset)).toEqual({ line: 0, offset });
      }
    });
  });

  describe('texts made at random', () => {
    const PIECES = [
      '*',
      '**',
      '\\',
      '[',
      ']',
      '［',
      '］',
      '/',
      '赤',
      'red',
      '太字',
      '#f',
      '|',
      '｜',
      '《',
      '》',
      '{',
      '}',
      't',
      '^',
      '> ',
      '@',
      ' ',
      '\n',
      'a',
      'あ',
      '［了解:seal:ok］',
      ':',
    ];

    function random(seed: number): () => number {
      let state = seed;
      return () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
      };
    }

    it('are drawn as an editor meant them, whatever decorations it lays on them', () => {
      const next = random(1029);
      const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
      const marksOf = (): ChatDecoration | null =>
        next() < 0.3
          ? null
          : {
              bold: next() < 0.5,
              italic: next() < 0.3,
              strike: next() < 0.2,
              size: pick([null, null, 'small', 'large', 'huge'] as const),
              font: pick([null, null, 'mincho', 'pixel'] as const),
              color: pick([null, null, '#e5484d', '#3e63dd', '#123456'] as const),
            };
      for (let round = 0; round < 300; round++) {
        const lines: ChatRichLine[] = Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
          segments: Array.from({ length: 1 + Math.floor(next() * 5) }, () =>
            next() < 0.15
              ? {
                  kind: 'reference' as const,
                  name: 'HP',
                  targeted: false,
                  useMax: false,
                  raw: '{HP}',
                  marks: marksOf(),
                }
              : {
                  kind: 'text' as const,
                  text: Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
                    pick(PIECES.filter((each) => each !== '\n'))
                  ).join(''),
                  marks: marksOf(),
                }
          ),
        }));
        const text = serializeChatRichText(lines, { language: pick(['ja', 'en', 'ko'] as const) }).text;
        const meant = lines
          .map((line) =>
            line.segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.raw)).join('')
          )
          .join('\n');
        const reread = parseChatRichText(text).lines;
        expect(reread.length, text).toBe(lines.length);
        reread.forEach((line, index) =>
          expect(sameButBackslashes(line, lines[index]), `${JSON.stringify(meant)} → ${JSON.stringify(text)}`).toBe(
            true
          )
        );
      }
    });

    it('are written back to the letter, and drawn the same written again as edited', () => {
      const next = random(20261029);
      for (let round = 0; round < 400; round++) {
        const length = 1 + Math.floor(next() * 14);
        const text = Array.from({ length }, () => PIECES[Math.floor(next() * PIECES.length)]).join('');
        expect(roundTrip(text), JSON.stringify(text)).toBe(text);
        expect(drawnAlike(canonical(text), text), `${JSON.stringify(text)} → ${JSON.stringify(canonical(text))}`).toBe(
          true
        );
      }
    });
  });
});
