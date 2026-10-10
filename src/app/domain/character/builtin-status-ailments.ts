import { StatusAilment } from '@axe/domain/character/status-ailment';

/**
 * The states a room starts with.
 *
 * Twelve states that most tables know under one name or another, chosen to stand as examples of
 * every shape the catalogue can take: one that ticks at the end of a round, one at the start of
 * its bearer's turn and one at the end of it; ones that hold until they are cleared and ones
 * that count themselves out; effects that carry a number to show on the badge and effects that
 * are only a word. They belong to no game in particular, and are meant to be edited.
 *
 * The three that stop a piece acting also stop its feet, by holding `移動` at nought while they
 * are worn. What that comes to is that a piece under one of them is drawn no reach at all, since
 * a reach is read off the sheet. The rest are notes: `鈍足` halves a piece's movement, and half
 * of something is not a thing the three fields can say.
 */
export const DEFAULT_STATUS_AILMENTS: readonly StatusAilment[] = [
  {
    name: '毒',
    color: 'green',
    icon: '☠️',
    rounds: 3,
    timing: 'roundEnd',
    effect: '毎ラウンド HP-2',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '出血',
    color: 'red',
    icon: '🩸',
    rounds: 3,
    timing: 'turnStart',
    effect: '手番開始に HP-3',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '燃焼',
    color: 'orange',
    icon: '🔥',
    rounds: 2,
    timing: 'turnEnd',
    effect: '手番終了に HP-4',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '麻痺',
    color: 'yellow',
    icon: '⚡',
    rounds: 0,
    timing: 'none',
    effect: '行動できない',
    stat: '移動',
    op: '=',
    amount: '0',
  },
  {
    name: '睡眠',
    color: 'blue',
    icon: '💤',
    rounds: 0,
    timing: 'none',
    effect: '行動できない。攻撃を受けると起きる',
    stat: '移動',
    op: '=',
    amount: '0',
  },
  {
    name: '石化',
    color: 'gray',
    icon: '🗿',
    rounds: 0,
    timing: 'none',
    effect: '行動できない。解呪まで続く',
    stat: '移動',
    op: '=',
    amount: '0',
  },
  {
    name: '混乱',
    color: 'purple',
    icon: '💫',
    rounds: 2,
    timing: 'roundEnd',
    effect: '狙う相手を選べない',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '魅了',
    color: 'pink',
    icon: '💗',
    rounds: 3,
    timing: 'roundEnd',
    effect: '術者に逆らえない',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '恐怖',
    color: 'purple',
    icon: '😱',
    rounds: 2,
    timing: 'roundEnd',
    effect: '命中-2',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '暗闇',
    color: 'gray',
    icon: '🌑',
    rounds: 3,
    timing: 'roundEnd',
    effect: '命中-4',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '沈黙',
    color: 'blue',
    icon: '🤐',
    rounds: 3,
    timing: 'roundEnd',
    effect: '呪文を使えない',
    stat: '',
    op: '',
    amount: '',
  },
  {
    name: '鈍足',
    color: 'blue',
    icon: '🐌',
    rounds: 3,
    timing: 'roundEnd',
    effect: '移動が半分になる',
    stat: '',
    op: '',
    amount: '',
  },
];

/**
 * Puts the usual states on the catalogue, for a room that keeps none of its own.
 *
 * A room that has any is left alone, so a table that threw them out and wrote its own is not
 * handed them back.
 */
export function createDefaultStatusAilments(catalog: { ailments: StatusAilment[] }): StatusAilment[] {
  if (catalog.ailments.length > 0) return catalog.ailments;
  catalog.ailments = [...DEFAULT_STATUS_AILMENTS];
  return catalog.ailments;
}

/** What the states are called, in the order a table would want their columns. */
export const DEFAULT_STATUS_AILMENT_NAMES: readonly string[] = DEFAULT_STATUS_AILMENTS.map((ailment) => ailment.name);
