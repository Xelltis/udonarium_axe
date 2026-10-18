/** What the music does when a table is switched to. */
export type TableBgmMode = '' | 'stop' | 'play';

/** What a table asks of the music on being switched to, an unknown value read as leaving it. */
export function tableBgmModeOf(table: { tableBgm: string }): TableBgmMode {
  const mode = String(table.tableBgm ?? '');
  return mode === 'stop' || mode === 'play' ? mode : '';
}
