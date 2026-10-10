const SUIT_SYMBOLS: Readonly<Record<string, string>> = {
  c: '♣',
  d: '♦',
  h: '♥',
  s: '♠',
};

export type TrumpSuitColor = 'red' | 'black' | 'none';

export interface TrumpCardLabel {
  suit: string;
  rank: string;
  suitColor: TrumpSuitColor;
}

/**
 * Reads a playing-card image name as the suit symbol and rank shown in the card list.
 *
 * A suit letter (`c`, `d`, `h`, `s`) and a two-digit rank from 01 to 13 is a card, with 11 to 13
 * read as Jack, Queen and King; `x01` and `x02` are the two jokers. Hearts and diamonds are red,
 * clubs and spades black. Anything else is null.
 */
export function parseTrumpCardCode(code: string): TrumpCardLabel | null {
  if (code === 'x01') return { suit: '🃏', rank: '1', suitColor: 'none' };
  if (code === 'x02') return { suit: '🃏', rank: '2', suitColor: 'none' };
  const match = /^([cdhs])(\d{2})$/.exec(code);
  if (!match) return null;
  const suit = SUIT_SYMBOLS[match[1]];
  if (!suit) return null;
  const num = parseInt(match[2], 10);
  if (num < 1 || num > 13) return null;
  const rank = num === 11 ? 'Jack' : num === 12 ? 'Queen' : num === 13 ? 'King' : String(num);
  const suitColor: TrumpSuitColor = match[1] === 'h' || match[1] === 'd' ? 'red' : 'black';
  return { suit, rank, suitColor };
}

/**
 * The same playing-card name as one short label such as `♥Queen`, or null when it is not a playing
 * card.
 */
export function formatTrumpCardCode(code: string): string | null {
  const label = parseTrumpCardCode(code);
  return label ? `${label.suit}${label.rank}` : null;
}
