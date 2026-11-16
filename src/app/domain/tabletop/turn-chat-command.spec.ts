import { resourceCommandSites } from '@axe/domain/data/resource-command-words';
import {
  readTurnChatCommand,
  TURN_CHAT_COMMANDS,
  turnChatCommandRest,
  turnChatCommandWords,
} from '@axe/domain/tabletop/turn-chat-command';

const commandOf = (line: string) => readTurnChatCommand(line)?.command ?? null;
const buffsOf = (line: string) => resourceCommandSites(line).buffs.map((site) => site.command);

describe('readTurnChatCommand', () => {
  it.each([
    ['&T', 'take'],
    ['&手番', 'take'],
    ['&TE', 'end'],
    ['&手番終了', 'end'],
    ['&TW', 'wait'],
    ['&待機', 'wait'],
    ['&TI', 'stepIn'],
    ['&割り込み', 'stepIn'],
    ['&TB', 'back'],
    ['&前へ', 'back'],
    ['&RS', 'roundStart'],
    ['&ラウンド開始', 'roundStart'],
    ['&RN', 'roundNext'],
    ['&次のラウンド', 'roundNext'],
    ['&RB', 'roundBack'],
    ['&ラウンドを戻す', 'roundBack'],
    ['&RR', 'roundReset'],
    ['&ラウンドリセット', 'roundReset'],
  ])('reads %s as %s', (line, command) => {
    expect(commandOf(line)).toBe(command);
  });

  it('lists nine commands, each under a short name and a word', () => {
    expect(TURN_CHAT_COMMANDS).toHaveLength(9);
    expect(TURN_CHAT_COMMANDS.flatMap((entry) => turnChatCommandWords(entry.command))).toHaveLength(18);
  });

  it('reads a short name in either case and in full-width letters, with a full-width ampersand', () => {
    expect(commandOf('&te')).toBe('end');
    expect(commandOf('＆ＲＳ')).toBe('roundStart');
    expect(commandOf('＆手番')).toBe('take');
  });

  it('reads the command only as the first word of the line', () => {
    expect(commandOf('  &T')).toBe('take');
    expect(commandOf('攻撃します &T')).toBeNull();
    expect(commandOf('2d6 &TE')).toBeNull();
    expect(commandOf('> &T')).toBeNull();
    expect(commandOf('一行目\n&T')).toBeNull();
  });

  it('tells where the word stands and hands back the rest of the line', () => {
    const line = ' &T 2d6+5 命中判定';
    const site = readTurnChatCommand(line)!;

    expect(line.slice(site.from, site.to)).toBe('&T');
    expect(turnChatCommandRest(line, site)).toBe('2d6+5 命中判定');
    expect(line.slice(site.restFrom)).toBe('2d6+5 命中判定');
  });

  it('leaves an empty rest for a command on its own, and takes a line break as the end of the word', () => {
    expect(turnChatCommandRest('&RN  ', readTurnChatCommand('&RN  ')!)).toBe('');
    expect(turnChatCommandRest('&T\n2d6', readTurnChatCommand('&T\n2d6')!)).toBe('2d6');
  });

  it('ends the word at a stamp put right after it', () => {
    const line = '&T［にこ:sfx:smile］';
    const site = readTurnChatCommand(line)!;

    expect(site.command).toBe('take');
    expect(line.slice(site.from, site.to)).toBe('&T');
    expect(turnChatCommandRest(line, site)).toBe('［にこ:sfx:smile］');
  });

  it.each(['&TEAM', '&RSS', '&TT', '&Tの', '&手番開始', '&手番終了です', '&ラウンド', '&待機中', '&R', '&'])(
    'does not read %s, a name that only begins as a command does',
    (line) => {
      expect(commandOf(line)).toBeNull();
    }
  );

  it.each(['&RS/効果', '&T/攻撃+2/3', '&手番/メモ', '&RS-', '&T-', '&手番－', '&T/'])(
    'leaves %s a buff command, with its effect field or its removal mark',
    (line) => {
      expect(commandOf(line)).toBeNull();
      expect(buffsOf(line)).toHaveLength(1);
    }
  );

  it.each(['&R+', '&R-', '&D', '&&毒-', '&&none-', '&+T/攻撃+2/3', '&!T/HP/+/1/3', 't&T', 's&T/1/3', '&T:HP-1'])(
    'does not read %s, which stays what it was',
    (line) => {
      expect(commandOf(line)).toBeNull();
    }
  );
});

describe('resourceCommandSites with a round command', () => {
  it('reads no buff out of a round command that opens the line', () => {
    expect(buffsOf('&T')).toEqual([]);
    expect(buffsOf('＆ＲＳ')).toEqual([]);
    expect(buffsOf('&手番 2d6')).toEqual([]);
  });

  it('still reads the commands in the rest of the line', () => {
    const words = resourceCommandSites('&T 2d6 :HP-1 &加護/防御+1/3');

    expect(words.resources.map((site) => site.command)).toEqual([':HP-1']);
    expect(words.buffs.map((site) => site.command)).toEqual(['&加護/防御+1/3']);
  });

  it('reads the same token as a buff where it does not open the line', () => {
    expect(buffsOf('攻撃 &T')).toEqual(['&T']);
    expect(buffsOf('2d6 &RS')).toEqual(['&RS']);
  });

  it('leaves the rounds commands of buffs as they were', () => {
    expect(buffsOf('&R-')).toEqual(['&R-']);
    expect(buffsOf('&R+')).toEqual(['&R+']);
    expect(buffsOf('&D')).toEqual(['&D']);
    expect(resourceCommandSites('&&毒-').sweeps.map((site) => site.command)).toEqual(['&&毒-']);
  });
});
