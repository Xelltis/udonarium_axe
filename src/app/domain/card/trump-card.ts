import { Card } from '@axe/domain/card/card';

export const JOKER_RANK = 'joker';

export type TrumpRank = number | typeof JOKER_RANK;

const TRUMP_CODE_PATTERN = /(?:^|\/)([cdhsx])(\d{2})\.[a-z]+$/i;

/**
 * The playing-card code read from the card's front image file name, such as `h01` or `x00`.
 *
 * Works only for the bundled trump deck whose images are named suit letter plus two digits; any other card
 * gives null.
 */
export function trumpCodeOf(card: Card): string | null {
  const source = frontImageSourceOf(card);
  const matched = TRUMP_CODE_PATTERN.exec(source);
  if (!matched) return null;
  return matched[1].toLowerCase() + matched[2];
}

function frontImageSourceOf(card: Card): string {
  const element = card.imageDataElement?.getFirstElementByName('front');
  const identifier = typeof element?.value === 'string' ? element.value : '';
  return identifier.length > 0 ? identifier : (card.frontImage?.url ?? '');
}

/** The playing-card rank (1 to 13, or joker) of a trump card, or null when the card is not one. */
export function trumpRankOf(card: Card): TrumpRank | null {
  const code = trumpCodeOf(card);
  if (!code) return null;
  if (code.startsWith('x')) return JOKER_RANK;
  const rank = Number(code.slice(1));
  return rank >= 1 && rank <= 13 ? rank : null;
}

/** Whether the card is a joker from the trump deck. */
export function isJoker(card: Card): boolean {
  return trumpRankOf(card) === JOKER_RANK;
}

/**
 * Groups cards of the same rank into pairs, as discarded in games like Old Maid.
 *
 * Suits are ignored and jokers never pair. A rank held three times yields one pair and leaves the third
 * card out.
 */
export function findTrumpPairs(cards: readonly Card[]): Card[][] {
  const byRank = new Map<number, Card[]>();
  for (const card of cards) {
    const rank = trumpRankOf(card);
    if (typeof rank !== 'number') continue;
    const bucket = byRank.get(rank);
    if (bucket) bucket.push(card);
    else byRank.set(rank, [card]);
  }

  const pairs: Card[][] = [];
  for (const bucket of byRank.values()) {
    for (let i = 0; i + 1 < bucket.length; i += 2) {
      pairs.push([bucket[i], bucket[i + 1]]);
    }
  }
  return pairs;
}

/** The jokers beyond the first `keepCount`, which a game setup removes from the deck before dealing. */
export function selectExtraJokers(cards: readonly Card[], keepCount = 1): Card[] {
  const jokers = cards.filter((card) => isJoker(card));
  return jokers.slice(Math.max(0, keepCount));
}
