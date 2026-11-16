import { buffKindOf } from '@axe/domain/character/buff-kind';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import {
  addBuffRound,
  chosenKindMark,
  decreaseBuffRound,
  deleteZeroRoundBuffs,
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
    const ailments = [newStatusAilment('毒')];
    const lookOf = (line: string) => parseBuffInput(line)!.appearance;

    it('marks a debuff picked, where the line says nothing of the kind', () => {
      expect(chosenKindMark(lookOf('呪い 命中-1 3'), 'debuff', '呪い', ailments)).toBe('debuff');
      expect(chosenKindMark(lookOf('毒 継続 3'), 'debuff', '毒', ailments)).toBe('debuff');
    });

    it('writes no mark while the choice is left as it came, whatever the name', () => {
      expect(chosenKindMark(lookOf('盾 防御+1 3'), null, '盾', ailments)).toBeNull();
      expect(chosenKindMark(lookOf('毒 継続 3'), null, '毒', ailments)).toBeNull();
    });

    it('marks a buff picked by hand where the name is a state of the room, which would make it a debuff', () => {
      expect(chosenKindMark(lookOf('毒 継続 3'), 'buff', '毒', ailments)).toBe('buff');
    });

    it('writes no mark for a buff picked for any other name, which is what a plain command lays', () => {
      expect(chosenKindMark(lookOf('盾 防御+1 3'), 'buff', '盾', ailments)).toBeNull();
    });

    it('lets a kind written on the line win over the one picked', () => {
      const typed = lookOf('毒 継続 3 デバフ');

      expect(typed.kind).toBe('debuff');
      expect(chosenKindMark(typed, 'buff', '毒', ailments)).toBeNull();
    });

    it('lays the buff as the kind picked once the mark is written', () => {
      const piece = character('相手A');
      const appearance = { ...lookOf('毒 継続 3') };
      const kind = chosenKindMark(appearance, 'buff', '毒', ailments);
      if (kind) appearance.kind = kind;

      addBuffRound([piece], '毒', '継続', 3, appearance);

      expect(piece.buffs.find('毒')?.getAttribute('cs-buff-kind')).toBe('buff');
      expect(buffKindOf(piece.buffs.find('毒')!, ailments)).toBe('buff');
    });
  });
});
