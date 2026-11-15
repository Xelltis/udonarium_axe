import { GameCharacter } from '@axe/domain/character/game-character';
import {
  addBuffRound,
  decreaseBuffRound,
  deleteZeroRoundBuffs,
  marksChosenKind,
  parseBuffInput,
  pileBuffRound,
} from '@axe/features/controller/remote-controller/remote-controller-buff';

describe('the buffs a remote controller works on', () => {
  function character(name: string): GameCharacter {
    const held = GameCharacter.create(name, 1, '');
    held.addExtendData();
    return held;
  }

  beforeEach(() => {});

  it('steps every buff down a round and names who it touched', () => {
    const first = character('相手A');
    const second = character('相手B');
    addBuffRound([first, second], '毒', '継続', 3);

    const targets = decreaseBuffRound([first, second]);

    expect(targets).toBe('[相手A][相手B]');
    expect(Number(first.buffs.find('毒')?.value)).toBe(2);
    expect(Number(second.buffs.find('毒')?.value)).toBe(2);
  });

  it('clears the buffs that have run out and names who it touched', () => {
    const held = character('相手');
    addBuffRound([held], '毒', '継続', 1);
    decreaseBuffRound([held]);

    const targets = deleteZeroRoundBuffs([held]);

    expect(targets).toBe('[相手]');
    expect(held.buffs.find('毒')).toBeNull();
  });

  it('names nobody when it was given nobody, so the panel says nothing', () => {
    expect(decreaseBuffRound([])).toBe('');
    expect(deleteZeroRoundBuffs([])).toBe('');
  });

  it('adds a second helping to everyone carrying the buff already', () => {
    const first = character('相手A');
    const second = character('相手B');
    addBuffRound([first, second], '猛攻撃', '攻撃+2', 5);

    pileBuffRound([first, second], 'stack', '猛攻撃', '攻撃+2', 2);

    expect(first.buffs.find('猛攻撃')?.currentValue).toBe('攻撃+4');
    expect(second.buffs.find('猛攻撃')?.currentValue).toBe('攻撃+4');
    expect(Number(first.buffs.find('猛攻撃')?.value)).toBe(5);
  });

  it('lengthens everyone\u2019s buff when the helping asks for it', () => {
    const held = character('相手');
    addBuffRound([held], '猛攻撃', '攻撃+2', 2);

    pileBuffRound([held], 'extend', '猛攻撃', '攻撃+2', 3);

    expect(Number(held.buffs.find('猛攻撃')?.value)).toBe(5);
  });

  describe('the kind chosen on the form', () => {
    it('marks a debuff where the line says nothing of the kind', () => {
      expect(marksChosenKind(parseBuffInput('毒 継続 3')!.appearance, 'debuff')).toBe(true);
    });

    it('writes no mark for a buff, which is what a buff laid by a plain command carries', () => {
      expect(marksChosenKind(parseBuffInput('盾 防御+1 3')!.appearance, 'buff')).toBe(false);
    });

    it('lets a kind written on the line win over the one chosen', () => {
      const typed = parseBuffInput('盾 防御+1 3 バフ')!.appearance;

      expect(typed.kind).toBe('buff');
      expect(marksChosenKind(typed, 'debuff')).toBe(false);
    });

    it('lays the buff as a debuff once the mark is written', () => {
      const piece = character('相手A');
      const appearance = { ...parseBuffInput('呪い 命中-1 3')!.appearance };
      if (marksChosenKind(appearance, 'debuff')) appearance.kind = 'debuff';

      addBuffRound([piece], '呪い', '命中-1', 3, appearance);

      expect(piece.buffs.find('呪い')?.getAttribute('cs-buff-kind')).toBe('debuff');
    });
  });
});
