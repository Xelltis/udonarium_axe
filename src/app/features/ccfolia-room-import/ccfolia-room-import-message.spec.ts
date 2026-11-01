import { CcfoliaRoomImportSummary } from '@axe/features/ccfolia-room-import/ccfolia-room-import.service';
import { buildRoomImportMessages } from '@axe/features/ccfolia-room-import/ccfolia-room-import-message';

function summaryOf(overrides: Partial<CcfoliaRoomImportSummary> = {}): CcfoliaRoomImportSummary {
  return {
    tableName: '戦闘シート',
    tableCount: 14,
    sceneCount: 0,
    panelCount: 3,
    pieceCount: 2,
    hiddenPanelCount: 0,
    missingImageCount: 0,
    skipped: { panels: 0, decks: 0, effects: 0 },
    ...overrides,
  };
}

describe('buildRoomImportMessages', () => {
  it('reports what came in, with a note about the music', () => {
    expect(buildRoomImportMessages(summaryOf())).toEqual([
      {
        key: 'feature.tabletop.ccfoliaImport.imported',
        params: { table: '戦闘シート', tables: 14, panels: 3, pieces: 2 },
      },
      { key: 'feature.tabletop.ccfoliaImport.bgmNotice', params: {} },
    ]);
  });

  it('says how many scenes it made, where it made the scenes as scenes', () => {
    const messages = buildRoomImportMessages(summaryOf({ tableCount: 1, sceneCount: 3 }));

    expect(messages[1]).toEqual({ key: 'feature.tabletop.ccfoliaImport.importedScenes', params: { count: 3 } });
  });

  it('gives each kind of missing element a line of its own', () => {
    const messages = buildRoomImportMessages(
      summaryOf({
        hiddenPanelCount: 1,
        missingImageCount: 2,
        skipped: { panels: 3, decks: 4, effects: 5 },
      })
    );

    expect(messages.map((message) => message.key)).toEqual([
      'feature.tabletop.ccfoliaImport.imported',
      'feature.tabletop.ccfoliaImport.hiddenPanels',
      'feature.tabletop.ccfoliaImport.missingImages',
      'feature.tabletop.ccfoliaImport.skippedPanels',
      'feature.tabletop.ccfoliaImport.skippedDecks',
      'feature.tabletop.ccfoliaImport.skippedEffects',
      'feature.tabletop.ccfoliaImport.bgmNotice',
    ]);
    expect(messages[1].params).toEqual({ count: 1 });
    expect(messages[5].params).toEqual({ count: 5 });
  });

  it('leaves out the kinds that lost nothing', () => {
    const keys = buildRoomImportMessages(summaryOf({ skipped: { panels: 0, decks: 2, effects: 0 } })).map(
      (message) => message.key
    );

    expect(keys).toEqual([
      'feature.tabletop.ccfoliaImport.imported',
      'feature.tabletop.ccfoliaImport.skippedDecks',
      'feature.tabletop.ccfoliaImport.bgmNotice',
    ]);
  });
});
