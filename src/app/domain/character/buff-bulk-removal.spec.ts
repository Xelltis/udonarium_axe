import {
  BuffRemovalRule,
  countBuffRemoval,
  describeBuffRemoval,
  parseBuffRemovalCommand,
  removeBuffsAcross,
} from '@axe/domain/character/buff-bulk-removal';
import { GameCharacter } from '@axe/domain/character/game-character';

describe('sweeping buffs off the table', () => {
  let made: GameCharacter[] = [];

  function character(name: string): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.addExtendData();
    made.push(piece);
    return piece;
  }

  function buffNames(piece: GameCharacter): string[] {
    return (piece.buffDataElement?.children[0]?.children ?? []).map((data) => data.name);
  }

  afterEach(() => {
    for (const piece of made) piece.destroy();
    made = [];
  });

  describe('reading the chat command', () => {
    it.each<[string, BuffRemovalRule]>([
      ['&&none-', { kind: 'held' }],
      ['&&消えない-', { kind: 'held' }],
      ['＆＆永続－', { kind: 'held' }],
      ['&&2R-', { kind: 'rounds', rounds: 2 }],
      ['&&２Ｒ-', { kind: 'rounds', rounds: 2 }],
      ['&&3ラウンド-', { kind: 'rounds', rounds: 3 }],
      ['&&毒-', { kind: 'name', name: '毒' }],
      ['s&&毒-', { kind: 'name', name: '毒' }],
    ])('reads %s', (command, rule) => {
      expect(parseBuffRemovalCommand(command)).toEqual(rule);
    });

    it.each(['&毒-', '&&-', 't&&毒-', '&&毒', '&&毒/3'])('leaves %s to the other buff commands', (command) => {
      expect(parseBuffRemovalCommand(command)).toBeNull();
    });
  });

  describe('taking buffs away', () => {
    let knight: GameCharacter;
    let archer: GameCharacter;

    beforeEach(() => {
      knight = character('騎士');
      knight.buffs.addRound('毒', '', 3, { timing: 'none' });
      knight.buffs.addRound('加速', '', 2);
      knight.buffs.addRound('猛攻撃', '', 3);
      archer = character('弓兵');
      archer.buffs.addRound('毒', '', 2);
      archer.buffs.addRound('祝福', '', 2, { timing: 'none' });
    });

    it('takes only the buffs held until cleared, whatever their count reads', () => {
      expect(removeBuffsAcross([knight, archer], { kind: 'held' })).toEqual({ characters: 2, buffs: 2 });
      expect(buffNames(knight)).toEqual(['加速', '猛攻撃']);
      expect(buffNames(archer)).toEqual(['毒']);
    });

    it('takes the buffs with exactly that many rounds left, and none held until cleared', () => {
      expect(removeBuffsAcross([knight, archer], { kind: 'rounds', rounds: 2 })).toEqual({ characters: 2, buffs: 2 });
      expect(buffNames(knight)).toEqual(['毒', '猛攻撃']);
      expect(buffNames(archer)).toEqual(['祝福']);
    });

    it('takes every buff of that name from everyone', () => {
      expect(removeBuffsAcross([knight, archer], { kind: 'name', name: '毒' })).toEqual({ characters: 2, buffs: 2 });
      expect(buffNames(knight)).toEqual(['加速', '猛攻撃']);
      expect(buffNames(archer)).toEqual(['祝福']);
    });

    it('counts what a sweep would take without taking it', () => {
      expect(countBuffRemoval([knight, archer], { kind: 'name', name: '毒' })).toEqual({ characters: 2, buffs: 2 });
      expect(buffNames(knight)).toEqual(['毒', '加速', '猛攻撃']);
    });

    it('reaches nobody when nothing matches', () => {
      expect(removeBuffsAcross([knight, archer], { kind: 'rounds', rounds: 9 })).toEqual({ characters: 0, buffs: 0 });
    });
  });

  it('names each sweep for the report', () => {
    expect(describeBuffRemoval({ kind: 'held' })).toBe('消えないバフ');
    expect(describeBuffRemoval({ kind: 'rounds', rounds: 2 })).toBe('残り2Rのバフ');
    expect(describeBuffRemoval({ kind: 'name', name: '毒' })).toBe('「毒」');
  });
});
