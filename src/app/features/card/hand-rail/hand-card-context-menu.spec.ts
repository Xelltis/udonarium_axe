import type { TranslateFn } from '@axe/application/i18n/translate.token';
import { buildGiveHandCardMenu, buildPlayDroppedCardMenu } from '@axe/features/card/hand-rail/hand-card-context-menu';

const t = ((key: string) => key) as TranslateFn;

describe('the menu of who a hand card goes to', () => {
  it('names each participant and gives to the one picked', () => {
    const give = vi.fn();
    const menu = buildGiveHandCardMenu(
      [
        { userId: 'user-a', name: 'あいて' },
        { userId: 'user-b', name: 'もうひとり' },
      ],
      give
    );

    expect(menu.map((entry) => entry.name)).toEqual(['あいて', 'もうひとり']);
    menu[1].action!();
    expect(give).toHaveBeenCalledWith('user-b');
  });

  it('names somebody with no name by the start of their user id', () => {
    const menu = buildGiveHandCardMenu([{ userId: 'abcdef123456', name: '' }], vi.fn());

    expect(menu[0].name).toBe('abcdef');
  });
});

describe('the menu of how a card dropped from the hand lies', () => {
  it('offers face up, then face down', () => {
    const play = vi.fn();
    const menu = buildPlayDroppedCardMenu(play, t);

    expect(menu.map((entry) => entry.name)).toEqual(['feature.card.hand.playFaceUp', 'feature.card.hand.playFaceDown']);
    menu[0].action!();
    menu[1].action!();
    expect(play.mock.calls).toEqual([[true], [false]]);
  });
});
