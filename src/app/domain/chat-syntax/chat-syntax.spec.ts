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
