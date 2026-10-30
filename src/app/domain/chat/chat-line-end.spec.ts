import { writtenAtLineEnd } from '@axe/domain/chat/chat-line-end';

describe('writtenAtLineEnd', () => {
  const cutIns = new Set(['登場', '退場']);
  const STAMP = '［了解:seal:ok］';
  const portrait = (text: string) => writtenAtLineEnd(text, '@face', 'portrait', cutIns);
  const cutIn = (text: string) => writtenAtLineEnd(text, '退場', 'cutIn', cutIns);

  it('puts a portrait last, or in place of the one the line ends with', () => {
    expect(portrait('')).toEqual({ text: '@face', caret: 5 });
    expect(portrait('hello')).toEqual({ text: 'hello @face', caret: 11 });
    expect(portrait('hello ')).toEqual({ text: 'hello @face', caret: 11 });
    expect(portrait('hello @hide')).toEqual({ text: 'hello @face', caret: 11 });
    expect(portrait(`hello @hide${STAMP}`)).toEqual({ text: `hello @face${STAMP}`, caret: 11 });
  });

  it('puts a portrait in place of the cut-in the line ends with, as a line starts one or the other', () => {
    expect(portrait('hello 登場')).toEqual({ text: 'hello @face', caret: 11 });
    expect(portrait(`hello 登場${STAMP}`)).toEqual({ text: `hello @face${STAMP}`, caret: 11 });
  });

  it('puts a cut-in in place of the cut-in or the portrait the line ends with', () => {
    expect(cutIn('hello 登場')).toEqual({ text: 'hello 退場', caret: 8 });
    expect(cutIn(`hello 登場${STAMP}`)).toEqual({ text: `hello 退場${STAMP}`, caret: 8 });
    expect(cutIn('hello @face')).toEqual({ text: 'hello 退場', caret: 8 });
    expect(cutIn(`hello @face ${STAMP}`)).toEqual({ text: `hello 退場${STAMP}`, caret: 8 });
  });

  it('puts a cut-in last after a word that names no cut-in', () => {
    expect(cutIn('')).toEqual({ text: '退場', caret: 2 });
    expect(cutIn('hello world')).toEqual({ text: 'hello world 退場', caret: 14 });
    expect(cutIn('hello 登場 ')).toEqual({ text: 'hello 登場 退場', caret: 11 });
  });

  it('puts anything else last', () => {
    expect(writtenAtLineEnd('hello @face', STAMP, 'stamp', cutIns)).toEqual({
      text: `hello @face ${STAMP}`,
      caret: 12 + STAMP.length,
    });
  });
});
