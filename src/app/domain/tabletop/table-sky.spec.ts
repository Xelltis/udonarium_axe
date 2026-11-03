import { GameTable } from '@axe/domain/tabletop/game-table';
import { tableSkyKindOf } from '@axe/domain/tabletop/table-sky';

describe('what a table shows past its board', () => {
  function attributesOf(context: ReturnType<GameTable['toContext']>): Record<string, unknown> {
    return context.syncData['attributes'] as Record<string, unknown>;
  }

  it('shows the table’s background picture for a kind of sky it does not know, sent empty or not at all', () => {
    for (const value of ['', 'aurora', undefined, null, 0]) expect(tableSkyKindOf(value)).toBe('');
    expect(tableSkyKindOf('clock')).toBe('clock');
  });

  it('shows the background picture on a table saved before there was a sky', () => {
    const saved = new GameTable();
    saved.initialize();

    expect(tableSkyKindOf(saved.skyKind)).toBe('');
    saved.destroy();
  });

  it('keeps the sky through the room data, and goes back to the background picture where an older peer sends the table without it', () => {
    const shown = new GameTable();
    shown.initialize();
    shown.skyKind = 'clock';
    expect(shown.toXml()).toContain('skyKind="clock"');

    const older = shown.toContext();
    delete attributesOf(older)['skyKind'];
    older.majorVersion += 1;
    shown.apply(older);

    expect(tableSkyKindOf(shown.skyKind)).toBe('');
    shown.destroy();
  });
});
