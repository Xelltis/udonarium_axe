import {
  gameMasterMobileMenuItems,
  MOBILE_MENU_ITEMS,
  sharedMobileMenuItems,
  visibleMobileMenuItems,
} from '@axe/features/mobile/mobile-shell/mobile-menu-items';

describe('mobileMenuItems', () => {
  it('offers nothing twice', () => {
    const actions = MOBILE_MENU_ITEMS.map((item) => item.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('keeps what belongs to the game master out of the shared items', () => {
    expect(sharedMobileMenuItems().every((item) => !item.gameMasterOnly)).toBe(true);
  });

  it('keeps the game masters items to their own', () => {
    expect(gameMasterMobileMenuItems().every((item) => item.gameMasterOnly === true)).toBe(true);
  });

  it('shows the shared and the game masters items and nothing else', () => {
    const merged = [...sharedMobileMenuItems(), ...gameMasterMobileMenuItems()].map((item) => item.action).sort();
    const visible = visibleMobileMenuItems(true)
      .map((item) => item.action)
      .sort();
    expect(merged).toEqual(visible);
  });

  it('shows a player none of them', () => {
    expect(visibleMobileMenuItems(false)).toEqual(sharedMobileMenuItems());
  });

  it('counts loading a room among the shared items', () => {
    expect(sharedMobileMenuItems().map((item) => item.action)).toContain('zipLoad');
  });

  it('puts the room settings straight after the table they belong with', () => {
    const actions = MOBILE_MENU_ITEMS.map((item) => item.action);
    expect(actions.indexOf('roomSettings')).toBe(actions.indexOf('tableSetting') + 1);
  });
});
