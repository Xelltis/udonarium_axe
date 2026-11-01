import { CcfoliaRoomImportSummary } from '@axe/features/ccfolia-room-import/ccfolia-room-import.service';

const PREFIX = 'feature.tabletop.ccfoliaImport.';

export interface RoomImportMessage {
  key: string;
  params: Record<string, unknown>;
}

/**
 * Turns the result of an import into the system messages that go to the chat.
 * Each kind of missing element gets a line, so the numbers show what did not arrive.
 */
export function buildRoomImportMessages(summary: CcfoliaRoomImportSummary): RoomImportMessage[] {
  const messages: RoomImportMessage[] = [
    {
      key: `${PREFIX}imported`,
      params: {
        table: summary.tableName,
        tables: summary.tableCount,
        panels: summary.panelCount,
        pieces: summary.pieceCount,
      },
    },
  ];

  if (summary.sceneCount > 0) {
    messages.push({ key: `${PREFIX}importedScenes`, params: { count: summary.sceneCount } });
  }
  if (summary.hiddenPanelCount > 0) {
    messages.push({ key: `${PREFIX}hiddenPanels`, params: { count: summary.hiddenPanelCount } });
  }
  if (summary.missingImageCount > 0) {
    messages.push({ key: `${PREFIX}missingImages`, params: { count: summary.missingImageCount } });
  }
  if (summary.skipped.panels > 0) {
    messages.push({ key: `${PREFIX}skippedPanels`, params: { count: summary.skipped.panels } });
  }
  if (summary.skipped.decks > 0) {
    messages.push({ key: `${PREFIX}skippedDecks`, params: { count: summary.skipped.decks } });
  }
  if (summary.skipped.effects > 0) {
    messages.push({ key: `${PREFIX}skippedEffects`, params: { count: summary.skipped.effects } });
  }

  messages.push({ key: `${PREFIX}bgmNotice`, params: {} });
  return messages;
}
