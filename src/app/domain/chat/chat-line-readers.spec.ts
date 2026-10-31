import { seededRandom } from '@axe/core/util/seeded-random';
import { textTargetsCharacter } from '@axe/domain/chat/chat-palette';
import { portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import { referenceSites } from '@axe/domain/chat/chat-reference';
import { inlineStampSites, withInlineStampsAsSpaces } from '@axe/domain/chat/inline-stamp';
import { scanChatSyntax } from '@axe/domain/chat-syntax/chat-syntax';
import { hasSecretEditMark, resourceCommandSites } from '@axe/domain/data/resource-command-words';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { diceChatTokenSite } from '@axe/domain/dice/dice-chat-token';
import { readRollLine, rollableText } from '@axe/domain/dice/dice-roll-line';
import { effectTokenSites } from '@axe/domain/effect/effect-chat-token';
import { readCutInChatTail } from '@axe/domain/media/cut-in-chat-tail';

const WORDS = [
  'hello',
  'あ',
  ':HP-1',
  ':HP+2',
  ':HP=3',
  't:HP-2',
  's:HP-1',
  'S:HP-1',
  'st:HP-1',
  'sT:HP-1',
  'ｓ：ＨＰ－１',
  'ｔ：ＨＰ－２',
  ':HP-1:MP-2',
  't:HP-1:MP-2',
  '&毒/3',
  't&毒/3',
  's&毒/3',
  'st&毒/3',
  's&毒-',
  's&R-',
  's&D',
  's&!',
  'ｓ＆毒／３',
  '&毒-',
  '&&毒-',
  's&&毒-',
  'S&&毒-',
  't&&毒-',
  'S&W',
  's&p',
  '12:30',
  ':)',
  ':',
  '&',
  'has:HP-1',
  '{HP}',
  't{HP}',
  '@face',
  '@hide',
  '《fire》',
  '2d6',
  's2d6',
  'dice:',
  '**',
  '［了解:seal:ok］',
  '［絵:image:abc123］',
];

const GAPS = [' ', ' ', ' ', '', '　', '  '];

const isStamp = (word: string) => inlineStampSites(word).length > 0;

/**
 * Lines made of the words above, the same each run. Two words go with no gap between them only
 * where one is a stamp, as one is put in at the caret; two commands run together are read as the
 * chat has always read them, which these lines leave alone.
 */
function linesAtRandom(seed: number, count: number): string[] {
  const next = seededRandom(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  return Array.from({ length: count }, () => {
    const length = 1 + Math.floor(next() * 6);
    let line = pick(WORDS);
    let last = line;
    for (let index = 1; index < length; index++) {
      const word = pick(WORDS);
      const gap = pick(GAPS);
      line += (gap === '' && !isStamp(last) && !isStamp(word) ? ' ' : gap) + word;
      last = word;
    }
    return line;
  });
}

/** A line with the stamps it ends with taken off, as the cut-in read from its last word passes them over. */
function withoutEndingStamps(line: string): string {
  let end = line.length;
  for (const site of inlineStampSites(line).reverse()) if (site.to === end) end = site.from;
  return line.slice(0, end);
}

const LINES = linesAtRandom(20261030, 4000);

describe('what reads the commands of a chat line', () => {
  const spaced = withInlineStampsAsSpaces;
  const readers: Record<string, { read: (text: string) => unknown; same?: (text: string) => string }> = {
    resourceCommandSites: { read: resourceCommandSites },
    hasSecretEditMark: { read: hasSecretEditMark },
    textTargetsCharacter: { read: textTargetsCharacter },
    portraitCommandSite: { read: portraitCommandSite },
    readCutInChatTail: { read: readCutInChatTail, same: (text) => spaced(withoutEndingStamps(text)) },
    diceChatTokenSite: { read: diceChatTokenSite },
    effectTokenSites: { read: effectTokenSites },
    referenceSites: { read: referenceSites },
    readRollLine: { read: (text) => readRollLine(rollableText(text)) },
    scanChatSyntax: { read: (text) => scanChatSyntax(text).spans.filter((span) => !/stamp|cutIn/.test(span.kind)) },
    scanPaletteSyntax: {
      read: (text) => scanChatSyntax(text, 'palette').spans.filter((span) => !/stamp|cutIn/.test(span.kind)),
    },
    deleteMyselfResourceBuff: { read: (text) => spaced(DiceBot.deleteMyselfResourceBuff(text)) },
  };

  for (const [name, { read, same = spaced }] of Object.entries(readers)) {
    it(`${name} reads a stamp inside a line as the spaces it stands over`, () => {
      const differing = LINES.filter((line) => isStamp(line)).filter(
        (line) => JSON.stringify(read(line)) !== JSON.stringify(read(same(line)))
      );
      expect(differing.slice(0, 5)).toEqual([]);
    });
  }

  describe('a line copied for a second target', () => {
    const commandsOf = (text: string, aimedOnly: boolean) => {
      const words = resourceCommandSites(text);
      const aimed = (command: string) => !aimedOnly || command.startsWith('t');
      return {
        resources: words.resources.map((site) => site.command).filter(aimed),
        buffs: words.buffs.map((site) => site.command).filter(aimed),
        sweeps: words.sweeps.map((site) => site.command).filter(aimed),
      };
    };

    it('keeps the commands aimed at targets alone, as they are read from the line', () => {
      const differing = LINES.filter(
        (line) =>
          JSON.stringify(commandsOf(DiceBot.deleteMyselfResourceBuff(line), false)) !==
          JSON.stringify(commandsOf(line, true))
      );
      expect(
        differing.slice(0, 8).map((line) => ({
          line,
          copy: DiceBot.deleteMyselfResourceBuff(line),
          read: commandsOf(DiceBot.deleteMyselfResourceBuff(line), false),
        }))
      ).toEqual([]);
    });

    it('keeps every word that is no command', () => {
      const rest = (text: string) => {
        const words = resourceCommandSites(text);
        let kept = text;
        for (const site of [...words.resources, ...words.buffs, ...words.sweeps].sort((a, b) => b.from - a.from)) {
          const from = /[sSｓＳ]/.test(text[site.from - 1] ?? '') ? site.from - 1 : site.from;
          kept = kept.slice(0, from) + ' ' + kept.slice(site.to);
        }
        return withInlineStampsAsSpaces(kept).split(/\s+/).filter(Boolean);
      };
      const differing = LINES.filter(
        (line) => JSON.stringify(rest(DiceBot.deleteMyselfResourceBuff(line))) !== JSON.stringify(rest(line))
      );
      expect(differing.slice(0, 8).map((line) => ({ line, copy: DiceBot.deleteMyselfResourceBuff(line) }))).toEqual([]);
    });
  });
});
