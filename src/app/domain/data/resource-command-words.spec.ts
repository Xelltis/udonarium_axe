import { parseBuffRemovalCommand } from '@axe/domain/character/buff-bulk-removal';
import {
  hasSecretEditMark,
  readDefaultResetCommand,
  resourceCommandParts,
  resourceCommandSites,
} from '@axe/domain/data/resource-command-words';

/**
 * The way commands were picked out of a line before they kept their place, to hold the new reading
 * to, but for the secret prefix, which it took off only the first `s:` and `st:` and never off `s&`.
 */
function pickedTheOldWay(source: string) {
  const text = ` ${source}`;
  const secret = !!text.match(/(\s[sSｓＳ][tTｔＴ]?[:：&＆])/i);
  const text7 = text
    .replace(/(\s)[sSｓＳ](?=[tTｔＴ]?[:：&＆])/g, '$1')
    .replace(/([tTｔＴ][:：])/gi, 't:')
    .replace(/([tTｔＴ][&＆])/gi, 't&')
    .replace(/([:：])/gi, ':')
    .replace(/([&＆])/gi, '&');
  const sweeps: string[] = [];
  const resources: string[] = [];
  const buffs: string[] = [];
  for (const chktxt of text7.split(/\s/)) {
    if (parseBuffRemovalCommand(chktxt)) {
      sweeps.push(chktxt);
      continue;
    }
    if (!chktxt.match(/^(t?[:&][^:：&＆])+/gi)) continue;
    resources.push(...(chktxt.match(/t?:[^:：&＆]+/gi) ?? []));
    buffs.push(...(chktxt.match(/t?&[^:：&＆]+/gi) ?? []));
  }
  return { secret, sweeps, resources, buffs };
}

const LINES = [
  ':HP-5',
  '攻撃 :HP-1:MP-2 &加護/3',
  's:HP-1 s:MP-1',
  'st:HP-1 t:MP-2',
  'ｓｔ：ＨＰ－１　：ＭＰ＋２',
  's&加護/3 st&呪い-',
  't&加護/3 t:HP-[1d6]',
  '&&全部- &&毒-',
  'at:HP-1 ノーマル :HP-1t:MP-2',
  '::HP-1 :HP',
  '',
  '   ',
  '2d6 :HP-2d6+3 &猛攻撃/攻撃+2/3',
];

