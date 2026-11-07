import { GameCharacter } from '@axe/domain/character/game-character';
import { buildMacroMessage } from '@axe/domain/chat/character-macro';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';

describe('building a macro message', () => {
  function speaker(name: string, palette?: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    if (palette !== undefined) character.chatPalette?.setPalette(palette);
    return character;
  }

  function withoutPalette(name: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.chatPalette?.destroy();
    return character;
  }

  beforeEach(() => {});

  it('fills in what a line refers to and keeps one context for the speaker alone', () => {
    const character = speaker('術者', '//威力=7');

    const message = buildMacroMessage(character, '2d6+{威力} 攻撃', [], '対象なし');

    expect(message.text).toBe('2d6+7 攻撃');
    expect(message.targetContexts).toEqual([{ text: '2d6+7 攻撃', object: null }]);
    expect(message.attachmentImageIdentifiers).toEqual([]);
  });

  it('works a line aimed at the marked pieces out once for each of them', () => {
    const character = speaker('術者', '');
    const first = speaker('相手A');
    const second = speaker('相手B');

    const message = buildMacroMessage(character, '攻撃 t:HP-5', [first, second], '対象なし');

    expect(message.text).toBe('攻撃 t:HP-5 [相手A]\n攻撃 t:HP-5 [相手B]');
    expect(message.targetContexts.map((context) => context.object?.name)).toEqual(['相手A', '相手B']);
  });

  it('rolls a line marked with a t: of its own once for each marked piece, the mark not said', () => {
    const character = speaker('術者', '');
    const first = speaker('相手A');
    const second = speaker('相手B');

    const message = buildMacroMessage(character, '2d6+8 魔法行使 t:', [first, second], '対象なし');

    expect(message.text).toBe('2d6+8 魔法行使 [相手A]\n2d6+8 魔法行使 [相手B]');
    expect(message.targetContexts.map((context) => context.text)).toEqual(['2d6+8 魔法行使', '2d6+8 魔法行使']);
  });

  it('rolls a line marked with a t:範囲 once for every marked piece at once, their names after it', () => {
    const character = speaker('術者', '');
    const first = speaker('相手A');
    const second = speaker('相手B');

    const message = buildMacroMessage(character, '2d6+8 魔法行使 t:範囲 :MP-3', [first, second], '対象なし');

    expect(message.text).toBe('2d6+8 魔法行使 :MP-3 [相手A、相手B]');
    expect(message.targetContexts.map((context) => context.object?.name)).toEqual(['相手A', '相手B']);
    expect(message.targetContexts.map((context) => context.together)).toEqual([
      ['相手A', '相手B'],
      ['相手A', '相手B'],
    ]);
    expect(message.targetContexts[1].text).not.toContain(':MP-3');
  });

  it('takes the commands aimed at the speaker out from the second target onwards', () => {
    const character = speaker('術者', '');
    const first = speaker('相手A');
    const second = speaker('相手B');

    const message = buildMacroMessage(character, 't:HP-5 :MP-1 攻撃', [first, second], '対象なし');

    expect(message.text.split('\n')[0]).toContain(':MP-1');
    expect(message.text.split('\n')[1]).not.toContain(':MP-1');
  });

  it('says so, and marks nobody, when the line wants a target and none is marked', () => {
    const character = speaker('術者', '');

    const message = buildMacroMessage(character, '攻撃 t:HP-5', [], '対象がいません');

    expect(message.text).toBe('対象がいません');
    expect(message.targetContexts).toEqual([]);
  });

  describe('a line aimed only through a reference of the speaker', () => {
    function withFields(character: GameCharacter, fields: Record<string, string>): GameCharacter {
      for (const [name, value] of Object.entries(fields)) {
        character.detailDataElement!.appendChild(DataElement.create(name, value));
      }
      return character;
    }

    it('goes to the target a field of the speaker reads through t{}', () => {
      const character = withFields(speaker('A', ''), { 項目A: '3', 項目C: '{項目A}+t{項目B}' });
      const target = withFields(speaker('B'), { 項目B: '5' });

      const message = buildMacroMessage(character, '{項目C}', [target], '対象なし');

      expect(message.text).toBe('3+5 [B]');
      expect(message.targetContexts).toEqual([{ text: '3+5', object: target }]);
    });

    it('goes to the target a variable of the palette reads through t{}', () => {
      const character = speaker('A', '//攻撃=2d6+t{防御}');
      const target = withFields(speaker('B'), { 防御: '4' });

      expect(buildMacroMessage(character, '{攻撃}', [target], '対象なし').text).toBe('2d6+4 [B]');
    });

    it('says so when nobody is marked', () => {
      const character = withFields(speaker('A', ''), { 項目C: '1+t{項目B}' });

      expect(buildMacroMessage(character, '{項目C}', [], '対象がいません').text).toBe('対象がいません');
    });

    it('reads the line alike for every target, the speaker filled in first', () => {
      const character = speaker('A', '//命中=2d6+5');
      const wearing = (name: string) => {
        const target = speaker(name);
        target.addBuffDataElement();
        applyBuffEdit({ command: '&加護/防御+2/3', object: target, targeted: false }, target);
        return target;
      };

      const message = buildMacroMessage(character, '{命中}+t{加護}', [wearing('B'), wearing('C')], '対象なし');

      expect(message.text).toBe('2d6+5+2 [B]\n2d6+5+2 [C]');
    });

    it('sends on the picture a reference of the speaker stands for, in a line aimed at targets', () => {
      const character = speaker('A', '');
      character.detailDataElement!.appendChild(
        DataElement.create('立ち絵', 'portrait-id', { fieldType: DataElementFieldType.IMAGE })
      );

      const message = buildMacroMessage(character, '{立ち絵}t:HP-1', [speaker('B'), speaker('C')], '対象なし');

      expect(message.attachmentImageIdentifiers).toEqual(['portrait-id']);
      expect(message.text).toBe('t:HP-1 [B]\nt:HP-1 [C]');
    });

    it('acts on the speaker once, though the command doing so came in through a reference', () => {
      const character = speaker('A', '//攻撃=:MP-2 t:HP-3');
      const first = speaker('B');
      const second = speaker('C');

      const lines = buildMacroMessage(character, '{攻撃}', [first, second], '対象なし').text.split('\n');

      expect(lines[0]).toBe(':MP-2 t:HP-3 [B]');
      expect(lines[1]).not.toContain(':MP-2');
      expect(lines[1]).toContain('t:HP-3 [C]');
    });
  });

  it('speaks for a character that keeps no palette of its own', () => {
    const character = withoutPalette('パレット無し');

    const message = buildMacroMessage(character, 'こんばんは', [], '対象なし');

    expect(message.text).toBe('こんばんは');
    expect(message.targetContexts).toHaveLength(1);
  });
});
