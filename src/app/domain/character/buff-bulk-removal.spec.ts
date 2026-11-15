import {
  BuffRemovalRule,
  countBuffRemoval,
  describeBuffRemoval,
  describeBuffsLacking,
  isClearedWithBody,
  isPieceResetCommand,
  isTableResetCommand,
  parseBuffClearanceCommand,
  parseBuffRemovalCommand,
  removeBuffsAcross,
  removeBuffsWithParts,
} from '@axe/domain/character/buff-bulk-removal';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';

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
      ['&&*-', { kind: 'all' }],
      ['＆＆＊－', { kind: 'all' }],
      ['s&&*-', { kind: 'all' }],
      ['&&*バフ-', { kind: 'buffs' }],
      ['&&*buff-', { kind: 'buffs' }],
      ['&&*デバフ-', { kind: 'debuffs' }],
      ['&&*Debuff-', { kind: 'debuffs' }],
      ['&&*毒-', { kind: 'name', name: '*毒' }],
      ['&&バフ-', { kind: 'name', name: 'バフ' }],
    ])('reads %s', (command, rule) => {
      expect(parseBuffRemovalCommand(command)).toEqual(rule);
    });

    it.each(['&毒-', '&&-', 't&&毒-', '&&毒', '&&毒/3'])('leaves %s to the other buff commands', (command) => {
      expect(parseBuffRemovalCommand(command)).toBeNull();
    });
  });

  describe('the one word that resets', () => {
    it.each(['&リセット-', '&reset-', 't&リセット-', 'T&Reset-', '＆ＲＥＳＥＴ－', 'ｔ＆リセット－'])(
      'reads %s as resetting a piece',
      (command) => {
        expect(isPieceResetCommand(command)).toBe(true);
        expect(isTableResetCommand(command)).toBe(false);
      }
    );

    it.each(['&&リセット-', '&&reset-', 's&&リセット-', '＆＆ＲＥＳＥＴ－'])(
      'reads %s as resetting the table',
      (command) => {
        expect(isTableResetCommand(command)).toBe(true);
        expect(isPieceResetCommand(command)).toBe(false);
        expect(parseBuffRemovalCommand(command)).toEqual({ kind: 'name', name: command.replace(/^s?..|.$/g, '') });
      }
    );

    it.each([
      '&リセット',
      '&リセット/3',
      '&リセット2-',
      '&+リセット-',
      '&*リセット-',
      '&全リセット-',
      't&&リセット-',
      '&resets-',
    ])('leaves %s what it always was', (command) => {
      expect(isPieceResetCommand(command)).toBe(false);
      expect(isTableResetCommand(command)).toBe(false);
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

    it('takes a buff that moves several statuses whole by its name, and counts it once', () => {
      knight.buffs.addRound('全力攻撃', '追D+4', 1, { group: '全力攻撃' });
      knight.buffs.addRound('全力攻撃（回避）', '回避-2', 1, { group: '全力攻撃' });

      expect(countBuffRemoval([knight], { kind: 'name', name: '全力攻撃' })).toEqual({ characters: 1, buffs: 1 });
      expect(removeBuffsAcross([knight], { kind: 'name', name: '全力攻撃' })).toEqual({ characters: 1, buffs: 1 });
      expect(buffNames(knight)).toEqual(['毒', '加速', '猛攻撃']);
    });

    it('counts what a sweep would take without taking it', () => {
      expect(countBuffRemoval([knight, archer], { kind: 'name', name: '毒' })).toEqual({ characters: 2, buffs: 2 });
      expect(buffNames(knight)).toEqual(['毒', '加速', '猛攻撃']);
    });

    it('reaches nobody when nothing matches', () => {
      expect(removeBuffsAcross([knight, archer], { kind: 'rounds', rounds: 9 })).toEqual({ characters: 0, buffs: 0 });
    });
  });

  describe('reading the command that clears a piece', () => {
    it.each<[string, BuffRemovalRule]>([
      ['&*-', { kind: 'all' }],
      ['t&*-', { kind: 'all' }],
      ['＆＊－', { kind: 'all' }],
      ['&*バフ-', { kind: 'buffs' }],
      ['&*buff-', { kind: 'buffs' }],
      ['t&*BUFF-', { kind: 'buffs' }],
      ['&*デバフ-', { kind: 'debuffs' }],
      ['t&*debuff-', { kind: 'debuffs' }],
    ])('reads %s', (command, rule) => {
      expect(parseBuffClearanceCommand(command)).toEqual(rule);
    });

    it.each(['&毒-', '&*毒-', '&*', '&*/3', '&&*-', '&バフ-', '&デバフ-', '&R-', '&D', '&*バフ/攻撃+2/3'])(
      'leaves %s to the other buff commands',
      (command) => {
        expect(parseBuffClearanceCommand(command)).toBeNull();
      }
    );
  });

  describe('clearing by kind (acceptance 6)', () => {
    const catalog = [newStatusAilment('毒')];
    let knight: GameCharacter;

    beforeEach(() => {
      knight = character('騎士');
      knight.buffs.addRound('毒', '', 3, { timing: 'none' });
      knight.buffs.addRound('加速', '', 2);
      knight.buffs.addRound('毒霧', '命中-2', 3, { kind: 'debuff' });
      knight.buffs.addRound('祝福', '', 0, { kind: 'buff' });
    });

    it('takes every buff whatever its rounds, its timing and its kind', () => {
      expect(countBuffRemoval([knight], { kind: 'all' }, catalog)).toEqual({ characters: 1, buffs: 4 });
      expect(removeBuffsAcross([knight], { kind: 'all' }, catalog)).toEqual({ characters: 1, buffs: 4 });
      expect(buffNames(knight)).toEqual([]);
    });

    it('takes the buffs and leaves the debuffs, marked or named after a state of the room', () => {
      expect(removeBuffsAcross([knight], { kind: 'buffs' }, catalog)).toEqual({ characters: 1, buffs: 2 });
      expect(buffNames(knight)).toEqual(['毒', '毒霧']);
    });

    it('takes the debuffs and leaves the buffs', () => {
      expect(removeBuffsAcross([knight], { kind: 'debuffs' }, catalog)).toEqual({ characters: 1, buffs: 2 });
      expect(buffNames(knight)).toEqual(['加速', '祝福']);
    });

    it('moves a buff of several rows whole by the kind of its first row, and counts it once', () => {
      knight.buffs.addRound('呪縛', '命中-2', 1, { group: '呪縛', kind: 'debuff' });
      knight.buffs.addRound('呪縛（回避）', '回避-2', 1, { group: '呪縛' });
      knight.buffs.addRound('全力攻撃', '追D+4', 1, { group: '全力攻撃' });
      knight.buffs.addRound('全力攻撃（回避）', '回避-2', 1, { group: '全力攻撃', kind: 'debuff' });

      expect(countBuffRemoval([knight], { kind: 'debuffs' }, catalog)).toEqual({ characters: 1, buffs: 3 });
      expect(removeBuffsAcross([knight], { kind: 'debuffs' }, catalog)).toEqual({ characters: 1, buffs: 3 });
      expect(buffNames(knight)).toEqual(['加速', '祝福', '全力攻撃', '全力攻撃（回避）']);

      expect(removeBuffsAcross([knight], { kind: 'buffs' }, catalog)).toEqual({ characters: 1, buffs: 3 });
      expect(buffNames(knight)).toEqual([]);
    });

    it('counts what clearing would take without taking it', () => {
      expect(countBuffRemoval([knight], { kind: 'debuffs' }, catalog)).toEqual({ characters: 1, buffs: 2 });
      expect(buffNames(knight)).toEqual(['毒', '加速', '毒霧', '祝福']);
    });

    it('reads every buff with no mark as a buff where the room keeps no states', () => {
      expect(removeBuffsAcross([knight], { kind: 'debuffs' })).toEqual({ characters: 1, buffs: 1 });
      expect(buffNames(knight)).toEqual(['毒', '加速', '祝福']);
    });
  });

  describe('the buff a piece rides two up by', () => {
    let rider: GameCharacter;

    beforeEach(() => {
      rider = character('相乗り');
      rider.buffs.addRound('加速', '', 2);
      rider.buffs.addRound('二人乗り', '命中-2', 3, { timing: 'none', group: '二人乗り' });
      rider.buffs.addRound('二人乗り（回避）', '回避-2', 3, { timing: 'none', group: '二人乗り' });
      rider.rideTwoUpFrom = 'mount';
      rider.rideTwoUpBuff = rider.buffs.find('二人乗り')!.identifier;
    });

    it.each<BuffRemovalRule>([{ kind: 'all' }, { kind: 'buffs' }])(
      'stays, every row of it, while the piece rides so, and is not counted (%j)',
      (rule) => {
        expect(countBuffRemoval([rider], rule)).toEqual({ characters: 1, buffs: 1 });
        expect(removeBuffsAcross([rider], rule)).toEqual({ characters: 1, buffs: 1 });
        expect(buffNames(rider)).toEqual(['二人乗り', '二人乗り（回避）']);
      }
    );

    it('stays where it is a debuff and the debuffs are cleared', () => {
      rider.buffs.addRound('二人乗り', '命中-2', 3, { kind: 'debuff' });

      expect(removeBuffsAcross([rider], { kind: 'debuffs' })).toEqual({ characters: 0, buffs: 0 });
      expect(buffNames(rider)).toEqual(['加速', '二人乗り', '二人乗り（回避）']);
    });

    it('goes with the rest once the piece has got off', () => {
      rider.rideTwoUpFrom = '';

      expect(removeBuffsAcross([rider], { kind: 'all' })).toEqual({ characters: 1, buffs: 2 });
      expect(buffNames(rider)).toEqual([]);
    });

    it('is no other buff of the same name: only the row the piece remembers stays', () => {
      rider.rideTwoUpBuff = 'some-other-row';

      removeBuffsAcross([rider], { kind: 'all' });

      expect(buffNames(rider)).toEqual([]);
    });

    it.each<BuffRemovalRule>([{ kind: 'held' }, { kind: 'rounds', rounds: 3 }, { kind: 'name', name: '二人乗り' }])(
      'stays through a sweep that picks it by how it is held, its rounds or its name, and reaches nobody (%j)',
      (rule) => {
        expect(countBuffRemoval([rider], rule)).toEqual({ characters: 0, buffs: 0 });
        expect(removeBuffsAcross([rider], rule)).toEqual({ characters: 0, buffs: 0 });
        expect(buffNames(rider)).toEqual(['加速', '二人乗り', '二人乗り（回避）']);
      }
    );

    it('leaves a sweep by a condition what else it picks on the piece, and counts only that', () => {
      rider.buffs.addRound('祝福', '', 2, { timing: 'none' });

      expect(removeBuffsAcross([rider], { kind: 'held' })).toEqual({ characters: 1, buffs: 1 });
      expect(buffNames(rider)).toEqual(['加速', '二人乗り', '二人乗り（回避）']);
    });

    it('goes by a sweep that picks it by a condition once the piece has got off', () => {
      rider.rideTwoUpFrom = '';

      expect(removeBuffsAcross([rider], { kind: 'held' })).toEqual({ characters: 1, buffs: 1 });
      expect(buffNames(rider)).toEqual(['加速']);
    });
  });

  describe('a piece of many parts (acceptance 7)', () => {
    let body: GameCharacter;
    let head: GameCharacter;
    let tail: GameCharacter;
    let stranger: GameCharacter;

    function partOf(owner: GameCharacter, name: string): GameCharacter {
      const part = character(name);
      part.ridingOn = owner.identifier;
      part.rideSeat = 'part';
      part.setLocation(owner.location.name);
      return part;
    }

    beforeEach(() => {
      body = character('竜');
      body.setLocation('table');
      body.buffs.addRound('加速', '', 2);
      head = partOf(body, '竜の頭');
      head.buffs.addRound('毒', '', 3);
      head.buffs.addRound('祝福', '', 3);
      tail = partOf(body, '竜の尾');
      stranger = character('騎士');
      stranger.setLocation('table');
      stranger.buffs.addRound('加速', '', 2);
    });

    it('clears the parts with their body and counts their buffs in, the parts that lost any apart', () => {
      expect(removeBuffsWithParts(body, { kind: 'all' })).toEqual({ parts: 1, buffs: 3 });
      expect(buffNames(body)).toEqual([]);
      expect(buffNames(head)).toEqual([]);
      expect(buffNames(stranger)).toEqual(['加速']);
    });

    it('clears a part on its own, leaving its body', () => {
      expect(removeBuffsWithParts(head, { kind: 'all' })).toEqual({ parts: 0, buffs: 2 });
      expect(buffNames(body)).toEqual(['加速']);
    });

    it('leaves a part that stands elsewhere than its body', () => {
      head.setLocation('graveyard');

      expect(removeBuffsWithParts(body, { kind: 'all' })).toEqual({ parts: 0, buffs: 1 });
      expect(buffNames(head)).toEqual(['毒', '祝福']);
    });

    it('tells a part aimed at along with its body, which is cleared with it', () => {
      expect(isClearedWithBody(head, [body, head, stranger])).toBe(true);
      expect(isClearedWithBody(tail, [body, tail])).toBe(true);
      expect(isClearedWithBody(head, [head, stranger])).toBe(false);
      expect(isClearedWithBody(body, [body, head])).toBe(false);
      expect(isClearedWithBody(stranger, [body, stranger])).toBe(false);
      head.setLocation('graveyard');
      expect(isClearedWithBody(head, [body, head])).toBe(false);
    });
  });

  it('names each sweep for the report', () => {
    expect(describeBuffRemoval({ kind: 'all' })).toBe('すべてのバフ');
    expect(describeBuffRemoval({ kind: 'buffs' })).toBe('バフ');
    expect(describeBuffRemoval({ kind: 'debuffs' })).toBe('デバフ');
    expect(describeBuffsLacking({ kind: 'all' })).toBe('バフ');
    expect(describeBuffsLacking({ kind: 'buffs' })).toBe('バフ');
    expect(describeBuffsLacking({ kind: 'debuffs' })).toBe('デバフ');
    expect(describeBuffsLacking({ kind: 'rounds', rounds: 2 })).toBe('残り2Rのバフ');
    expect(describeBuffRemoval({ kind: 'held' })).toBe('消えないバフ');
    expect(describeBuffRemoval({ kind: 'rounds', rounds: 2 })).toBe('残り2Rのバフ');
    expect(describeBuffRemoval({ kind: 'name', name: '毒' })).toBe('「毒」');
  });
});