describe('resourceCommandSites', () => {
  it.each(LINES)('picks out the same commands as before from %j', (line) => {
    const words = resourceCommandSites(line);
    expect({
      secret: words.secret,
      sweeps: words.sweeps.map((site) => site.command),
      resources: words.resources.map((site) => site.command),
      buffs: words.buffs.map((site) => site.command),
    }).toEqual(pickedTheOldWay(line));
  });

  it('ends a command at a stamp put right after it, which is never read as part of it', () => {
    const line = ':HP-5［にこ:sfx:smile］&加護/3［了解:seal:ok］';
    const words = resourceCommandSites(line);

    expect(words.resources.map((site) => line.slice(site.from, site.to))).toEqual([':HP-5']);
    expect(words.buffs.map((site) => line.slice(site.from, site.to))).toEqual(['&加護/3']);
  });

  it('takes S& in capitals for a word such as S&W, and s& alone for a secret buff', () => {
    const word = resourceCommandSites('射撃 S&W M36');
    expect(word.buffs).toEqual([]);
    expect(word.secret).toBe(false);
    expect(hasSecretEditMark('射撃 S&W M36')).toBe(false);

    const secret = resourceCommandSites('毒を盛る s&毒/1/3');
    expect(secret.buffs.map((site) => site.command)).toEqual(['&毒/1/3']);
    expect(secret.secret).toBe(true);
    expect(resourceCommandSites('S:HP-1').secret).toBe(true);
  });

  it('takes s& as a secret buff only where a buff command follows, leaving a word such as s&p a word', () => {
    const word = resourceCommandSites('I bought s&p 500 today');
    expect(word.buffs).toEqual([]);
    expect(word.secret).toBe(false);
    expect(hasSecretEditMark('I bought s&p 500 today')).toBe(false);

    for (const command of ['s&毒/1/3', 's&毒-', 's&R-', 's&D', 's&!猛攻/攻撃+2/3', 's&+猛攻/攻撃+2/3', 'st&呪い-']) {
      const read = resourceCommandSites(command);
      expect(read.buffs, command).toHaveLength(1);
      expect(read.secret, command).toBe(true);
    }
  });

  it('takes a secret command written right after a stamp as secret', () => {
    const line = '［にこ:sfx:smile］s:HP-5';

    expect(hasSecretEditMark(line)).toBe(true);
    expect(resourceCommandSites(line).secret).toBe(true);
  });

  it('picks the commands that clear a piece out as buff commands, and those that clear the table as sweeps', () => {
    const words = resourceCommandSites('戦闘終了 &*- t&*デバフ- ＆＊バフ－ &&*- &&*debuff-');

    expect(words.buffs.map((site) => site.command)).toEqual(['&*-', 't&*デバフ-', '&＊バフ－']);
    expect(words.sweeps.map((site) => site.command)).toEqual(['&&*-', '&&*debuff-']);
    expect(words.secret).toBe(false);
  });

  it('takes a clearing written after s as secret, and one that opens the line for no round command', () => {
    for (const line of ['s&*-', 'st&*バフ-', 's&&*-', 'S&&*デバフ-']) {
      const read = resourceCommandSites(line);
      expect(read.buffs.length + read.sweeps.length, line).toBe(1);
      expect(read.secret, line).toBe(true);
    }
    expect(resourceCommandSites('&*-').buffs.map((site) => site.command)).toEqual(['&*-']);
  });

  it('picks the commands that put values back out as resource commands, and the one word that resets as a buff command or a sweep', () => {
    const words = resourceCommandSites('戦闘終了 :*=既定 t:HP^=default ：＊＝既定 &リセット- t&reset- &&リセット-');

    expect(words.resources.map((site) => site.command)).toEqual([':*=既定', 't:HP^=default', ':＊＝既定']);
    expect(words.buffs.map((site) => site.command)).toEqual(['&リセット-', 't&reset-']);
    expect(words.sweeps.map((site) => site.command)).toEqual(['&&リセット-']);
    expect(words.secret).toBe(false);
  });

  it('takes a reset written after s as secret', () => {
    for (const line of ['s:*=既定', 'st:*=default', 's&リセット-', 'st&reset-', 's&&リセット-']) {
      const read = resourceCommandSites(line);
      expect(read.resources.length + read.buffs.length + read.sweeps.length, line).toBe(1);
      expect(read.secret, line).toBe(true);
    }
  });

  it('spans each command where it was typed', () => {
    const line = '攻撃 :HP-1:MP-2 &加護/3';
    const words = resourceCommandSites(line);
    expect(words.resources.map((site) => line.slice(site.from, site.to))).toEqual([':HP-1', ':MP-2']);
    expect(words.buffs.map((site) => line.slice(site.from, site.to))).toEqual(['&加護/3']);
  });

  it('keeps a colon that starts a status in a buff inside the buff, and splits at any other', () => {
    const line = '&!毒/:HP/+/0~-3/3 &!毒/回避-2，：HP+0~-3/3 &毒/3:HP-3';
    const words = resourceCommandSites(line);

    expect(words.buffs.map((site) => site.command)).toEqual(['&!毒/:HP/+/0~-3/3', '&!毒/回避-2，:HP+0~-3/3', '&毒/3']);
    expect(words.resources.map((site) => site.command)).toEqual([':HP-3']);
    expect(words.buffs.map((site) => line.slice(site.from, site.to))).toEqual([
      '&!毒/:HP/+/0~-3/3',
      '&!毒/回避-2，：HP+0~-3/3',
      '&毒/3',
    ]);
  });

  it('spans a secret command from its s, which is no part of the command carried out', () => {
    const line = 'ｓｔ：ＨＰ－１　ｓ：ＭＰ－１';
    const [first, second] = resourceCommandSites(line).resources;
    expect(first.command).toBe('t:ＨＰ－１');
    expect(line.slice(first.from, first.to)).toBe('ｔ：ＨＰ－１');
    expect(second.command).toBe(':ＭＰ－１');
    expect(line.slice(second.from, second.to)).toBe('：ＭＰ－１');
  });

  it('takes the s off every secret command, buffs among them', () => {
    const words = resourceCommandSites('s:HP-1 s:MP-1 s&加護/3 st&呪い- ST:SAN-1');
    expect(words.secret).toBe(true);
    expect(words.resources.map((site) => site.command)).toEqual([':HP-1', ':MP-1', 't:SAN-1']);
    expect(words.buffs.map((site) => site.command)).toEqual(['&加護/3', 't&呪い-']);
  });

  it('leaves an s that begins a word of chat', () => {
    const words = resourceCommandSites('sushi:美味しい 寿司s:HP-1');
    expect(words.resources).toEqual([]);
  });

  it('tells where each command starts with the s that keeps it secret, and where without', () => {
    const line = 'ｓｔ：ＨＰ－１ :MP-1 s&加護/3';
    const words = resourceCommandSites(line);
    expect([...words.resources, ...words.buffs].map((site) => line.slice(site.markFrom, site.to))).toEqual([
      'ｓｔ：ＨＰ－１',
      ':MP-1',
      's&加護/3',
    ]);
  });

  it('takes a sweep after an s in either case as secret, the s no part of it', () => {
    for (const line of ['s&&毒-', 'S&&毒-', 'Ｓ＆＆毒－']) {
      const words = resourceCommandSites(line);
      expect(words.secret).toBe(true);
      expect(words.sweeps.map((site) => [site.markFrom, site.from, site.to])).toEqual([[0, 1, line.length]]);
    }
  });

  it('spans a sweep as a whole word', () => {
    const line = '終わり &&全部-';
    const [sweep] = resourceCommandSites(line).sweeps;
    expect(line.slice(sweep.from, sweep.to)).toBe('&&全部-');
  });
});

