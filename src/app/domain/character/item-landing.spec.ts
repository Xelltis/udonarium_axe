import { type ItemTakes, landingOn } from '@axe/domain/character/item-landing';

const WORDS: ItemTakes = { takes: 'words' };
const NUMBERS: ItemTakes = { takes: 'numbers' };
const CHOICE: ItemTakes = { takes: 'choice', choices: ['通常', '攻勢', '1', '2'] };

describe('where a value written to an item lands', () => {
  it('lands nowhere on an item that is not there', () => {
    expect(landingOn(null, 'now', '炎', 'words')).toEqual({ kind: 'missing' });
  });

  it('writes words into an item that holds words, and moves a number for an amount', () => {
    expect(landingOn(WORDS, 'now', ' 炎 ', 'words')).toEqual({ kind: 'words', words: '炎' });
    expect(landingOn(WORDS, 'now', '3', 'amount')).toEqual({ kind: 'number' });
    expect(landingOn(WORDS, 'now', '炎', 'wordsAnywhere')).toEqual({ kind: 'words', words: '炎' });
  });

  it('takes only one of its choices into a choice, words or amount alike', () => {
    expect(landingOn(CHOICE, 'now', '攻勢', 'words')).toEqual({ kind: 'words', words: '攻勢' });
    expect(landingOn(CHOICE, 'now', '2', 'amount')).toEqual({ kind: 'words', words: '2' });
    expect(landingOn(CHOICE, 'now', '突撃', 'words')).toMatchObject({ kind: 'notAChoice' });
    expect(landingOn(CHOICE, 'now', '5', 'amount')).toMatchObject({ kind: 'notAChoice' });
    expect(landingOn(CHOICE, 'now', '突撃', 'wordsAnywhere')).toMatchObject({ kind: 'notAChoice' });
  });

  it('moves a number in an item that holds numbers, and takes words there only as `>` writes them', () => {
    expect(landingOn(NUMBERS, 'max', '3', 'amount')).toEqual({ kind: 'number' });
    expect(landingOn(NUMBERS, 'now', '1d6', 'words')).toEqual({ kind: 'notWords' });
    expect(landingOn(NUMBERS, 'now', '不明', 'wordsAnywhere')).toEqual({ kind: 'words', words: '不明' });
  });

  it('moves the number any item holds by an amount to move it by, a choice’s too', () => {
    expect(landingOn(CHOICE, 'now', '5', 'moveBy')).toEqual({ kind: 'number' });
    expect(landingOn(WORDS, 'now', '1', 'moveBy')).toEqual({ kind: 'number' });
    expect(landingOn(NUMBERS, 'max', '2', 'moveBy')).toEqual({ kind: 'number' });
    expect(landingOn(WORDS, 'max', '1', 'moveBy')).toEqual({ kind: 'noSlot' });
  });

  it('has no slot but the value in an item that holds words or a choice', () => {
    expect(landingOn(WORDS, 'max', '炎', 'words')).toEqual({ kind: 'noSlot' });
    expect(landingOn(CHOICE, 'max', '攻勢', 'words')).toEqual({ kind: 'noSlot' });
    expect(landingOn(WORDS, 'max', '3', 'amount')).toEqual({ kind: 'noSlot' });
  });
});
