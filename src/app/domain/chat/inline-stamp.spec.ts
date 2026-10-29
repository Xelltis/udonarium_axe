import { decoratedRunsOf } from '@axe/domain/chat/chat-decoration';
import {
  inlineStampsAlone,
  inlineStampSites,
  inlineStampToken,
  withInlineStampsAsWords,
} from '@axe/domain/chat/inline-stamp';
import { resourceCommandSites } from '@axe/domain/data/resource-command-words';

describe('inline stamps', () => {
  it('reads the stamps of a family there is and of a room picture, with their names and places', () => {
    const text = '今日は［了解:seal:ok］また明日［絵:image:0123abcd］';
    expect(inlineStampSites(text)).toEqual([
      { from: 3, to: 3 + '［了解:seal:ok］'.length, label: '了解', id: 'seal:ok' },
      {
        from: text.indexOf('［絵'),
        to: text.length,
        label: '絵',
        id: 'image:0123abcd',
      },
    ]);
  });

  it('reads a room picture known by its address', () => {
    expect(inlineStampSites('［絵:image:https://example.com/a.png?x=1&y=2］').map((site) => site.id)).toEqual([
      'image:https://example.com/a.png?x=1&y=2',
    ]);
  });

  it('leaves alone brackets that name no family there is, and the forms around it', () => {
    for (const text of [
      '［メモ:todo:later］',
      '［了解］',
      '[了解:seal:ok]',
      '［了解:seal:ok',
      '［:seal:ok］',
      '［了解:seal:OK］',
      '［了 解:seal:ok ］',
      '［了 解:seal:ok］',
      '［{了解}:seal:ok］',
      '［了解@:seal:ok］',
      '［**:seal:ok］',
      '［|字《じ》:seal:ok］',
    ]) {
      expect(inlineStampSites(text)).toEqual([]);
    }
  });

  it('writes a stamp as its name and identifier, keeping the name to what the form holds', () => {
    expect(inlineStampToken('了解', 'seal:ok')).toBe('［了解:seal:ok］');
    expect(inlineStampToken(' 斬る:［一閃］\n ', 'battle:slash')).toBe('［斬る一閃:battle:slash］');
    expect(inlineStampToken('  ', 'battle:slash')).toBe('［slash:battle:slash］');
    expect(inlineStampToken('Got  it', 'seal:ok')).toBe('［Got_it:seal:ok］');
    expect(inlineStampToken('{名前}@立ち絵', 'seal:ok')).toBe('［名前立ち絵:seal:ok］');
    expect(inlineStampSites(inlineStampToken('絵  の 名', 'image:abc'))).toEqual([
      { from: 0, to: '［絵_の_名:image:abc］'.length, label: '絵_の_名', id: 'image:abc' },
    ]);
  });

  it('keeps a name from pairing with the decorations and rubies of the line round it', () => {
    const token = inlineStampToken('**大|事《だいじ》**[赤]\\', 'image:abc');
    expect(token).toBe('［大事だいじ赤:image:abc］');

    const runs = decoratedRunsOf(`**hi** ${token}`);
    expect(runs.some((run) => run.text.includes(token))).toBe(true);
  });

  it('never lets a part of a name be read as a command', () => {
    const token = inlineStampToken('Tom &Jerry ：HP-5 t&毒 &&1R-', 'image:abc');
    const words = resourceCommandSites(`よし ${token} 行くぞ`);

    expect(words.buffs).toEqual([]);
    expect(words.resources).toEqual([]);
    expect(words.sweeps).toEqual([]);
  });

  it('reads back what it writes, whatever the name', () => {
    for (const label of ['了解', 'ゴゴゴゴ', 'a:b', '［x］', 'x'.repeat(60), '', '***']) {
      const token = inlineStampToken(label, 'sfx:boom');
      expect(inlineStampSites(`前${token}後`).map((site) => site.id)).toEqual(['sfx:boom']);
    }
  });

  it('reads back a stamp of a picture known by its address, whose name leaves nothing', () => {
    const token = inlineStampToken('***', 'image:https://example.com/a.png');
    expect(inlineStampSites(token).map((site) => site.id)).toEqual(['image:https://example.com/a.png']);
    expect(inlineStampSites(inlineStampToken('', 'image:***')).map((site) => site.id)).toEqual(['image:***']);
  });

  it('keeps its form through what is rewritten as a line is sent', () => {
    const token = inlineStampToken('了解', 'seal:ok');
    const sent = `t:HP-1  ${token}  ok`.replace(/[ \t]{2,}/g, ' ').trim();
    expect(inlineStampSites(sent).map((site) => site.id)).toEqual(['seal:ok']);
  });

  it('writes each stamp as its name in brackets for plain text', () => {
    expect(withInlineStampsAsWords('今日は［了解:seal:ok］また［メモ:todo:later］')).toBe(
      '今日は［了解］また［メモ:todo:later］'
    );
  });

  it('tells a text of stamps alone from one with words in it', () => {
    expect(inlineStampsAlone('［了解:seal:ok］')).toEqual(['seal:ok']);
    expect(inlineStampsAlone(' ［了解:seal:ok］ ［ドッ:sfx:boom］\n')).toEqual(['seal:ok', 'sfx:boom']);
    expect(inlineStampsAlone('了解［了解:seal:ok］')).toBeNull();
    expect(inlineStampsAlone('')).toBeNull();
    expect(inlineStampsAlone('  ')).toBeNull();
  });
});
