import { GameTable } from '@axe/domain/tabletop/game-table';
import { foregroundFitOf, foregroundOpacityOf, tableForegroundOf } from '@axe/domain/tabletop/table-foreground';

describe('the picture a table lays in front of everything', () => {
  function table(
    fields: Partial<Record<'foregroundImageIdentifier' | 'foregroundOpacity' | 'foregroundFit', unknown>>
  ) {
    return { foregroundImageIdentifier: '', foregroundOpacity: 1, foregroundFit: '', ...fields };
  }

  it('lays none for a table that chose none, or chose the empty picture', () => {
    for (const identifier of ['', '  ', 'imageIdentifier', 'null', undefined, null]) {
      expect(tableForegroundOf(table({ foregroundImageIdentifier: identifier }))).toBeNull();
    }
  });

  it('lays the picture chosen, filling the screen fully opaque unless told otherwise', () => {
    expect(tableForegroundOf(table({ foregroundImageIdentifier: 'mist' }))).toEqual({
      imageIdentifier: 'mist',
      opacity: 1,
      fit: 'cover',
    });
    expect(
      tableForegroundOf(table({ foregroundImageIdentifier: 'frame', foregroundOpacity: 0.4, foregroundFit: 'contain' }))
    ).toEqual({ imageIdentifier: 'frame', opacity: 0.4, fit: 'contain' });
  });

  it('reads an opacity sent empty, or none at all, as fully opaque rather than as nought', () => {
    expect(foregroundOpacityOf('')).toBe(1);
    expect(foregroundOpacityOf(undefined)).toBe(1);
    expect(foregroundOpacityOf(null)).toBe(1);
    expect(foregroundOpacityOf('not a number')).toBe(1);
  });

  it('keeps the opacity between nought and one, and lays nothing wholly clear', () => {
    expect(foregroundOpacityOf(2)).toBe(1);
    expect(foregroundOpacityOf(-1)).toBe(0);
    expect(foregroundOpacityOf('0.3')).toBe(0.3);
    expect(tableForegroundOf(table({ foregroundImageIdentifier: 'mist', foregroundOpacity: 0 }))).toBeNull();
  });

  it('fills the screen for a way of fitting it does not know', () => {
    expect(foregroundFitOf('')).toBe('cover');
    expect(foregroundFitOf('tile')).toBe('cover');
    expect(foregroundFitOf('fill')).toBe('fill');
  });

  describe('on a table', () => {
    function attributesOf(context: ReturnType<GameTable['toContext']>): Record<string, unknown> {
      return context.syncData['attributes'] as Record<string, unknown>;
    }

    it('lays none on a table saved before there was one', () => {
      const saved = new GameTable();
      saved.initialize();

      expect(tableForegroundOf(saved)).toBeNull();
    });

    it('still lays it fully opaque where the opacity and the fit come in empty, as from an older peer', () => {
      const shown = new GameTable();
      shown.initialize();
      shown.foregroundImageIdentifier = 'mist';
      shown.foregroundOpacity = 0.5;
      const older = shown.toContext();
      delete attributesOf(older)['foregroundOpacity'];
      delete attributesOf(older)['foregroundFit'];
      older.majorVersion += 1;

      shown.apply(older);

      expect(tableForegroundOf(shown)).toEqual({ imageIdentifier: 'mist', opacity: 1, fit: 'cover' });
    });

    it('keeps the picture where an older peer sends the table back with everything it was given', () => {
      const shown = new GameTable();
      shown.initialize();
      shown.foregroundImageIdentifier = 'mist';
      const older = shown.toContext();
      attributesOf(older)['name'] = 'renamed by an older peer';
      older.majorVersion += 1;

      shown.apply(older);

      expect(shown.name).toBe('renamed by an older peer');
      expect(tableForegroundOf(shown)?.imageIdentifier).toBe('mist');
    });

    it('goes into the room data under a name the save looks for pictures by', () => {
      const shown = new GameTable();
      shown.initialize();
      shown.foregroundImageIdentifier = 'mist';

      expect(shown.toXml()).toContain('foregroundImageIdentifier="mist"');
    });
  });
});
