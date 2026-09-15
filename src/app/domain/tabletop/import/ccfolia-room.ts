import { ImportedCharacter } from '@axe/domain/character/import/imported-character';

export interface ImportedRoomResource {
  fileName: string;
  mime: string;
}

export interface ImportedRoomPanel {
  imageFileName: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  angle: number;
  order: number;
  locked: boolean;
  visible: boolean;
  memo: string;
}

export interface ImportedRoomFace {
  label: string;
  fileName: string;
}

export interface ImportedRoomPiece {
  character: ImportedCharacter;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  active: boolean;
  secret: boolean;
  invisible: boolean;
  hideStatus: boolean;
  owner: string;
  iconFileName: string;
  faces: ImportedRoomFace[];
}

/**
 * A scene. In the other tool a change of scene changes the picture of the board and its size, while the panels and pieces stay.
 */
export interface ImportedRoomScene {
  name: string;
  order: number;
  backgroundFileName: string;
  foregroundFileName: string;
  fieldWidth: number;
  fieldHeight: number;
}

/** How many elements did not come across, so the user can see what the other tool had and this one could not take. */
export interface ImportedRoomSkipped {
  panels: number;
  decks: number;
  effects: number;
}

export interface ImportedRoom {
  version: string;
  fieldWidth: number;
  fieldHeight: number;
  backgroundFileName: string;
  foregroundFileName: string;
  scenes: ImportedRoomScene[];
  panels: ImportedRoomPanel[];
  pieces: ImportedRoomPiece[];
  resources: ImportedRoomResource[];
  skipped: ImportedRoomSkipped;
}

/**
 * A blank imported room with no board size, scenes, panels, pieces or files and nothing skipped
 * yet, for the room parser to fill.
 */
export function createEmptyImportedRoom(): ImportedRoom {
  return {
    version: '',
    fieldWidth: 0,
    fieldHeight: 0,
    backgroundFileName: '',
    foregroundFileName: '',
    scenes: [],
    panels: [],
    pieces: [],
    resources: [],
    skipped: { panels: 0, decks: 0, effects: 0 },
  };
}
