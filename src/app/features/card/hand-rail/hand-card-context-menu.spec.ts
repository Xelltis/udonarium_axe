import { buildGiveHandCardMenu } from '@axe/features/card/hand-rail/hand-card-context-menu';

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
