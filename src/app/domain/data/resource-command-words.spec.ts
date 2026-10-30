import { parseBuffRemovalCommand } from '@axe/domain/character/buff-bulk-removal';
import { hasSecretEditMark, resourceCommandParts, resourceCommandSites } from '@axe/domain/data/resource-command-words';

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

  it('spans each command where it was typed', () => {
    const line = '攻撃 :HP-1:MP-2 &加護/3';
    const words = resourceCommandSites(line);
    expect(words.resources.map((site) => line.slice(site.from, site.to))).toEqual([':HP-1', ':MP-2']);
    expect(words.buffs.map((site) => line.slice(site.from, site.to))).toEqual(['&加護/3']);
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
});
