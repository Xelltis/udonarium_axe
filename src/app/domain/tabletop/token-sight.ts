import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { pieceCentreOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { eyeHeightPx, OverlayVision, SceneViewer, viewerShares, VisionScene } from '@axe/domain/tabletop/vision-scene';

/**
 * What one reader's view of the table is read from, for whether a piece on it can be seen.
 *
 * What takes working out is asked for only where the answer turns on it, so a game master, who
 * sees everything, never has the fog or the found pieces worked out for them.
 */
export interface TokenSight {
  readonly scene: VisionScene | null;
  readonly viewer: SceneViewer;
  /** The pieces the party has met, on a table that follows them. */
  readonly found: () => ReadonlySet<string>;
  /** The fog as this reader sees it; undefined where the table keeps none. */
  readonly fog: () => OverlayVision | undefined;
  /** Whether a point is in the reader's sight, which the caller may remember. */
  readonly pointVisible: (x: number, y: number, z: number) => boolean;
}

/**
 * Whether a reader can see a piece through the dark and the fog.
 *
 * Always for the game master, for a piece of the reader's own or their party's, for a piece off
 * the floor, and for a piece the party has already found. Under fog a piece answers to the cells
 * the fog is drawn from; otherwise to a line of sight to its eyes. A piece in stealth is seen
 * only by the game master, its owner and its party, whatever the light.
 */
export function tokenVisibleTo(sight: TokenSight, character: GameCharacter): boolean {
  const { scene, viewer } = sight;
  if (character.stealth === '1' && !seesThroughStealth(viewer, character)) return false;
  if (!scene || !(scene.darknessEnabled || scene.fogEnabled)) return true;
  if (surfaceOf(character) !== 'floor') return true;
  if (viewer.isGameMaster) return true;
  if (viewerShares(viewer, character.owner, character.partyIdentifier)) return true;
  const { x, y } = pieceCentreOf(character, scene.gridSize);
  // Under fog the piece answers to the same cells the fog is drawn from. Asking the sight
  // lines again would answer for eyes the reader may not have: somebody with no piece of
  // their own has none, and a table with the dark switched off has nothing to stop a look,
  // so every piece on the board would stand in plain view under the fog covering it.
  // A piece the party has met is followed wherever it goes, on a table that says so: what
  // is being read is the map the party keeps, and a monster they have seen is on it.
  if (sight.found().has(character.identifier)) return true;
  const fog = scene.fogEnabled ? sight.fog() : undefined;
  if (fog) {
    const cell = cellIndexAt(fog.grid, x, y);
    // Ground the party has cleared keeps showing what stands on it, so a monster once
    // found stays found. It goes again the moment it steps somewhere nobody has been.
    if (cell >= 0) return fog.visible.get(cell) || (fog.rememberSeen && fog.explored.get(cell));
  }
  return sight.pointVisible(x, y, eyeHeightPx(character.altitude, character.posZ, scene.gridSize));
}

/**
 * Whether a reader sees a piece in stealth: the game master does, and so do its owner and its
 * party. A game master looking at the table as a player sees it as that player would.
 */
export function seesThroughStealth(viewer: SceneViewer, character: GameCharacter): boolean {
  return viewer.isGameMaster || viewerShares(viewer, character.owner, character.partyIdentifier);
}

/** What the players' shared view of the table is read from, whoever is asking. */
export interface PartySight {
  readonly scene: VisionScene | null;
  /** The pieces the party has met, on a table that follows them. */
  readonly found: () => ReadonlySet<string>;
  /** The cells the party's eyes reach between them; null where none are worked out. */
  readonly cells: () => { readonly grid: CellGrid; readonly shared: CellBits } | null;
  /** The ground the party has cleared, on a table that keeps it; null on one that does not. */
  readonly explored: () => CellBits | null;
  /** Whether a player owns a piece or it stands in a player's party, which is who sees it in stealth. */
  readonly playersSide: (character: GameCharacter) => boolean;
}

/**
 * Whether the players, between them, can see a character, whoever is asking.
 *
 * The party sees what its eyes reach now, the ground it has cleared on a table that keeps it, and
 * the pieces it has met on one that follows them. A piece in stealth is seen only where a player
 * owns it or it stands in a player's party; the game master's own is not.
 */
export function seenByParty(sight: PartySight, character: GameCharacter): boolean {
  if (character.stealth === '1' && character.location.name === 'table' && !sight.playersSide(character)) return false;
  const scene = sight.scene;
  if (!scene || !(scene.darknessEnabled || scene.fogEnabled)) return true;
  if (character.location.name !== 'table' || surfaceOf(character) !== 'floor') return true;
  if (sight.found().has(character.identifier)) return true;
  const cells = sight.cells();
  if (!cells) return true;
  const centre = pieceCentreOf(character, scene.gridSize);
  const cell = cellIndexAt(cells.grid, centre.x, centre.y);
  if (cell < 0 || cells.shared.get(cell)) return true;
  return sight.explored()?.get(cell) ?? false;
}