describe('resourceCommandParts', () => {
  it('splits a command into its name, operator and amount, each where it stands', () => {
    const command = 't:HP^-2d6L';
    const parts = resourceCommandParts(command)!;
    expect(parts).toMatchObject({ name: 'HP^', operator: '-', amount: '2d6L' });
    expect(command.slice(parts.nameFrom, parts.operatorAt)).toBe('HP^');
    expect(command[parts.operatorAt]).toBe('-');
    expect(command.slice(parts.amountFrom)).toBe('2d6L');
  });

  it('reads full-width marks as half-width ones, keeping their places', () => {
    const parts = resourceCommandParts('：ＨＰ＞瀕死')!;
    expect(parts).toMatchObject({ name: 'ＨＰ', nameFrom: 1, operator: '>', operatorAt: 3, amount: '瀕死' });
  });

  it('answers null when nothing follows the name', () => {
    expect(resourceCommandParts(':HP')).toBeNull();
  });

  it('keeps the field telling when a buff moves its effect in the buff command, its colon and all', () => {
    const line =
      '&!再生/:HP/+/0~+3/none/発生:手番開始 t&!毒/:HP+0~-1/3/@術者/tick：turnEnd/red &再生/回復/発生:手番終了';
    const words = resourceCommandSites(line);

    expect(words.buffs.map((site) => site.command)).toEqual([
      '&!再生/:HP/+/0~+3/none/発生:手番開始',
      't&!毒/:HP+0~-1/3/@術者/tick:turnEnd/red',
      '&再生/回復/発生:手番終了',
    ]);
    expect(words.resources).toEqual([]);
    expect(line.slice(words.buffs[0].from, words.buffs[0].to)).toBe('&!再生/:HP/+/0~+3/none/発生:手番開始');
  });

  it('still cuts a resource command begun right after a buff, whatever the field before it reads', () => {
    const words = resourceCommandSites('&毒/3:HP-3 &発生:HP-1 &毒/発生:HP-1 &毒/効果/発生力:HP-1');

    expect(words.buffs.map((site) => site.command)).toEqual(['&毒/3', '&発生', '&毒/発生', '&毒/効果/発生力']);
    expect(words.resources.map((site) => site.command)).toEqual([':HP-3', ':HP-1', ':HP-1', ':HP-1']);
  });
});

describe('readDefaultResetCommand', () => {
  it.each([':*=既定', ':*=default', ':*=Default', ':*=ＤＥＦＡＵＬＴ', '：＊＝既定', 't:*=既定', ':*= 既定 '])(
    'reads %s as putting every item back',
    (command) => {
      expect(readDefaultResetCommand(command)).toEqual({ kind: 'all' });
    }
  );

  it.each(['既定', '既定値', '規定', '規定値', 'default'])(
    'takes %s for the word, for every item and for one',
    (word) => {
      expect(readDefaultResetCommand(`:*=${word}`)).toEqual({ kind: 'all' });
      expect(readDefaultResetCommand(`t:HP^=${word}`)).toEqual({ kind: 'item', name: 'HP', slot: 'max' });
    }
  );

  it('reads the one item named, at the slot written after its name', () => {
    expect(readDefaultResetCommand(':HP=既定')).toEqual({ kind: 'item', name: 'HP', slot: 'now' });
    expect(readDefaultResetCommand('t:HP^=default')).toEqual({ kind: 'item', name: 'HP', slot: 'max' });
    expect(readDefaultResetCommand(':HP_MAX_BUFF=既定')).toEqual({ kind: 'item', name: 'HP', slot: 'maxCorrection' });
    expect(readDefaultResetCommand(':HP_MIN_BUFF=既定')).toEqual({ kind: 'item', name: 'HP', slot: 'minCorrection' });
    expect(readDefaultResetCommand(':HP_MAX=既定')).toEqual({ kind: 'item', name: 'HP', slot: 'maxBase' });
    expect(readDefaultResetCommand(':*^=既定')).toEqual({ kind: 'item', name: '*', slot: 'max' });
  });

  it.each([
    ':HP=10',
    ':HP-3',
    ':*+1',
    ':*=3',
    ':*>既定',
    ':*-既定',
    ':HP=既定L',
    ':HP=既定値L',
    ':HP=既定の値',
    ':HP=規定外',
    ':HP=定',
    ':HP={既定}',
    ':HP=既定+1',
    ':HP',
  ])('leaves %s to be read as it always was', (command) => {
    expect(readDefaultResetCommand(command)).toBeNull();
  });
});
