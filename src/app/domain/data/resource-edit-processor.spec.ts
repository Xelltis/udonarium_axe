import {
  diceBotUnreachable$,
  DiceBotUnreachableEvent,
  resetCarriedOut$,
  ResetCarriedOutEvent,
} from '@axe/core/event/domain-events';
import { buffEffectTimingOf } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { type ResetRecord, undoReset } from '@axe/domain/character/piece-reset';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';
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
        amount: '',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: 10,
        nowOrMax: 'now',
        option: { limitMinMax: false, zeroLimit: false, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character).full;
      expect(result).toContain('HP');
      expect(result).toContain('200'); // the initial value
    });

    it('assigns', () => {
      const edit: ResourceEdit = {
        target: 'HP',
        operator: '=',
        diceResult: '50',
        command: '50+(1d1-1)',
        amount: '',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: 50,
        nowOrMax: 'now',
        option: { limitMinMax: false, zeroLimit: false, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character).full;
      expect(result).toContain('50');
      expect(character.status.getValue('HP', 'now')).toBe(50);
    });

    it('never passes the maximum while it is limited', () => {
      const edit: ResourceEdit = {
        target: 'HP',
        operator: '+',
        diceResult: '999',
        command: '+999+(1d1-1)',
        amount: '',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: 999,
        nowOrMax: 'now',
        option: { limitMinMax: true, zeroLimit: false, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character).full;
      expect(result).toContain('(最大)');
      expect(character.status.getValue('HP', 'now')).toBe(200);
    });

    it('stops an addition at nothing while it is floored', () => {
      const edit: ResourceEdit = {
        target: 'HP',
        operator: '+',
        diceResult: '-300',
        command: '-300+(1d1-1)',
        amount: '',
        replace: '',
        isDiceRoll: false,
        embeddedRolls: [],
        calcAns: -300,
        nowOrMax: 'now',
        option: { limitMinMax: false, zeroLimit: true, isErr: false },
        object: character,
        targeted: false,
      };

      const result = processor.resourceEdit(edit, character).full;
      expect(result).toContain('(0制限)');
    });
  });

  describe('resourceEditProcess', () => {
    let tab: ChatTab;
    let character: GameCharacter;

    function speak(text: string, sendFrom?: string): ChatMessage {
      return tab.addMessage({
        identifier: '',
        tabIdentifier: tab.identifier,
        from: 'peer',
        timestamp: 1,
        imageIdentifier: '',
        tag: '',
        name: 'プレイヤー',
        text,
        sendFrom,
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

      /** A dice bot that, like the real one, comes in a task of its own after it is asked for. */
      function loadedLater(): Promise<{ ID: string }> {
        return new Promise((resolve) => setTimeout(() => resolve({ ID: 'DiceBot' })));
      }

      beforeEach(() => {
        mockLoadGameSystemAsync.mockImplementation(loadedLater);
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

      it('carries out no command aimed at targets that came with none, rather than failing', async () => {
        await expect(
          processor.checkResourceEditCommand(speak('st&毒-'), [{ text: 'st&毒-', object: null }])
        ).resolves.toBeUndefined();
        expect(names(character)).toEqual(['毒', '加速']);
      });

      it('takes a buff of that name off every piece on the table for the game master, and says how many', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;

        await processor.checkResourceEditCommand(speak('&&毒-'), [{ text: '&&毒-', object: character }]);

        expect(systemText()).toContain('卓全体から「毒」を解除（2体・2件）');
        expect(names(character)).toEqual(['加速']);
        expect(names(archer)).toEqual([]);
      });

      it.each([
        ['&&none-', '卓全体から消えないバフを解除（1体・1件）', '卓全体に消えないバフはありません'],
        ['&&二人乗り-', '卓全体に「二人乗り」はありません', '卓全体に「二人乗り」はありません'],
      ])(
        'leaves the buff a piece rides two up by where %s would pick it, and does not count it',
        async (line, withOthers, alone) => {
          PeerCursor.myCursor.role = PeerRole.GameMaster;
          archer.buffs.addRound('二人乗り', '命中-2', 3, { timing: 'none' });
          archer.rideTwoUpFrom = 'mount';
          archer.rideTwoUpBuff = archer.buffs.find('二人乗り')!.identifier;

          await processor.checkResourceEditCommand(speak(line), [{ text: line, object: character }]);

          expect(systemText()).toContain(withOthers);
          expect(names(archer)).toEqual(['毒', '二人乗り']);

          await processor.checkResourceEditCommand(speak(line), [{ text: line, object: character }]);

          expect(systemText()).toContain(alone);
          expect(names(archer)).toEqual(['毒', '二人乗り']);
        }
      );

      it('takes nothing for anyone but the game master, and says the sweep is theirs', async () => {
        PeerCursor.myCursor.role = PeerRole.Player;

        await processor.checkResourceEditCommand(speak('&&2R-'), [{ text: '&&2R-', object: character }]);

        expect(systemText()).toContain('バフの一括解除はGMだけが使えます（&&2R-）');
        expect(names(character)).toEqual(['毒', '加速']);
        expect(names(archer)).toEqual(['毒']);
      });

      it('says so when nothing on the table matches', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;

        await processor.checkResourceEditCommand(speak('&&9R-'), [{ text: '&&9R-', object: character }]);

        expect(systemText()).toContain('卓全体に残り9Rのバフはありません');
      });
    });

    describe('clearing buffs of every kind (acceptance 8)', () => {
      let archer: GameCharacter;
      let made: GameCharacter[];

      function loadedLater(): Promise<{ ID: string }> {
        return new Promise((resolve) => setTimeout(() => resolve({ ID: 'DiceBot' })));
      }

      function onTable(name: string): GameCharacter {
        const piece = GameCharacter.create(name, 1, '');
        piece.setLocation('table');
        piece.addExtendData();
        made.push(piece);
        return piece;
      }

      function partOf(body: GameCharacter, name: string): GameCharacter {
        const part = onTable(name);
        part.ridingOn = body.identifier;
        part.rideSeat = 'part';
        return part;
      }

      const names = (piece: GameCharacter) => piece.buffs.list().map((data) => data.name);
      const say = (text: string, targets: (GameCharacter | null)[] = [null], sendFrom?: string) =>
        processor.checkResourceEditCommand(
          speak(text, sendFrom),
          targets.map((object) => ({ text, object }))
        );

      beforeEach(() => {
        made = [];
        mockLoadGameSystemAsync.mockImplementation(loadedLater);
        character.setLocation('table');
        character.addExtendData();
        character.buffs.addRound('毒', '', 3, { timing: 'none', kind: 'debuff' });
        character.buffs.addRound('加速', '', 2);
        archer = onTable('弓兵');
        archer.buffs.addRound('祝福', '', 2);
        const stored = onTable('控え');
        stored.setLocation('common');
        stored.buffs.addRound('加速', '', 2);
      });

      afterEach(() => {
        for (const piece of made) piece.destroy();
        character.destroy();
      });

      it('takes every buff off every piece on the table for the game master with &&*-', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;

        await say('&&*-');

        expect(systemText()).toBe('卓全体からすべてのバフを解除（2体・3件）');
        expect(names(character)).toEqual([]);
        expect(names(archer)).toEqual([]);
        expect(names(made[1])).toEqual(['加速']);
      });

      it('takes the buffs or the debuffs alone with &&*バフ- and &&*デバフ-', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;

        await say('&&*デバフ-');
        expect(systemText()).toBe('卓全体からデバフを解除（1体・1件）');
        expect(names(character)).toEqual(['加速']);

        await say('&&*buff-');
        expect(systemText()).toContain('卓全体からバフを解除（2体・2件）');
        expect(names(archer)).toEqual([]);
      });

      it('says so when the table has none of the kind', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;
        await say('&&*-');

        await say('&&*- &&*バフ- &&*デバフ-');

        expect(systemText()).toContain(
          '卓全体にバフはありません    卓全体にバフはありません    卓全体にデバフはありません'
        );
      });

      it.each(['&&*-', '&&*バフ-', '&&*デバフ-'])(
        'takes nothing with %s for anyone but the game master, and only says the sweep is theirs',
        async (command) => {
          PeerCursor.myCursor.role = PeerRole.Player;

          await say(command);

          expect(systemText()).toBe(`バフの一括解除はGMだけが使えます（${command}）`);
          expect(names(character)).toEqual(['毒', '加速']);
          expect(names(archer)).toEqual(['祝福']);
        }
      );

      it('leaves the sweeps by how a buff is held, by its rounds and by its name taking what they took', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;
        archer.buffs.addRound('毒', '', 2);

        await say('&&none-');
        expect(systemText()).toBe('卓全体から消えないバフを解除（1体・1件）');
        expect(names(character)).toEqual(['加速']);

        await say('&&2R-');
        expect(systemText()).toContain('卓全体から残り2Rのバフを解除（2体・3件）');
        archer.buffs.addRound('毒', '', 5);

        await say('&&毒-');
        expect(systemText()).toContain('卓全体から「毒」を解除（1体・1件）');
        expect(names(archer)).toEqual([]);
      });

      it('clears the speaker’s own piece with &*-, for a player as for the game master', async () => {
        PeerCursor.myCursor.role = PeerRole.Player;

        await say('&*-', [null], character.identifier);

        expect(systemText()).toBe('すべてのバフを解除（2件）');
        expect(names(character)).toEqual([]);
        expect(names(archer)).toEqual(['祝福']);
      });

      it('clears nothing with &*- where the speaker is no piece', async () => {
        await say('&*-');

        expect(systemText()).toBe('');
        expect(names(character)).toEqual(['毒', '加速']);
      });

      it('clears each piece aimed at with t&*-, another’s piece among them, and names each', async () => {
        PeerCursor.myCursor.role = PeerRole.Player;

        await say('t&*-', [character, archer]);

        expect(systemText()).toBe('[キャラクターB] すべてのバフを解除（2件）    [弓兵] すべてのバフを解除（1件）');
        expect(names(character)).toEqual([]);
        expect(names(archer)).toEqual([]);
      });

      it('counts a part aimed at along with its body once, in the line of its body (acceptance 7)', async () => {
        const head = partOf(character, 'Bの頭');
        head.buffs.addRound('集中', '', 2);

        await say('t&*-', [head, character, archer]);

        expect(systemText()).toBe(
          '[キャラクターB] すべてのバフを解除（本体と部位1・3件）    [弓兵] すべてのバフを解除（1件）'
        );
        expect(names(head)).toEqual([]);
      });

      it('clears a part aimed at without its body on its own', async () => {
        const head = partOf(character, 'Bの頭');
        head.buffs.addRound('集中', '', 2);

        await say('t&*-', [head]);

        expect(systemText()).toBe('[Bの頭] すべてのバフを解除（1件）');
        expect(names(character)).toEqual(['毒', '加速']);
      });

      it('keeps the report of a clearing written after s secret', async () => {
        await say('s&*デバフ-', [null], character.identifier);

        const [report] = tab.chatMessages.filter((message) => message.tag.startsWith('system'));
        expect(report.tag).toBe('system secret');
        expect(report.text).toBe('デバフを解除（1件）');
      });
    });

    describe('putting values back to their defaults', () => {
      let archer: GameCharacter;
      let made: GameCharacter[];
      let hit: DataElement;
      let dodge: DataElement;

      function loadedLater(): Promise<{ ID: string }> {
        return new Promise((resolve) => setTimeout(() => resolve({ ID: 'DiceBot' })));
      }

      function numberOn(piece: GameCharacter, name: string, value: number, fallback?: string): DataElement {
        const item = DataElement.create(name, value, {
          [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
          ...(fallback === undefined ? {} : { [DataElementAttribute.DEFAULT]: fallback }),
        });
        piece.detailDataElement!.children[0].appendChild(item);
        return item;
      }

      function onTable(name: string): GameCharacter {
        const piece = GameCharacter.create(name, 1, '');
        piece.setLocation('table');
        piece.addExtendData();
        made.push(piece);
        return piece;
      }

      function partOf(body: GameCharacter, name: string): GameCharacter {
        const part = onTable(name);
        part.ridingOn = body.identifier;
        part.rideSeat = 'part';
        return part;
      }

      const hpOf = (piece: GameCharacter) => DataElement.findElementByReference(piece.detailDataElement!, 'HP')!;
      const buffsOf = (piece: GameCharacter) => piece.buffs.list().map((data) => data.name);
      const say = (text: string, targets: (GameCharacter | null)[] = [null], sendFrom = character.identifier) =>
        processor.checkResourceEditCommand(
          speak(text, sendFrom),
          targets.map((object) => ({ text, object }))
        );
      const lines = () => tab.chatMessages.filter((message) => message.tags.includes('system'));
      const forget = () => {
        for (const message of [...tab.chatMessages]) message.destroy();
      };

      beforeEach(() => {
        made = [];
        mockLoadGameSystemAsync.mockImplementation(loadedLater);
        mockDiceRollAsync.mockImplementation(async (command: string) => {
          const total = Function(`return ${command.replace(/\(1d1-1\)/, '0')}`)() as number;
          return { id: 'DiceBot', result: `DiceBot : (${command}) ＞ ${total}`, isSecret: false };
        });
        PeerCursor.myCursor.role = PeerRole.Player;
        character.setLocation('table');
        character.addExtendData();
        hit = numberOn(character, '命中', 5, '3');
        dodge = numberOn(character, '回避', 2, '4');
        numberOn(character, '防護', 7);
        archer = onTable('弓兵');
      });

      afterEach(() => {
        for (const piece of made) piece.destroy();
        character.destroy();
      });

      it.each([':*=既定', ':*=default', '：＊＝既定', ':*=Default'])(
        'puts every item of the speaker’s piece that keeps a default back with %s, and tells each',
        async (line) => {
          await say(line);

          expect(systemText()).toBe('既定値に戻す 命中:5→3 回避:2→4');
          expect([hit.value, dodge.value]).toEqual([3, 4]);
          expect(character.status.getValue('防護', 'now')).toBe(7);
          expect(character.status.getValue('HP', 'now')).toBe(200);
        }
      );

      it('says so where every item stands at its default already, and where none keeps one', async () => {
        await say(':*=既定');
        forget();
        await say(':*=既定');
        expect(systemText()).toBe('既定値のままです');

        forget();
        await say(':*=既定', [null], archer.identifier);
        expect(systemText()).toBe('既定値のある項目はありません');
      });

      it('puts back one item alone with :名前=既定, and its maximum alone with ^ (acceptance 12)', async () => {
        const hp = hpOf(character);
        hp.setAttribute(DataElementAttribute.DEFAULT, '150');
        hp.setAttribute(DataElementAttribute.DEFAULT_MAX, '180');
        hp.currentValue = 40;

        await say(':HP=既定');
        expect(systemText()).toBe('既定値に戻す HP:40→150');
        expect([hp.value, hit.value]).toEqual([200, 5]);

        forget();
        await say(':HP^=既定');
        expect(systemText()).toBe('既定値に戻す HP(最大値):200→180');
        expect([hp.value, hp.currentValue, hit.value]).toEqual([180, 150, 5]);
      });

      it('puts a correction back with _MAX_BUFF=既定, the maximum following it', async () => {
        const hp = hpOf(character);
        hp.setAttribute(DataElementAttribute.MAX_BASE, '200');
        hp.setAttribute(DataElementAttribute.DEFAULT_MAX_CORRECTION, '0');
        await say(':HP_MAX_BUFF+30');
        forget();

        await say(':HP_MAX_BUFF=既定');

        expect(systemText()).toBe('既定値に戻す HP(最大補正):30→0 HP(最大値):230→200');
        expect(hp.maxCorrection).toBe(0);
      });

      it('changes nothing and says so where the item named keeps no default', async () => {
        await say(':防護=既定 :HP^=既定 :命中=既定');
        expect(systemText()).toBe(
          '防護に既定値はありません    HP(最大値)に既定値はありません    既定値に戻す 命中:5→3'
        );
        expect(character.status.getValue('防護', 'now')).toBe(7);

        forget();
        await say(':命中=既定');
        expect(systemText()).toBe('命中は既定値のままです');
      });

      it('says nothing of an item the piece has not, as for any change of one', async () => {
        await say(':魔力=既定');

        expect(systemText()).toBe('');
      });

      it('puts back the pieces aimed at with t:, another’s piece among them, and names each', async () => {
        numberOn(archer, '命中', 9, '6');

        await say('t:*=既定', [character, archer]);
        expect(systemText()).toBe('[キャラクターB] 既定値に戻す 命中:5→3 回避:2→4    [弓兵] 既定値に戻す 命中:9→6');

        hit.value = 8;
        forget();
        await say('t:命中=既定', [character, archer]);
        expect(systemText()).toBe('[キャラクターB] 既定値に戻す 命中:8→3    [弓兵] 命中は既定値のままです');
      });

      it('puts back nothing where the speaker is no piece, or a line aimed at targets has none', async () => {
        await say(':*=既定 &リセット-', [null], '');
        await say('t:*=既定 t&リセット-');

        expect(systemText()).toBe('');
        expect(hit.value).toBe(5);
      });

      it('puts the parts back with the body, a part aimed at along with it once, under its name', async () => {
        const head = partOf(character, 'Bの頭');
        const bite = numberOn(head, '命中', 9, '6');

        await say('t:*=既定', [head, character]);

        expect(systemText()).toBe('[キャラクターB] 既定値に戻す 命中:5→3 回避:2→4 部位「Bの頭」 命中:9→6');
        expect(bite.value).toBe(6);

        bite.value = 9;
        forget();
        await say('t:*=既定', [head]);
        expect(systemText()).toBe('[Bの頭] 既定値に戻す 命中:9→6');
      });

      it('takes the buffs off first wherever the line puts the values back, so nothing is taken twice (acceptance 11)', async () => {
        await say('&!強化/命中/+/2/3');
        expect(hit.value).toBe(7);
        forget();

        await say(':*=既定 &*-');

        expect(hit.value).toBe(3);
        expect(buffsOf(character)).toEqual([]);
        expect(systemText()).toBe('すべてのバフを解除（1件）    既定値に戻す 命中:5→3 回避:2→4');
      });

      it('puts the values back after a sweep of the table written later in the line as well', async () => {
        PeerCursor.myCursor.role = PeerRole.GameMaster;
        await say('&!強化/命中/+/2/3');
        forget();

        await say(':命中=既定 &&*-');

        expect(hit.value).toBe(3);
        expect(systemText()).toBe('卓全体からすべてのバフを解除（1体・1件）    既定値に戻す 命中:5→3');
      });

      it('puts an item back that a buff moved and was told not to give back', async () => {
        const hp = hpOf(character);
        hp.setAttribute(DataElementAttribute.DEFAULT, '200');
        await say('&!毒/:HP/-/20/3');
        expect(hp.currentValue).toBe(180);

        await say('&リセット-');

        expect(hp.currentValue).toBe(200);
      });

      it('changes a status written beside it first, and then puts the values back', async () => {
        await say(':*=既定 :命中+4');

        expect(systemText()).toMatch(/^命中:5\+.*＞9 {4}既定値に戻す 命中:9→3 回避:2→4$/);
      });

      describe('the one word that does both (acceptance 13)', () => {
        beforeEach(() => {
          character.buffs.addRound('毒', '', 3, { timing: 'none', kind: 'debuff' });
          character.buffs.addRound('リセット', '', 2);
          numberOn(archer, '命中', 9, '6');
          archer.buffs.addRound('祝福', '', 2);
        });

        it.each(['&リセット-', '&reset-', '＆ＲＥＳＥＴ－'])(
          'clears the speaker’s piece and puts it back with %s, as &*- and :*=既定 do',
          async (line) => {
            await say(line);

            expect(systemText()).toBe('すべてのバフを解除（2件）    既定値に戻す 命中:5→3 回避:2→4');
            expect(buffsOf(character)).toEqual([]);
            expect(buffsOf(archer)).toEqual(['祝福']);
          }
        );

        it('comes to what &*- and :*=既定 written apart come to', async () => {
          await say('&*- :*=既定');
          const apart = systemText();
          forget();
          hit.value = 5;
          dodge.value = 2;
          character.buffs.addRound('毒', '', 3, { timing: 'none', kind: 'debuff' });
          character.buffs.addRound('リセット', '', 2);

          await say('&リセット-');

          expect(systemText()).toBe(apart);
        });

        it('clears and puts back each piece aimed at with t&リセット-, a part with its body', async () => {
          const head = partOf(character, 'Bの頭');
          head.buffs.addRound('集中', '', 2);

          await say('t&リセット-', [head, character, archer]);

          expect(systemText()).toBe(
            '[キャラクターB] すべてのバフを解除（本体と部位1・3件）    [弓兵] すべてのバフを解除（1件）    ' +
              '[キャラクターB] 既定値に戻す 命中:5→3 回避:2→4    [弓兵] 既定値に戻す 命中:9→6'
          );
          expect(buffsOf(head)).toEqual([]);
        });

        it('says what there was none of', async () => {
          const bare = onTable('案山子');

          await say('&reset-', [null], bare.identifier);

          expect(systemText()).toBe('解除するバフはありません    既定値のある項目はありません');
        });

        it('resets the whole table for the game master with &&リセット-, and counts what it did', async () => {
          PeerCursor.myCursor.role = PeerRole.GameMaster;
          const stored = onTable('控え');
          stored.setLocation('common');
          stored.buffs.addRound('加速', '', 2);
          const kept = numberOn(stored, '命中', 9, '6');

          await say('&&リセット-');

          expect(systemText()).toBe('卓全体をリセット（2体・バフ3件・値3項目）');
          expect([hit.value, dodge.value, kept.value]).toEqual([3, 4, 9]);
          expect(buffsOf(character)).toEqual([]);
          expect(buffsOf(archer)).toEqual([]);
          expect(buffsOf(stored)).toEqual(['加速']);

          forget();
          await say('&&reset-');
          expect(systemText()).toBe('卓全体に解除するバフも戻す値もありません');
        });

        it('puts a status a buff moved back to its default exactly, the buff taken off first', async () => {
          PeerCursor.myCursor.role = PeerRole.GameMaster;
          await say('&!強化/命中/+/2/3');

          await say('&&リセット-');

          expect(hit.value).toBe(3);
        });

        it.each(['&&リセット-', '&&reset-', 's&&リセット-'])(
          'does nothing with %s for anyone but the game master, and only says the reset is theirs',
          async (line) => {
            await say(line);

            const [report] = tab.chatMessages.filter((message) => message.tag.startsWith('system'));
            expect(report.text).toBe(`卓全体のリセットはGMだけが使えます（${line.replace(/^s/, '')}）`);
            expect(hit.value).toBe(5);
            expect(buffsOf(character)).toEqual(['毒', 'リセット']);
            expect(buffsOf(archer)).toEqual(['祝福']);
          }
        );

        it.each(['s&リセット-', 's:*=既定', 'st:*=既定', 'st&reset-'])(
          'keeps the report of %s secret',
          async (line) => {
            await say(line, [character]);

            const [report] = tab.chatMessages.filter((message) => message.tag.startsWith('system'));
            expect(report.tag).toBe('system secret');
            expect(report.text).toContain('既定値に戻す 命中:5→3 回避:2→4');
          }
        );
      });

      describe('what a reset tells this device, to be taken back by (acceptance 17)', () => {
        let told: ResetCarriedOutEvent[];
        let stop: () => void;

        const recordOf = (event: ResetCarriedOutEvent) => event.record as ResetRecord;
        const reportLine = () => tab.chatMessages.filter((message) => message.tags.includes('system'))[0];

        beforeEach(() => {
          told = [];
          stop = resetCarriedOut$.subscribe((event) => told.push(event));
          character.buffs.addRound('毒', '', 3, { timing: 'none', kind: 'debuff' });
          character.buffs.addRound('加速', '', 2);
        });

        afterEach(() => stop());

        it('tells what &リセット- did under the line that reports it, and that puts everything back', async () => {
          await say('&!強化/命中/+/2/3');
          forget();
          const before = character.buffs.snapshot();
          expect(hit.value).toBe(7);

          await say('&リセット-');

          expect(told).toHaveLength(1);
          expect(told[0].messageIdentifier).toBe(reportLine().identifier);
          expect(recordOf(told[0]).pieces.map((piece) => piece.piece)).toEqual([character.identifier]);
          expect([hit.value, dodge.value]).toEqual([3, 4]);
          expect(buffsOf(character)).toEqual([]);

          expect(undoReset(recordOf(told[0]))).toEqual({ restored: 1, skipped: 0 });
          expect(character.buffs.snapshot()).toEqual(before);
          expect([hit.value, dodge.value]).toEqual([7, 2]);
        });

        it.each(['&*-', '&*デバフ-', ':*=既定', ':命中=既定', '&*- :*=既定'])(
          'tells what %s did, once for the line',
          async (line) => {
            await say(line);

            expect(told).toHaveLength(1);
            expect(told[0].messageIdentifier).toBe(reportLine().identifier);
          }
        );

        it('tells of a part with its body, each a piece of its own', async () => {
          const head = partOf(character, 'Bの頭');
          head.buffs.addRound('集中', '', 2);

          await say('&リセット-');

          expect(
            recordOf(told[0])
              .pieces.map((piece) => piece.piece)
              .sort()
          ).toEqual([character.identifier, head.identifier].sort());
        });

        it('tells of every piece &&リセット- and &&*- changed, for the game master', async () => {
          PeerCursor.myCursor.role = PeerRole.GameMaster;
          numberOn(archer, '命中', 9, '6');

          await say('&&リセット-');

          expect(
            recordOf(told[0])
              .pieces.map((piece) => piece.piece)
              .sort()
          ).toEqual([character.identifier, archer.identifier].sort());
          undoReset(recordOf(told[0]));
          expect(buffsOf(character)).toEqual(['毒', '加速']);
          expect(archer.status.getValue('命中', 'now')).toBe(9);

          forget();
          await say('&&*-');
          expect(told).toHaveLength(2);
          expect(recordOf(told[1]).pieces.map((piece) => piece.piece)).toEqual([character.identifier]);
        });

        it('leaves a change of a status written on the same line out of what is taken back', async () => {
          await say(':命中+4 &リセット-');

          expect(hit.value).toBe(3);
          undoReset(recordOf(told[0]));
          expect(hit.value).toBe(9);
        });

        it.each(['&毒-', '&D', '&R-', ':命中+1', '&盾/防御+1/3'])(
          'tells nothing for %s, which is no reset',
          async (line) => {
            await say(line);

            expect(told).toEqual([]);
          }
        );

        it.each([
          ['&&none-', ['加速']],
          ['&&2R-', ['毒']],
          ['&&毒-', ['加速']],
        ])('tells what the sweep by a condition %s did, so it can be taken back', async (line, left) => {
          PeerCursor.myCursor.role = PeerRole.GameMaster;

          await say(line);

          expect(buffsOf(character)).toEqual(left);
          expect(told).toHaveLength(1);
          expect(told[0].messageIdentifier).toBe(reportLine().identifier);
          undoReset(recordOf(told[0]));
          expect(buffsOf(character)).toEqual(['毒', '加速']);
        });

        it('tells nothing for a sweep by a condition that found nothing', async () => {
          PeerCursor.myCursor.role = PeerRole.GameMaster;

          await say('&&9R-');

          expect(told).toEqual([]);
        });

        it('tells nothing where the reset changed nothing', async () => {
          const bare = onTable('案山子');

          await say('&reset-', [null], bare.identifier);

          expect(told).toEqual([]);
        });

        it('tells nothing for a sweep anyone but the game master asks for', async () => {
          await say('&&リセット-');
          await say('&&*-');

          expect(told).toEqual([]);
        });
      });

      describe('what a piece keeps back (acceptance 14)', () => {
        let master: PeerCursor;

        beforeEach(() => {
          master = new PeerCursor();
          master.initialize();
          master.userId = 'u-gm';
          master.role = PeerRole.GameMaster;
          character.buffs.addRound('秘薬', '', 3);
        });

        afterEach(() => master.destroy());

        it('says only how many items of a piece whose contents are kept changed, and the whole to those who may see', async () => {
          character.disclosureMode = 'gm';

          await say('&リセット-');

          const [said, told] = lines();
          expect(said.text).toBe('すべてのバフを解除（1件）    既定値に戻す（2項目）');
          expect(said.sendTo).toEqual([]);
          expect(told.text).toBe('すべてのバフを解除（1件）    既定値に戻す 命中:5→3 回避:2→4');
          expect(told.sendTo).toEqual(['u-gm']);
        });

        it('keeps the items of a part whose contents are kept, beside a body that keeps none', async () => {
          const head = partOf(character, 'Bの頭');
          numberOn(head, '命中', 9, '6');
          head.disclosureMode = 'gm';

          await say(':*=既定');

          const [said, told] = lines();
          expect(said.text).toBe('既定値に戻す 命中:5→3 回避:2→4 部位「Bの頭」（1項目）');
          expect(told.text).toBe('既定値に戻す 命中:5→3 回避:2→4 部位「Bの頭」 命中:9→6');
        });

        it('names a piece whose name is hidden by marks alone, and never names a buff', async () => {
          character.hideName = true;

          await say('t&リセット-', [character]);

          expect(lines()).toHaveLength(1);
          expect(lines()[0].text).toBe('[？？？] すべてのバフを解除（1件）    [？？？] 既定値に戻す 命中:5→3 回避:2→4');
          expect(lines()[0].text).not.toContain('秘薬');
        });

        it('gives counts alone for the whole table', async () => {
          PeerCursor.myCursor.role = PeerRole.GameMaster;
          character.disclosureMode = 'gm';

          await say('&&リセット-');

          expect(lines()).toHaveLength(1);
          expect(lines()[0].text).toBe('卓全体をリセット（1体・バフ1件・値2項目）');
        });
      });
    });

    describe('a secret prefix', () => {
      beforeEach(() => {
        character.addExtendData();
        mockDiceRollAsync.mockImplementation(async (command: string) => {
          const total = Function(`return ${command.replace(/\(1d1-1\)/, '0')}`)() as number;
          return { id: 'DiceBot', result: `DiceBot : (${command}) ＞ ${total}`, isSecret: false };
        });
      });

      afterEach(() => {
        character.destroy();
      });

      function systemTags(): string[] {
        return tab.chatMessages.filter((message) => message.tag.startsWith('system')).map((message) => message.tag);
      }

      it('puts on a buff written after s, and keeps the report secret', async () => {
        const message = speak('s&加護/3', character.identifier);

        await processor.checkResourceEditCommand(message, [{ text: 's&加護/3', object: character }]);

        expect(character.buffs.find('加護')).not.toBeNull();
        expect(systemTags()).toEqual(['system secret']);
      });

      it('lays a buff told when its effect moves from a line of chat, its colon read as no command of its own', async () => {
        const hp = character.status.getValue('HP', 'now')!;
        const line = '&!再生/:HP/+/0~+3/none/発生:手番開始';
        const message = speak(line, character.identifier);

        await processor.checkResourceEditCommand(message, [{ text: line, object: character }]);

        const laid = character.buffs.find('再生')!;
        expect(buffEffectTimingOf(laid)).toBe('turnStart');
        expect(laid.getAttribute(DataElementAttribute.BUFF_TIMING)).toBe('none');
        expect(laid.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('');
        expect(character.status.getValue('HP', 'now')).toBe(hp);
      });

      it('carries out every secret command in a line, not only the first', async () => {
        const hp = character.status.getValue('HP', 'now')!;
        const mp = character.status.getValue('MP', 'now')!;
        const message = speak('s:HP-1 s:MP-2', character.identifier);

        await processor.checkResourceEditCommand(message, [{ text: 's:HP-1 s:MP-2', object: character }]);

        expect(character.status.getValue('HP', 'now')).toBe(hp - 1);
        expect(character.status.getValue('MP', 'now')).toBe(mp - 2);
      });
    });

    describe('a piece whose contents are kept from anyone', () => {
      let master: PeerCursor;

      beforeEach(() => {
        master = new PeerCursor();
        master.initialize();
        master.userId = 'u-gm';
        master.role = PeerRole.GameMaster;
        character.disclosureMode = 'gm';
      });

      afterEach(() => master.destroy());

      function lines() {
        return tab.chatMessages.filter((message) => message.tags.includes('system'));
      }

      it('says only the change to everyone, and the whole line to the game master alone', async () => {
        await processor.checkResourceEditCommand(speak(':HP-5', character.identifier), [
          { text: ':HP-5', object: character },
        ]);

        expect(character.status.getValue('HP', 'now')).toBe(195);
        const [said, told] = lines();
        expect(said.text).toMatch(/^HP:/);
        expect(said.text).not.toMatch(/200|＞|195/);
        expect(said.sendTo).toEqual([]);
        expect(told.text).toMatch(/^HP:200.*＞195$/);
        expect(told.sendTo).toEqual(['u-gm']);
        expect(told.isSentBy(said.originFrom)).toBe(false);
      });

      it('says what is left to everyone once the piece is beaten', async () => {
        character.status.setValue('HP', 'now', 3);

        await processor.checkResourceEditCommand(speak(':HP-5', character.identifier), [
          { text: ':HP-5', object: character },
        ]);

        expect(lines()).toHaveLength(1);
        expect(lines()[0].text).toMatch(/^HP:3.*＞-2$/);
      });

      it('judges a resource counting up to its end beaten at its maximum, not at nothing', async () => {
        const hp = DataElement.findElementByReference(character.detailDataElement!, 'HP')!;
        hp.setAttribute(DataElementAttribute.GAUGE_INVERTED, 'true');
        const max = character.status.getValue('HP', 'max')!;
        character.status.setValue('HP', 'now', 3);

        await processor.checkResourceEditCommand(speak(':HP-5', character.identifier), [
          { text: ':HP-5', object: character },
        ]);
        expect(lines()[0].text).not.toMatch(/＞-2/);

        for (const message of [...tab.chatMessages]) message.destroy();
        character.status.setValue('HP', 'now', max - 1);
        await processor.checkResourceEditCommand(speak(':HP+5', character.identifier), [
          { text: ':HP+5', object: character },
        ]);
        expect(lines()).toHaveLength(1);
        expect(lines()[0].text).toMatch(new RegExp(`^HP:${max - 1}.*＞${max}`));
      });

      it('says everything to everyone for a piece disclosed to all', async () => {
        character.disclosureMode = 'all';

        await processor.checkResourceEditCommand(speak(':HP-5', character.identifier), [
          { text: ':HP-5', object: character },
        ]);

        expect(lines()).toHaveLength(1);
        expect(lines()[0].text).toMatch(/^HP:200.*＞195$/);
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

    it('works a bracketed calculation with no dice in it out as one, rounding and all', async () => {
      mockDiceRollAsync.mockImplementation(async (command: string) =>
        command === 'C(13/2C)'
          ? { id: 'DiceBot', result: 'DiceBot : c(13/2C) ＞ 7', isSecret: false }
          : { id: 'DiceBot', result: 'DiceBot : (-7+1+(1D1-1)) ＞ -7+1+(1[1]-1) ＞ -6', isSecret: false }
      );

      await processor.resourceEditProcess(
        null,
        [{ resourceCommand: 't:HP-[13/2C]+1', object: character }],
        [],
        speak('t:HP-[13/2C]+1'),
        false
      );

      expect(mockDiceRollAsync).toHaveBeenNthCalledWith(1, 'C(13/2C)', expect.anything());
      expect(mockDiceRollAsync).toHaveBeenNthCalledWith(2, '-7+1+(1d1-1)', expect.anything());
      expect(character.status.getValue('HP', 'now')).toBe(194);
    });

    it('takes a rounding written outside the brackets as part of the arithmetic', async () => {
      mockDiceRollAsync.mockResolvedValue({
        id: 'DiceBot',
        result: 'DiceBot : (13/2R+1+(1D1-1)) ＞ 13/2R+1+(1[1]-1) ＞ 8',
        isSecret: false,
      });

      await processor.resourceEditProcess(
        null,
        [{ resourceCommand: 't:HP+13/2R+1', object: character }],
        [],
        speak('t:HP+13/2R+1'),
        false
      );

      expect(mockDiceRollAsync).toHaveBeenCalledWith('13/2R+1+(1d1-1)', expect.anything());
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

    describe('an amount the system reads only as a whole', () => {
      const fumbled = (text: string) => ({
        id: 'DiceBot',
        result: `DiceBot : ${text}`,
        isSecret: false,
        detail: { system: 'DiceBot', faces: [], outcome: 'fumble' as const },
      });

      async function send(command: string): Promise<void> {
        await processor.resourceEditProcess(
          null,
          [{ resourceCommand: command, object: character }],
          [],
          speak(command),
          false
        );
      }

      it('rolls the whole amount as one command when a letter outside the brackets belongs to it', async () => {
        mockDiceRollAsync.mockImplementation(async (command: string) =>
          command === 'k10@13+(2+3)+5h+1'
            ? { id: 'DiceBot', result: 'DiceBot : KeyNo.10+10 ＞ 2D:[4,3]=7 ＞ (3+10)/2+1 ＞ 8', isSecret: false }
            : { id: 'DiceBot', result: '', isSecret: false }
        );

        await send('t:HP-([k10@13]+(2+3)+5h+1)');

        expect(mockDiceRollAsync).toHaveBeenCalledTimes(1);
        expect(character.status.getValue('HP', 'now')).toBe(192);
        expect(systemText()).toContain('HP:200-8＞192');
        expect(systemText()).toContain('└ [k10@13+(2+3)+5h+1] KeyNo.10+10');
      });

      it('rolls a command it cannot read whole without the arithmetic after its last letters, and adds that on', async () => {
        mockDiceRollAsync.mockImplementation(async (command: string) => {
          if (command === 'k3@9+5$+1#0')
            return { id: 'DiceBot', result: 'DiceBot : KeyNo.3c[9]m[+1]+5 ＞ 2D:[2,2]=5 ＞ 1+5 ＞ 6', isSecret: false };
          if (command === 'C(0-2)') return { id: 'DiceBot', result: 'DiceBot : c(0-2) ＞ -2', isSecret: false };
          return { id: 'DiceBot', result: '', isSecret: false };
        });

        await send('t:HP-([k3@9]+5$+1#0-2)Z');

        expect(mockDiceRollAsync).toHaveBeenCalledWith('k3@9+5$+1#0', expect.anything());
        expect(character.status.getValue('HP', 'now')).toBe(196);
        expect(systemText()).toContain('└ [k3@9+5$+1#0] KeyNo.3c[9]m[+1]+5 ＞ 2D:[2,2]=5 ＞ 1+5 ＞ 6 -2 ＞ 4');
      });

      it('rolls a system command written without brackets the same way', async () => {
        mockDiceRollAsync.mockResolvedValue({
          id: 'DiceBot',
          result: 'DiceBot : KeyNo.10+5 ＞ 2D:[1,3]=4 ＞ (1+5)/2+3 ＞ 6',
          isSecret: false,
        });

        await send('t:HP-(k10@13+5h+3)');

        expect(mockDiceRollAsync).toHaveBeenCalledWith('k10@13+5h+3', expect.anything());
        expect(character.status.getValue('HP', 'now')).toBe(194);
      });

      it('changes nothing when a bracketed roll fails outright, leaving out what was to be added to it', async () => {
        mockDiceRollAsync.mockResolvedValue(fumbled('KeyNo.10c[10] ＞ 2D:[1,1]=2 ＞ ** ＞ 自動的失敗'));

        await send('t:HP-([k10@10]+5+2)');

        expect(mockDiceRollAsync).toHaveBeenCalledTimes(1);
        expect(character.status.getValue('HP', 'now')).toBe(200);
        expect(systemText()).toContain('HP:200-0＞200');
        expect(systemText()).toContain('自動的失敗');
        expect(systemText()).not.toContain('計算できません');
      });

      it('changes nothing when the whole amount fails outright', async () => {
        mockDiceRollAsync.mockResolvedValue(fumbled('KeyNo.10c[10]+5 ＞ 2D:[1,1]=2 ＞ ** ＞ 自動的失敗'));

        await send('t:HP-(k10@10+5h+3)');

        expect(character.status.getValue('HP', 'now')).toBe(200);
        expect(systemText()).toContain('HP:200-0＞200');
      });

      it('leaves a value to be set alone, rather than set to nought, when its roll fails outright', async () => {
        mockDiceRollAsync.mockResolvedValue(fumbled('KeyNo.10c[10] ＞ 2D:[1,1]=2 ＞ ** ＞ 自動的失敗'));

        await send('t:HP=([k10@10]+5)');

        expect(character.status.getValue('HP', 'now')).toBe(200);
        expect(systemText()).toContain('t:HP=([k10@10]+5)は合計の出ないロールだったので変えません');
      });

      it('still cannot work out a roll that ends without a total and without failing outright', async () => {
        mockDiceRollAsync.mockResolvedValue({ id: 'DiceBot', result: 'DiceBot : 2D:[3,4] ＞ 成功', isSecret: false });

        await send('t:HP-([k10@10]+5)');

        expect(character.status.getValue('HP', 'now')).toBe(200);
        expect(systemText()).toContain('t:HP-([k10@10]+5)を計算できません');
      });
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
