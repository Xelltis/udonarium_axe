import { type ChatSyntaxScan, scanChatSyntax, type SyntaxKind } from '@axe/domain/chat-syntax/chat-syntax';
import { lexDiceCommand } from '@axe/domain/chat-syntax/dice-command-lexer';

/** Each span of a kind as the text it covers. */
function textsOf(scan: ChatSyntaxScan, kind: SyntaxKind): string[] {
  return scan.spans.filter((span) => span.kind === kind).map((span) => scan.text.slice(span.from, span.to));
}

/** The pieces an editor would hide, as the text they cover. */
function markersOf(scan: ChatSyntaxScan, kind: SyntaxKind): string[] {
  return scan.spans
    .filter((span) => span.kind === kind)
    .flatMap((span) => span.parts.filter((part) => part.role === 'marker'))
    .map((part) => scan.text.slice(part.from, part.to));
}

describe('scanChatSyntax', () => {
  describe('a round command', () => {
    it('reads one that opens the message, and the rest as a message of its own', () => {
      const scan = scanChatSyntax('&T 2d6+5 命中判定 &加護/防御+1/3');

      expect(textsOf(scan, 'turn')).toEqual(['&T']);
      expect(markersOf(scan, 'turn')).toEqual(['&']);
      expect(scan.spans.find((span) => span.kind === 'turn')).toEqual(expect.objectContaining({ command: 'take' }));
      expect(textsOf(scan, 'roll')).toEqual(['2d6+5']);
      expect(textsOf(scan, 'buff')).toEqual(['&加護/防御+1/3']);
      const roll = scan.spans.find((span) => span.kind === 'roll');
      expect(roll?.kind === 'roll' && scan.text.slice(roll.message.from, roll.message.to)).toBe(
        '2d6+5 命中判定 &加護/防御+1/3'
      );
    });

    it('reads none in the middle of a message, where the word is a buff', () => {
      const scan = scanChatSyntax('攻撃 &T');

      expect(textsOf(scan, 'turn')).toEqual([]);
      expect(textsOf(scan, 'buff')).toEqual(['&T']);
    });

    it('leaves a buff named as a command is a buff', () => {
      expect(textsOf(scanChatSyntax('&RS/効果/3'), 'turn')).toEqual([]);
      expect(textsOf(scanChatSyntax('&RS/効果/3'), 'buff')).toEqual(['&RS/効果/3']);
      expect(textsOf(scanChatSyntax('&RS-'), 'buff')).toEqual(['&RS-']);
      expect(textsOf(scanChatSyntax('&TEAM'), 'turn')).toEqual([]);
    });

    it('reads one at the start of each line of a palette', () => {
      const scan = scanChatSyntax('&手番 2d6\n攻撃\n&RN', 'palette');

      expect(textsOf(scan, 'turn')).toEqual(['&手番', '&RN']);
      expect(textsOf(scan, 'roll')).toEqual(['2d6']);
    });

    it('reads no second command in what follows the first', () => {
      const scan = scanChatSyntax('&T &TE');

      expect(textsOf(scan, 'turn')).toEqual(['&T']);
      expect(textsOf(scan, 'buff')).toEqual([]);
    });
  });

  it('reads a roll that starts a message, with its repeat count', () => {
    const scan = scanChatSyntax('3 2d6+{筋力} 攻撃');
    expect(textsOf(scan, 'repeat')).toEqual(['3']);
    expect(textsOf(scan, 'roll')).toEqual(['2d6+{筋力}']);
    expect(textsOf(scan, 'reference')).toEqual(['{筋力}']);
  });

  it('reads a stamp put inside the line, with its name and identifier', () => {
    const scan = scanChatSyntax('了解［了解:seal:ok］です');
    expect(textsOf(scan, 'stamp')).toEqual(['［了解:seal:ok］']);
    expect(scan.spans.find((span) => span.kind === 'stamp')).toEqual(
      expect.objectContaining({ id: 'seal:ok', label: '了解' })
    );
    expect(markersOf(scan, 'stamp')).toEqual(['［', '］']);
  });

  it('reads a roll that a stamp put right after it ends, as a space would', () => {
    const scan = scanChatSyntax('2d6［笑:seal:ok］攻撃');
    expect(textsOf(scan, 'roll')).toEqual(['2d6']);
    expect(textsOf(scan, 'stamp')).toEqual(['［笑:seal:ok］']);
  });

  it('counts in the secret s of a command after a stamp, which ends a word as a space does', () => {
    const scan = scanChatSyntax('［にこ:sfx:smile］s:HP-5');
    expect(textsOf(scan, 'resource')).toEqual(['s:HP-5']);
  });

  it('reads a reference with a space inside its braces as part of the roll, as it is rolled', () => {
    expect(textsOf(scanChatSyntax('2d6+{攻撃 力} 攻撃'), 'roll')).toEqual(['2d6+{攻撃 力}']);
  });

  it('reads no roll from words of chat', () => {
    expect(textsOf(scanChatSyntax('1日目は休み'), 'roll')).toEqual([]);
    expect(textsOf(scanChatSyntax('こんにちは 2d6'), 'roll')).toEqual([]);
  });

  it('reads resource and buff commands, the secret s with them', () => {
    const scan = scanChatSyntax('攻撃 s:HP-1d6 t&加護/防御+2/3 &&毒-');
    expect(textsOf(scan, 'resource')).toEqual(['s:HP-1d6']);
    expect(markersOf(scan, 'resource')).toEqual(['s:']);
    expect(textsOf(scan, 'buff')).toEqual(['t&加護/防御+2/3']);
    expect(markersOf(scan, 'buff')).toEqual(['t&', '/', '/']);
    expect(textsOf(scan, 'sweep')).toEqual(['&&毒-']);
  });

  it('reads a sweep with the s that keeps it secret, in either case', () => {
    const scan = scanChatSyntax('s&&毒- S&&呪い-');
    expect(textsOf(scan, 'sweep')).toEqual(['s&&毒-', 'S&&呪い-']);
    expect(markersOf(scan, 'sweep')).toEqual(['s&&', 'S&&']);
  });

  describe('a reset', () => {
    const resetsOf = (scan: ChatSyntaxScan) =>
      scan.spans.flatMap((span) =>
        span.kind === 'reset'
          ? [[scan.text.slice(span.from, span.to), span.reach, span.takes, span.targeted] as const]
          : []
      );

    it('reads the commands that clear buffs whatever their names, of a piece or of the table', () => {
      const scan = scanChatSyntax('終了 &*- t&*デバフ- ＆＊バフ－ s&*debuff- &&*- S&&*バフ-');

      expect(resetsOf(scan)).toEqual([
        ['&*-', 'piece', 'buffs', false],
        ['t&*デバフ-', 'piece', 'buffs', true],
        ['＆＊バフ－', 'piece', 'buffs', false],
        ['s&*debuff-', 'piece', 'buffs', false],
        ['&&*-', 'table', 'buffs', false],
        ['S&&*バフ-', 'table', 'buffs', false],
      ]);
      expect(textsOf(scan, 'buff')).toEqual([]);
      expect(textsOf(scan, 'sweep')).toEqual([]);
      expect(markersOf(scan, 'reset')).toEqual(['&', 't&', '＆', 's&', '&&', 'S&&']);
    });

    it('reads the commands that put values back, and the one word that does both', () => {
      const scan = scanChatSyntax(':*=既定 t:HP^=default s:命中=既定 &リセット- t&reset- &&リセット-');

      expect(resetsOf(scan)).toEqual([
        [':*=既定', 'piece', 'values', false],
        ['t:HP^=default', 'piece', 'values', true],
        ['s:命中=既定', 'piece', 'values', false],
        ['&リセット-', 'piece', 'both', false],
        ['t&reset-', 'piece', 'both', true],
        ['&&リセット-', 'table', 'both', false],
      ]);
      expect(textsOf(scan, 'resource')).toEqual([]);
    });

    it('places the name, operator and word of one that puts a value back as those of a resource command', () => {
      const scan = scanChatSyntax('t:HP^=既定');
      const [span] = scan.spans.filter((each) => each.kind === 'reset');

      expect(span.parts.map((part) => [part.role, scan.text.slice(part.from, part.to)])).toEqual([
        ['marker', 't:'],
        ['name', 'HP^'],
        ['operator', '='],
        ['amount', '既定'],
      ]);
    });

    it('leaves every word written before as the kind it was', () => {
      const scan = scanChatSyntax(
        '攻撃 &D &R- &加護- &*毒- &リセット/3 :HP=10 :*+1 :HP=既定L &&none- &&2R- &&毒- &&*毒-'
      );

      expect(resetsOf(scan)).toEqual([]);
      expect(textsOf(scan, 'buff')).toEqual(['&D', '&R-', '&加護-', '&*毒-', '&リセット/3']);
      expect(textsOf(scan, 'resource')).toEqual([':HP=10', ':*+1', ':HP=既定L']);
      expect(textsOf(scan, 'sweep')).toEqual(['&&none-', '&&2R-', '&&毒-', '&&*毒-']);
      expect(textsOf(scanChatSyntax('&T &*-'), 'turn')).toEqual(['&T']);
    });

    it('takes the star of a clearing for no decoration, and reads a decoration beside it as before', () => {
      expect(textsOf(scanChatSyntax('&*- と &*バフ- と &&*-'), 'decoration')).toEqual([]);

      const scan = scanChatSyntax('**強く** &*-');
      expect(textsOf(scan, 'decoration')).toEqual(['**', '**']);
      expect(scan.decorations.map((run) => scan.text.slice(run.from, run.to))).toEqual(['強く']);
      expect(textsOf(scan, 'reset')).toEqual(['&*-']);
    });
  });

  it('places the name, operator and amount of a resource command', () => {
    const scan = scanChatSyntax(':HP-[k10]');
    const [span] = scan.spans.filter((each) => each.kind === 'resource');
    expect(span.parts.map((part) => [part.role, scan.text.slice(part.from, part.to)])).toEqual([
      ['marker', ':'],
      ['name', 'HP'],
      ['operator', '-'],
      ['amount', '[k10]'],
      ['paren', '['],
      ['paren', ']'],
    ]);
  });

  it('reads a portrait command, and the last word as a cut-in, the command itself when nothing follows it', () => {
    const scan = scanChatSyntax('行くぞ 爆発 @笑顔');
    expect(textsOf(scan, 'portrait')).toEqual(['@笑顔']);
    expect(textsOf(scan, 'cutIn')).toEqual(['@笑顔']);
    expect(textsOf(scanChatSyntax('行くぞ 爆発'), 'cutIn')).toEqual(['爆発']);
  });

  it('reads effect tokens, counting effects apart from the battle stage', () => {
    const scan = scanChatSyntax('《vs》《爆炎》《雷》');
    expect(
      scan.spans.filter((span) => span.kind === 'effect').map((span) => span.kind === 'effect' && span.order)
    ).toEqual([-1, 0, 1]);
    expect(markersOf(scan, 'effect')).toEqual(['《', '》', '《', '》', '《', '》']);
  });

  it('reads the dice token, rubies, quotes and the staging bracket', () => {
    const scan = scanChatSyntax('>|漢字《かんじ》 dice:ゴブリン 〔叫び〕');
    expect(textsOf(scan, 'quote')).toEqual([scan.text]);
    expect(textsOf(scan, 'ruby')).toEqual(['|漢字《かんじ》']);
    expect(markersOf(scan, 'ruby')).toEqual(['|', '《', '》']);
    expect(textsOf(scan, 'diceToken')).toEqual(['dice:ゴブリン']);
    expect(textsOf(scan, 'vnSuffix')).toEqual(['〔叫び〕']);
  });

  it('reads decoration marks, and hides only those that take effect', () => {
    const scan = scanChatSyntax('**強く** [赤]と**');
    expect(textsOf(scan, 'decoration')).toEqual(['**', '**', '[赤]', '**']);
    expect(markersOf(scan, 'decoration')).toEqual(['**', '**']);
    expect(scan.decorations.map((run) => scan.text.slice(run.from, run.to))).toEqual(['強く']);
  });

  it('reads each line of a palette as a message of its own', () => {
    const text = '//攻撃=2d6\n◆◆戦闘\n{攻撃} 殴る\n\n:HP-1';
    const scan = scanChatSyntax(text, 'palette');
    expect(textsOf(scan, 'paletteVariable')).toEqual(['//攻撃=2d6']);
    expect(textsOf(scan, 'paletteTab')).toEqual(['◆◆戦闘']);
    expect(scan.messages.map((message) => text.slice(message.from, message.to))).toEqual(['{攻撃} 殴る', ':HP-1']);
    expect(textsOf(scan, 'resource')).toEqual([':HP-1']);
  });

  it('puts the spans in the order they start', () => {
    const scan = scanChatSyntax('2d6 :HP-1 《爆炎》 **a**');
    const starts = scan.spans.map((span) => span.from);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('lexDiceCommand', () => {
  it('cuts a roll into the pieces any system writes rolls in', () => {
    const word = 'CC(2d6+3)<=50@9';
    expect(lexDiceCommand(word, 10).map((part) => [part.role, word.slice(part.from - 10, part.to - 10)])).toEqual([
      ['word', 'CC'],
      ['paren', '('],
      ['number', '2'],
      ['die', 'd'],
      ['number', '6'],
      ['arith', '+'],
      ['number', '3'],
      ['paren', ')'],
      ['compare', '<='],
      ['number', '50'],
      ['operator', '@'],
      ['number', '9'],
    ]);
  });
});
