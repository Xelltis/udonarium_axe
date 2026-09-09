import { GameTable } from '@axe/domain/tabletop/game-table';
import { resolveTabletopDisplay } from '@axe/domain/tabletop/tabletop-display';
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
  });

  /**
   * A table carries the style at its default from the moment it is made, so reading the
   * default as an answer would silence every room that spoke under the old switch.
   */
  it('hears the old switch through a style still sitting at its default', () => {
    expect(asTabletopMenuStyle('standard', true)).toBe('radial');
    expect(asTabletopMenuStyle('standard', false)).toBe('standard');
  });
});

describe('a table that answered under the switch the style replaced', () => {
  it('is still heard through a real table, which carries the style at its default', () => {
    const table = new GameTable('old-room-table');
    table.initialize();
    try {
      table.radialMenuEnabled = true;

      expect(table.tabletopMenuStyle).toBe('standard');
      expect(resolveTabletopDisplay(table, {}).tabletopMenuStyle).toBe('radial');
    } finally {
      table.destroy();
    }
  });

  it('is overruled by a screen that has chosen the ordinary menu since', () => {
    const table = new GameTable('old-room-table-chosen');
    table.initialize();
    try {
      table.radialMenuEnabled = true;

      expect(resolveTabletopDisplay(table, { tabletopMenuStyle: 'standard' }).tabletopMenuStyle).toBe('standard');
    } finally {
      table.destroy();
    }
  });
});
