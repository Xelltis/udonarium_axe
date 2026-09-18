import { diceBotUnreachable$, DiceBotUnreachableEvent } from '@axe/core/event/domain-events';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ResourceEdit, ResourceEditProcessor } from '@axe/domain/data/resource-edit-processor';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

describe('ResourceEditProcessor', () => {
  let processor: ResourceEditProcessor;

  const mockDiceRollAsync = vi.fn();
  const mockLoadGameSystemAsync = vi.fn();

  beforeEach(() => {
    processor = new ResourceEditProcessor(mockDiceRollAsync, mockLoadGameSystemAsync);
    vi.clearAllMocks();
  });

  describe('parseOption', () => {
    it('is false throughout with no options given', () => {
      const result = processor.parseOption('HP+10');
      expect(result.limitMinMax).toBe(false);
      expect(result.zeroLimit).toBe(false);
      expect(result.isErr).toBe(false);
    });

    it('takes the limit option', () => {
      const result = processor.parseOption('HP+10L');
      expect(result.limitMinMax).toBe(true);
      expect(result.isErr).toBe(false);
    });

    it('takes the floor option', () => {
      const result = processor.parseOption('HP+10Z');
      expect(result.zeroLimit).toBe(true);
      expect(result.isErr).toBe(false);
    });

    it('takes two options together', () => {
      const result = processor.parseOption('HP+10LZ');
      expect(result.limitMinMax).toBe(true);
      expect(result.zeroLimit).toBe(true);
      expect(result.isErr).toBe(false);
    });

    it('reports an error for an option letter it does not know', () => {
      const result = processor.parseOption('HP+10X');
      expect(result.isErr).toBe(true);
    });

    it('does not read the dice letter as an option', () => {
      const result = processor.parseOption('HP+10D');
      // D is excluded from [A-CE-Z] pattern — no options matched
      expect(result.limitMinMax).toBe(false);
      expect(result.zeroLimit).toBe(false);
      expect(result.isErr).toBe(false);
    });
  });

  describe('defaultResourceEdit', () => {
    it('returns the default edit', () => {
      const edit = processor.defaultResourceEdit();
      expect(edit.target).toBe('');
      expect(edit.operator).toBe('');
      expect(edit.command).toBe('');
      expect(edit.isDiceRoll).toBe(false);
      expect(edit.calcAns).toBe(0);
      expect(edit.nowOrMax).toBe('now');
    });
  });

  describe('commandToEdit', () => {
    let character: GameCharacter;

    beforeEach(() => {
      character = GameCharacter.create('テスト戦士', 1, '');
    });

    it('reads a command that adds to a resource', () => {
      const edit = processor.defaultResourceEdit();
      const result = processor.commandToEdit(edit, ':HP+10', character, false);

      expect(result).toBe(true);
      expect(edit.target).toBe('HP');
      expect(edit.operator).toBe('+');
      expect(edit.nowOrMax).toBe('now');
    });

    it('reads a command that takes from a resource', () => {
      const edit = processor.defaultResourceEdit();
      const result = processor.commandToEdit(edit, ':HP-5', character, false);

      expect(result).toBe(true);
      expect(edit.target).toBe('HP');
      expect(edit.operator).toBe('-');
    });

    it('reads one that assigns', () => {
      const edit = processor.defaultResourceEdit();
      const result = processor.commandToEdit(edit, ':HP=100', character, false);

      expect(result).toBe(true);
      expect(edit.operator).toBe('=');
    });

    it('reads one that replaces text', () => {
      const edit = processor.defaultResourceEdit();
      const result = processor.commandToEdit(edit, ':器用度>30', character, false);

      expect(result).toBe(true);
      expect(edit.operator).toBe('>');
      expect(edit.replace).toBe('30');
    });

    it('aims at the maximum when it is marked', () => {
      const edit = processor.defaultResourceEdit();
      const result = processor.commandToEdit(edit, ':HP^+50', character, false);

      expect(result).toBe(true);
      expect(edit.nowOrMax).toBe('max');
    });

    it('is false for a status it does not have', () => {
      const edit = processor.defaultResourceEdit();
      const result = processor.commandToEdit(edit, ':存在しないステータス+10', character, false);

      expect(result).toBe(false);
    });

    it('marks it as aimed at a target', () => {
      const edit = processor.defaultResourceEdit();
      processor.commandToEdit(edit, ':HP+10', character, true);

      expect(edit.targeted).toBe(true);
    });
  });

  describe('textEdit', () => {
    let character: GameCharacter;

    beforeEach(() => {
      character = GameCharacter.create('テスト', 1, '');
    });

    it('writes to a text value and says what it did', () => {
      const edit = processor.defaultResourceEdit();
      edit.target = '器用度';
      edit.replace = '30';

      const result = processor.textEdit(edit, character);
      expect(result).toContain('器用度');
      expect(result).toContain('30');
    });
  });

  describe('resourceEdit', () => {
    let character: GameCharacter;

    beforeEach(() => {
      character = GameCharacter.create('テスト戦士', 1, '');
    });

    it('adds to the current value and says what it did', () => {
      const edit: ResourceEdit = {
        target: 'HP',
        operator: '+',
        diceResult: '10',
        command: '+10+(1d1-1)',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: 10,
        nowOrMax: 'now',
        option: { limitMinMax: false, zeroLimit: false, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character);
      expect(result).toContain('HP');
      expect(result).toContain('200'); // 初期値
    });

    it('assigns', () => {
      const edit: ResourceEdit = {
        target: 'HP',
        operator: '=',
        diceResult: '50',
        command: '50+(1d1-1)',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: 50,
        nowOrMax: 'now',
        option: { limitMinMax: false, zeroLimit: false, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character);
      expect(result).toContain('50');
      expect(character.status.getValue('HP', 'now')).toBe(50);
    });

    it('never passes the maximum while it is limited', () => {
      const edit: ResourceEdit = {
        target: 'HP',
        operator: '+',
        diceResult: '999',
        command: '+999+(1d1-1)',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: 999,
        nowOrMax: 'now',
        option: { limitMinMax: true, zeroLimit: false, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character);
      expect(result).toContain('(最大)');
      expect(character.status.getValue('HP', 'now')).toBe(200);
    });

    it('stops an addition at nothing while it is floored', () => {
      const edit: ResourceEdit = {
        target: 'HP',
        operator: '+',
        diceResult: '-300',
        command: '-300+(1d1-1)',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: -300,
        nowOrMax: 'now',
        option: { limitMinMax: false, zeroLimit: true, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character);
      expect(result).toContain('(0制限)');
    });
  });

  describe('resourceEditProcess', () => {
    let tab: ChatTab;
    let character: GameCharacter;

    function speak(text: string): ChatMessage {
      return tab.addMessage({
        identifier: '',
        tabIdentifier: tab.identifier,
        from: 'peer',
        timestamp: 1,
        imageIdentifier: '',
        tag: '',
        name: 'プレイヤー',
        text,
      });
    }

    function systemText(): string {
      return tab.chatMessages
        .filter((message) => message.tag === 'system')
        .map((message) => message.text)
        .join('\n');
    }

    beforeEach(() => {
      PeerCursor.createMyCursor();
      tab = new ChatTab();
      tab.initialize();
      character = GameCharacter.create('キャラクターB', 1, '');
      mockLoadGameSystemAsync.mockResolvedValue({ ID: 'DiceBot' });
    });

    describe('sweeping buffs off the table', () => {
      let archer: GameCharacter;

      beforeEach(() => {
        character.setLocation('table');
        character.addExtendData();
        character.buffs.addRound('毒', '', 3, { timing: 'none' });
        character.buffs.addRound('加速', '', 2);
        archer = GameCharacter.create('弓兵', 1, '');
        archer.setLocation('table');
        archer.addExtendData();
        archer.buffs.addRound('毒', '', 2);
      });

      afterEach(() => {
        archer.destroy();
        character.destroy();
      });

      function names(piece: GameCharacter): string[] {
        return (piece.buffDataElement?.children[0]?.children ?? []).map((data) => data.name);
      }

      it('takes a buff of that name off every piece on the table for the game master, and says how many', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;

        processor.checkResourceEditCommand(speak('&&毒-'), [{ text: '&&毒-', object: character }]);

        await vi.waitFor(() => expect(systemText()).toContain('卓全体から「毒」を解除（2体・2件）'));
        expect(names(character)).toEqual(['加速']);
        expect(names(archer)).toEqual([]);
      });

      it('takes nothing for anyone but the game master, and says the sweep is theirs', async () => {
        PeerCursor.myCursor.role = PeerRole.Player;

        processor.checkResourceEditCommand(speak('&&2R-'), [{ text: '&&2R-', object: character }]);

        await vi.waitFor(() => expect(systemText()).toContain('バフの一括解除はGMだけが使えます（&&2R-）'));
        expect(names(character)).toEqual(['毒', '加速']);
        expect(names(archer)).toEqual(['毒']);
      });

      it('says so when nothing on the table matches', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;

        processor.checkResourceEditCommand(speak('&&9R-'), [{ text: '&&9R-', object: character }]);

        await vi.waitFor(() => expect(systemText()).toContain('卓全体に残り9Rのバフはありません'));
      });
    });

    it('says which command it could not work out', async () => {
      mockDiceRollAsync.mockResolvedValue({ id: 'DiceBot', result: '', isSecret: false });

      await processor.resourceEditProcess(
        null,
        [{ resourceCommand: 't:HP-t{敏捷度}', object: character }],
        [],
        speak('t:HP-t{敏捷度}'),
        false
      );

      expect(systemText()).toContain('[キャラクターB] t:HP-t{敏捷度}を計算できません');
      expect(character.status.getValue('HP', 'now')).toBe(200);
    });

    it('rolls a bracketed command on its own and works its answer into the arithmetic', async () => {
      mockDiceRollAsync.mockImplementation(async (command: string) =>
        command === 'k10'
          ? { id: 'SwordWorld2.5', result: 'SwordWorld2.5 : KeyNo.10c[10] ＞ 2D:[3,2]=5 ＞ 2', isSecret: false }
          : {
              id: 'SwordWorld2.5',
              result: 'SwordWorld2.5 : (-(2+5-3)+(1D1-1)) ＞ -(2+5-3)+(1[1]-1) ＞ -4',
              isSecret: false,
            }
      );

      await processor.resourceEditProcess(
        null,
        [{ resourceCommand: 't:HP-([k10]+5-3)', object: character }],
        [],
        speak('t:HP-([k10]+5-3)'),
        false
      );

      expect(mockDiceRollAsync).toHaveBeenNthCalledWith(1, 'k10', expect.anything());
      expect(mockDiceRollAsync).toHaveBeenNthCalledWith(2, '-(2+5-3)+(1d1-1)', expect.anything());
      expect(character.status.getValue('HP', 'now')).toBe(196);
      expect(systemText()).toContain('└ [k10] KeyNo.10c[10] ＞ 2D:[3,2]=5 ＞ 2');
    });

    it('says so when the bracketed command is one the dice bot cannot answer', async () => {
      mockDiceRollAsync.mockResolvedValue({ id: 'DiceBot', result: '', isSecret: false });

      await processor.resourceEditProcess(
        null,
        [{ resourceCommand: 't:HP-([k10]+5)', object: character }],
        [],
        speak('t:HP-([k10]+5)'),
        false
      );

      expect(mockDiceRollAsync).toHaveBeenCalledTimes(1);
      expect(systemText()).toContain('t:HP-([k10]+5)を計算できません');
      expect(character.status.getValue('HP', 'now')).toBe(200);
    });

    it('keeps the edits it could work out when another command fails', async () => {
      mockDiceRollAsync.mockImplementation(async (command: string) =>
        command.includes('{')
          ? { id: 'DiceBot', result: '', isSecret: false }
          : { id: 'DiceBot', result: 'DiceBot : (-5+(1D1-1)) ＞ -5+(1[1]-1) ＞ -5', isSecret: false }
      );

      await processor.resourceEditProcess(
        null,
        [
          { resourceCommand: 't:HP-t{敏捷度}', object: character },
          { resourceCommand: 't:MP-5', object: character },
        ],
        [],
        speak('t:HP-t{敏捷度} t:MP-5'),
        false
      );

      expect(character.status.getValue('MP', 'now')).toBe(95);
      expect(systemText()).toContain('t:HP-t{敏捷度}を計算できません');
    });

    it('leaves the amounts alone and says the dice bot could not be fetched when it has none to work them out with', async () => {
      const standIn = { ID: 'DiceBot' };
      mockLoadGameSystemAsync.mockResolvedValue(standIn);
      const withoutDiceBot = new ResourceEditProcessor(
        mockDiceRollAsync,
        mockLoadGameSystemAsync,
        (gameSystem) => gameSystem === standIn
      );
      const line = speak('t:HP-5');
      const unrolled: DiceBotUnreachableEvent[] = [];
      const stopListening = diceBotUnreachable$.subscribe((event) => unrolled.push(event));

      await withoutDiceBot.resourceEditProcess(
        null,
        [{ resourceCommand: 't:HP-5', object: character }],
        [],
        line,
        false
      );
      stopListening();

      expect(mockDiceRollAsync).not.toHaveBeenCalled();
      expect(systemText()).not.toContain('計算できません');
      expect(character.status.getValue('HP', 'now')).toBe(200);
      expect(unrolled).toEqual([{ messageIdentifier: line.identifier, gameType: 'DiceBot' }]);
    });
  });

  describe('buffEdit', () => {
    let character: GameCharacter;

    beforeEach(() => {
      character = GameCharacter.create('テスト戦士', 1, '');
    });

    it('grants a buff', () => {
      const result = processor.buffEdit(
        { command: '&マッスルベアー/筋B+2/3', object: character, targeted: false },
        character
      );

      expect(result).toContain('バフを付与');
      expect(result).toContain('マッスルベアー');
    });

    it('counts a named buff down', () => {
      character.buffs.addRound('テストバフ', '', 3);
      const result = processor.buffEdit({ command: '&R-', object: character, targeted: false }, character);

      expect(result).toContain('バフRを減少');
    });

    it('counts it up', () => {
      character.buffs.addRound('テストバフ', '', 3);
      const result = processor.buffEdit({ command: '&R+', object: character, targeted: false }, character);

      expect(result).toContain('バフRを増加');
    });

    it('removes the buffs that have run out', () => {
      const result = processor.buffEdit({ command: '&D', object: character, targeted: false }, character);

      expect(result).toContain('0R以下のバフを消去');
    });

    it('removes a named buff', () => {
      character.buffs.addRound('消去対象', '', 3);
      const result = processor.buffEdit({ command: '&消去対象-', object: character, targeted: false }, character);

      expect(result).toContain('消去対象を消去');
    });

    it('names the character when it is aimed at one', () => {
      const result = processor.buffEdit({ command: '&テストバフ', object: character, targeted: true }, character);

      expect(result).toContain('テスト戦士');
    });
  });
});
