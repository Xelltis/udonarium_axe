import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ArchiveEntries, CCFOLIA_ROOM_DATA_ENTRY } from '@axe/core/storage/room-archive';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ImportedCharacterFactory } from '@axe/domain/character/import/imported-character-factory';
import { DataElement } from '@axe/domain/data/data-element';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { ImageTag } from '@axe/domain/media/image-tag';
import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  ImportedRoom,
  ImportedRoomPanel,
  ImportedRoomPiece,
  ImportedRoomScene,
  ImportedRoomSkipped,
} from '@axe/domain/tabletop/import/ccfolia-room';
import {
  pieceUnitToTablePosition,
  resolveFieldSize,
  roomCellToTablePosition,
  RoomGridGeometry,
} from '@axe/domain/tabletop/import/ccfolia-room-layout';
import { parseCcfoliaRoom } from '@axe/domain/tabletop/import/ccfolia-room-parser';
import { Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';

const IMAGE_TAG = 'ココフォリア';
const DEFAULT_GRID_SIZE = 50;

/** Thickness in cells given to one step of the source's z, so stacked panels do not fight for the same depth. */
const PANEL_THICKNESS = 0.02;

export type CcfoliaRoomImportError = 'unrecognized' | 'failed';

export interface CcfoliaRoomImportSummary {
  tableName: string;
  tableCount: number;
  panelCount: number;
  pieceCount: number;
  hiddenPanelCount: number;
  missingImageCount: number;
  skipped: ImportedRoomSkipped;
}

export interface CcfoliaRoomImportResult {
  summary: CcfoliaRoomImportSummary | null;
  error: CcfoliaRoomImportError | null;
}

/**
 * Takes a room archive from another tool and builds tables from it.
 * Each scene becomes one table, and the panels are copied onto every one: there, panels and
 * pieces survive a scene change, whereas terrain here belongs to its table.
 * Parsing belongs to the domain; this service registers images, builds objects and switches tables.
 */
@Injectable({ providedIn: 'root' })
export class CcfoliaRoomImportService {
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Builds tables from the files of a room archive, one for each scene, registering its images
   * first.
   *
   * Answers a summary of what was made, or `unrecognized` when the files are not such an archive
   * and `failed` when building them went wrong.
   */
  async importAsync(entries: ArchiveEntries): Promise<CcfoliaRoomImportResult> {
    const room = parseRoomData(entries);
    if (!room) return { summary: null, error: 'unrecognized' };

    try {
      const images = await this.registerImages(room, entries);
      return { summary: this.build(room, images), error: null };
    } catch {
      return { summary: null, error: 'failed' };
    }
  }

  private async registerImages(room: ImportedRoom, entries: ArchiveEntries): Promise<Map<string, string>> {
    const images = new Map<string, string>();
    for (const resource of room.resources) {
      const bytes = entries[resource.fileName];
      if (!bytes) continue;
      const imageFile = await this.imageStorage.addAsync(new Blob([bytes.slice()], { type: resource.mime }));
      ImageTag.create(imageFile.identifier).tag = IMAGE_TAG;
      images.set(resource.fileName, imageFile.identifier);
    }
    return images;
  }

  private build(room: ImportedRoom, images: Map<string, string>): CcfoliaRoomImportSummary {
    const field = resolveFieldSize(room.fieldWidth, room.fieldHeight);
    const geometry: RoomGridGeometry = {
      fieldWidth: field.width,
      fieldHeight: field.height,
      gridSize: DEFAULT_GRID_SIZE,
    };

    const visiblePanels = room.panels.filter((panel) => panel.visible);
    const usablePanels = visiblePanels.filter((panel) => images.has(panel.imageFileName));

    const scenes = room.scenes.length > 0 ? room.scenes : [sceneOfRoom(room)];
    const tables = scenes.map((scene) => this.createTable(scene, room, images, geometry, usablePanels));
    const selected = scenes.findIndex((scene) => scene.foregroundFileName === room.foregroundFileName);
    emitSelectGameTable({ identifier: tables[Math.max(selected, 0)].identifier });

    let missingImageCount = visiblePanels.length - usablePanels.length;
    for (const piece of room.pieces) {
      const iconIdentifier = images.get(piece.iconFileName) ?? '';
      if (piece.iconFileName !== '' && iconIdentifier === '') missingImageCount++;
      createPieceCharacter(piece, iconIdentifier, images, geometry);
    }

    return {
      tableName: tables[Math.max(selected, 0)].name,
      tableCount: tables.length,
      panelCount: usablePanels.length,
      pieceCount: room.pieces.length,
      hiddenPanelCount: room.panels.length - visiblePanels.length,
      missingImageCount,
      skipped: room.skipped,
    };
  }

  /**
   * One table per scene. The foreground there is the board itself, so it becomes the table image,
   * and the background, which lies outside the board, becomes the wallpaper.
   */
  private createTable(
    scene: ImportedRoomScene,
    room: ImportedRoom,
    images: Map<string, string>,
    geometry: RoomGridGeometry,
    panels: ImportedRoomPanel[]
  ): GameTable {
    const table = new GameTable();
    table.name = scene.name === '' ? this.t('feature.tabletop.ccfoliaImport.tableName') : scene.name;
    table.width = geometry.fieldWidth;
    table.height = geometry.fieldHeight;
    table.gridSize = geometry.gridSize;
    table.imageIdentifier = images.get(scene.foregroundFileName) ?? '';
    table.backgroundImageIdentifier = images.get(scene.backgroundFileName) ?? images.get(room.backgroundFileName) ?? '';
    table.gridShow = false;
    table.initialize();

    for (const panel of panels) {
      table.appendChild(createPanelTerrain(panel, images.get(panel.imageFileName)!, geometry));
    }
    return table;
  }
}

function parseRoomData(entries: ArchiveEntries): ImportedRoom | null {
  const bytes = entries[CCFOLIA_ROOM_DATA_ENTRY];
  if (!bytes) return null;
  try {
    return parseCcfoliaRoom(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

function sceneOfRoom(room: ImportedRoom): ImportedRoomScene {
  return {
    name: '',
    order: 0,
    backgroundFileName: room.backgroundFileName,
    foregroundFileName: room.foregroundFileName,
    fieldWidth: room.fieldWidth,
    fieldHeight: room.fieldHeight,
  };
}

function createPanelTerrain(panel: ImportedRoomPanel, imageIdentifier: string, geometry: RoomGridGeometry): Terrain {
  const terrain = Terrain.create(
    panel.memo.trim(),
    panel.width,
    panel.height,
    PANEL_THICKNESS,
    imageIdentifier,
    imageIdentifier
  );
  terrain.mode = TerrainViewState.FLOOR;
  terrain.isLocked = panel.locked;
  terrain.isDropShadow = false;
  terrain.blocksSight = false;
  terrain.blocksLight = false;
  terrain.rotate = panel.angle;

  const position = roomCellToTablePosition(panel.x, panel.y, geometry);
  terrain.location.x = position.x;
  terrain.location.y = position.y;
  terrain.posZ = panel.z * PANEL_THICKNESS * geometry.gridSize;
  return terrain;
}

function createPieceCharacter(
  piece: ImportedRoomPiece,
  iconIdentifier: string,
  images: Map<string, string>,
  geometry: RoomGridGeometry
): GameCharacter {
  const character = ImportedCharacterFactory.create(piece.character, iconIdentifier);
  appendFaceImages(character, piece, images);

  const position = pieceUnitToTablePosition(piece.x, piece.y, geometry);
  character.location.x = position.x;
  character.location.y = position.y;
  character.rotate = piece.angle;
  if (piece.secret || piece.invisible) character.disclosureMode = DisclosureMode.GameMaster;
  character.update();
  return character;
}

function appendFaceImages(character: GameCharacter, piece: ImportedRoomPiece, images: Map<string, string>): void {
  const imageElement = character.imageDataElement;
  if (!imageElement) return;

  let index = 0;
  for (const face of piece.faces) {
    const identifier = images.get(face.fileName);
    if (!identifier || face.fileName === piece.iconFileName) continue;
    const name = face.label === '' ? `立ち絵${index + 1}` : face.label;
    imageElement.appendChild(DataElement.create(name, identifier, { type: 'image' }));
    index++;
  }
}
