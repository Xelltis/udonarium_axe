import {
  asTabletopMenuStyle,
  DEFAULT_TABLETOP_MENU_STYLE,
  TABLETOP_MENU_STYLES,
} from '@axe/domain/tabletop/tabletop-menu-style';

describe('asTabletopMenuStyle()', () => {
  it('offers the ordinary menu until a screen asks for another', () => {
    expect(DEFAULT_TABLETOP_MENU_STYLE).toBe('standard');
    expect(asTabletopMenuStyle(undefined)).toBe('standard');
    expect(asTabletopMenuStyle('')).toBe('standard');
    expect(asTabletopMenuStyle('nonsense')).toBe('standard');
  });

  it('takes every style it knows', () => {
    for (const style of TABLETOP_MENU_STYLES) expect(asTabletopMenuStyle(style)).toBe(style);
  });

  it('reads a room that had the turning menu switched on as asking for it', () => {
    expect(asTabletopMenuStyle(undefined, true)).toBe('radial');
    expect(asTabletopMenuStyle(undefined, 'true')).toBe('radial');
  });

  it('leaves a room that never turned it on with the ordinary menu', () => {
    expect(asTabletopMenuStyle(undefined, false)).toBe('standard');
    expect(asTabletopMenuStyle(undefined, 'false')).toBe('standard');
    expect(asTabletopMenuStyle(undefined, '')).toBe('standard');
  });

  it('lets a style that was chosen outrank the switch it replaced', () => {
    expect(asTabletopMenuStyle('four-way', true)).toBe('four-way');
    expect(asTabletopMenuStyle('standard', true)).toBe('standard');
  });
});
