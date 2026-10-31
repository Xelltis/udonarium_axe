import type { SyntaxPart } from '@axe/domain/chat-syntax/chat-syntax';

const PIECES = /(\d+)|(<=|>=|<>|!=|[<>=])|([+\-*/])|([()[\]{}])|([A-Za-z]+)|([@#$])/g;

/**
 * Cuts the first word of a roll into the pieces any game system writes rolls in: numbers, the `d`
 * between them, arithmetic, comparisons, brackets, the letters that name a system's commands, and
 * the `@`, `#` and `$` some systems mark a critical or a fumble with. What none of these covers is
 * left uncut. `from` is where the word stands in the text, so the pieces stand there too.
 */
export function lexDiceCommand(word: string, from: number): SyntaxPart[] {
  const parts: SyntaxPart[] = [];
  for (const piece of word.matchAll(PIECES)) {
    const at = from + piece.index;
    const to = at + piece[0].length;
    if (piece[1]) parts.push({ role: 'number', from: at, to });
    else if (piece[2]) parts.push({ role: 'compare', from: at, to });
    else if (piece[3]) parts.push({ role: 'arith', from: at, to });
    else if (piece[4]) parts.push({ role: 'paren', from: at, to });
    else if (piece[5]) parts.push({ role: /^d$/i.test(piece[5]) ? 'die' : 'word', from: at, to });
    else parts.push({ role: 'operator', from: at, to });
  }
  return parts;
}
