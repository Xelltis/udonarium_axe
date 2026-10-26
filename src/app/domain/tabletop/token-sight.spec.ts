import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { PartySight, seenByParty, TokenSight, tokenVisibleTo } from '@axe/domain/tabletop/token-sight';
import { OverlayVision, SceneViewer, VisionScene } from '@axe/domain/tabletop/vision-scene';

const GRID = cellGridOf(10, 10, 50, GridType.SQUARE);
const DARK = { darknessEnabled: true, fogEnabled: false, gridSize: 50 } as VisionScene;
const FOGGED = { darknessEnabled: false, fogEnabled: true, gridSize: 50 } as VisionScene;
const PLAYER: SceneViewer = { userId: 'p1', isGameMaster: false, visionOwnerIds: ['p1'], partyIds: [] };
const MASTER: SceneViewer = { userId: 'gm', isGameMaster: true, visionOwnerIds: [], partyIds: [] };

function pieceAt(x: number, y: number, more: Partial<Pick<GameCharacter, 'owner' | 'stealth'>> = {}): GameCharacter {
  const piece = GameCharacter.create('piece', 1, '');
  piece.location.x = x;
  piece.location.y = y;
  Object.assign(piece, more);
  return piece;
}

function sightOf(more: Partial<TokenSight>): TokenSight {
  return {
    scene: DARK,
    viewer: PLAYER,
    found: () => new Set(),
    fog: () => undefined,
    pointVisible: () => false,
    ...more,
  };
}

describe('whether a reader sees a piece', () => {
  const pieces: GameCharacter[] = [];
  afterEach(() => pieces.splice(0).forEach((piece) => piece.destroy()));
  const at = (x: number, y: number, more = {}) => {
    const piece = pieceAt(x, y, more);
    pieces.push(piece);
    return piece;
  };

  it('asks the line of sight to the middle of a piece in the dark', () => {
    const asked: number[][] = [];
    const sight = sightOf({ pointVisible: (x, y) => (asked.push([x, y]), true) });

    expect(tokenVisibleTo(sight, at(100, 100))).toBe(true);
    expect(asked).toEqual([[125, 125]]);
  });

  it('shows a game master everything, and a player their own pieces, without asking anything', () => {
    const asked = vi.fn(() => false);
    const found = vi.fn(() => new Set<string>());

    expect(tokenVisibleTo(sightOf({ viewer: MASTER, pointVisible: asked, found }), at(100, 100))).toBe(true);
    expect(tokenVisibleTo(sightOf({ pointVisible: asked, found }), at(100, 100, { owner: 'p1' }))).toBe(true);
    expect(asked).not.toHaveBeenCalled();
    expect(found).not.toHaveBeenCalled();
  });

  it('hides a piece in stealth from everybody but the game master, its owner and its party', () => {
    const lit = sightOf({ scene: null, pointVisible: () => true });

    expect(tokenVisibleTo(lit, at(100, 100, { stealth: '1' }))).toBe(false);
    expect(tokenVisibleTo({ ...lit, viewer: MASTER }, at(100, 100, { stealth: '1' }))).toBe(true);
    expect(tokenVisibleTo(lit, at(100, 100, { owner: 'p1', stealth: '1' }))).toBe(true);
  });

  it('answers under fog by the cells the fog is drawn from', () => {
    const visible = new CellBits(cellCount(GRID));
    visible.set(cellIndexAt(GRID, 125, 125));
    const fog = { grid: GRID, visible, explored: new CellBits(cellCount(GRID)), rememberSeen: false } as OverlayVision;
    const sight = sightOf({ scene: FOGGED, fog: () => fog });

    expect(tokenVisibleTo(sight, at(100, 100))).toBe(true);
    expect(tokenVisibleTo(sight, at(300, 300))).toBe(false);
  });

  it('keeps showing a piece the party has met', () => {
    const met = at(300, 300);

    expect(tokenVisibleTo(sightOf({ found: () => new Set([met.identifier]) }), met)).toBe(true);
  });
});

describe('whether the party sees a piece', () => {
  const party = (more: Partial<PartySight>): PartySight => ({
    scene: DARK,
    found: () => new Set(),
    cells: () => null,
    explored: () => null,
    playersSide: () => false,
    ...more,
  });

  it('sees it where its eyes reach between them, and on ground it has cleared on a table that keeps it', () => {
    const shared = new CellBits(cellCount(GRID));
    shared.set(cellIndexAt(GRID, 125, 125));
    const explored = new CellBits(cellCount(GRID));
    explored.set(cellIndexAt(GRID, 225, 125));
    const sight = party({ cells: () => ({ grid: GRID, shared }), explored: () => explored });
    const seen = pieceAt(100, 100);
    const cleared = pieceAt(200, 100);
    const dark = pieceAt(400, 400);

    expect(seenByParty(sight, seen)).toBe(true);
    expect(seenByParty(sight, cleared)).toBe(true);
    expect(seenByParty(sight, dark)).toBe(false);
    [seen, cleared, dark].forEach((piece) => piece.destroy());
  });

  it('does not see a piece of the game master in stealth', () => {
    const hidden = pieceAt(100, 100, { stealth: '1' });
    hidden.location.name = 'table';

    expect(seenByParty(party({ scene: null }), hidden)).toBe(false);
    expect(seenByParty(party({ scene: null, playersSide: () => true }), hidden)).toBe(true);
    hidden.destroy();
  });
});
