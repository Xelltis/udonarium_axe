/** A piece by its name, which may be kept from those who may not see what is kept back. */
export interface NamedPiece {
  readonly name: string;
  readonly hideName?: boolean;
  /** The user the piece belongs to, who knows its name; empty or absent for nobody. */
  readonly owner?: string;
}

/**
 * What a piece whose name is hidden is named by in a line said to the room: marks alone, read the
 * same in every language the line is read in.
 */
export const SAID_HIDDEN_NAME = '？？？';

/**
 * The name a piece goes by for a reader: its own, or `hiddenLabel` where its name is hidden and the
 * reader may not see what is kept back.
 */
export function shownNameOf(piece: NamedPiece, seesHidden: boolean, hiddenLabel: string): string {
  return piece.hideName && !seesHidden ? hiddenLabel : piece.name;
}

/**
 * The name a piece is named by in a line said to the room, which everyone reads whoever says it: its
 * own, or {@link SAID_HIDDEN_NAME} where its name is hidden.
 */
export function saidNameOf(piece: NamedPiece): string {
  return shownNameOf(piece, false, SAID_HIDDEN_NAME);
}
