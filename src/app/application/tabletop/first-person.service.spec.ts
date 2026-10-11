import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { FIRST_PERSON_PIECE_STORAGE_KEY } from '@axe/application/ui/first-person-preference.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { FogMemory } from '@axe/domain/tabletop/fog/fog-memory';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { moveNeighbourToward } from '@axe/domain/tabletop/move/move-neighbours';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { LightPreset } from '@axe/domain/tabletop/vision-types';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { vi } from 'vitest';

const GRID = 50;

function count(bits: CellBits): number {
  let set = 0;
  for (let cell = 0; cell < bits.count; cell++) if (bits.get(cell)) set++;
  return set;
}

describe('FirstPersonService', () => {
  let table: GameTable;

  beforeEach(() => {
    localStorage.removeItem(FIRST_PERSON_PIECE_STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    PeerCursor.myCursor.userId = 'me';
  });

  afterEach(() => localStorage.removeItem(FIRST_PERSON_PIECE_STORAGE_KEY));

  function service(): FirstPersonService {
    return TestBed.inject(FirstPersonService);
  }

  function touch(...identifiers: string[]): void {
    const objectChange = TestBed.inject(ObjectChangeService);
    for (const identifier of identifiers) objectChange.notifyChanged(identifier);
  }

  function pieceAt(col: number, row: number, rotate = 0): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    character.rotate = rotate;
    return character;
  }

  /** A wall two cells high, which is more than a piece steps over. */
  function block(x: number, y: number, width: number, depth: number): Terrain {
    const terrain = Terrain.create('壁', width, depth, 2, 'stone', 'slab');
    terrain.location = { name: 'table', x, y };
    table.appendChild(terrain);
    return terrain;
  }

  function gameMasterInTheRoom(): PeerCursor {
    const master = new PeerCursor();
    master.initialize();
    master.role = PeerRole.GameMaster;
    touch(master.identifier);
    return master;
  }

  function becomeGameMaster(): void {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    touch(PeerCursor.myCursor.identifier);
  }

  describe('which piece a seat looks out of', () => {
    it('shows the table until a seat asks for a piece', () => {
      pieceAt(5, 5);

      expect(service().showing()).toBe(false);
    });

    it('looks out of the piece this seat chose, from a little behind the middle of its cell', () => {
      const piece = pieceAt(5, 5, 90);

      service().enterSeat(piece.identifier);

      expect(service().showing()).toBe(true);
      expect(service().forced()).toBe(false);
      expect(service().pose()).toEqual({ x: 260, y: 275, z: 40, yaw: 90 });
    });

    it('puts a player on the piece the table names while a game master is in the room', () => {
      gameMasterInTheRoom();
      const party = pieceAt(5, 5);
      const mine = pieceAt(2, 2);
      service().enterSeat(mine.identifier);
      expect(service().target()).toEqual({ piece: mine.identifier, shared: false });

      table.sharedViewPiece = party.identifier;
      touch(table.identifier);

      expect(service().target()).toEqual({ piece: party.identifier, shared: true });
      expect(service().forced()).toBe(true);
    });

    it('never holds the game master to the piece the table names', () => {
      becomeGameMaster();
      table.sharedViewPiece = pieceAt(5, 5).identifier;
      touch(table.identifier);

      expect(service().showing()).toBe(false);
    });

    it('lets the players go when no game master is in the room', () => {
      table.sharedViewPiece = pieceAt(5, 5).identifier;
      touch(table.identifier);

      expect(service().showing()).toBe(false);
    });

    it('goes back to the table when the piece leaves it', () => {
      const piece = pieceAt(5, 5);
      service().enterSeat(piece.identifier);
      expect(service().showing()).toBe(true);

      piece.location = { ...piece.location, name: 'graveyard' };
      touch(piece.identifier);

      expect(service().showing()).toBe(false);
    });

    it('goes back to the table when the seat asks to', () => {
      const piece = pieceAt(5, 5);
      service().enterSeat(piece.identifier);

      service().exitSeat();

      expect(service().showing()).toBe(false);
    });

    it('says whether a piece can be looked out of at all', () => {
      const piece = pieceAt(5, 5);
      expect(service().canLookOutOf(piece)).toBe(true);

      piece.location = { ...piece.location, name: 'graveyard' };
      touch(piece.identifier);
      expect(service().canLookOutOf(piece)).toBe(false);
    });

    it('goes back to the table while the piece stands off the board, and looks out again once it is back', () => {
      for (const type of [GridType.SQUARE, GridType.HEX_VERTICAL]) {
        table.gridType = type;
        touch(table.identifier);
        const piece = pieceAt(5, 5);
        service().enterSeat(piece.identifier);
        expect(service().showing()).toBe(true);

        piece.location = { ...piece.location, x: 15 * GRID };
        touch(piece.identifier);
        expect(service().showing()).toBe(false);
        expect(service().canLookOutOf(piece)).toBe(false);

        piece.location = { ...piece.location, x: 5 * GRID };
        touch(piece.identifier);
        expect(service().showing()).toBe(true);
        expect(service().pose()).not.toBeNull();
      }
    });

    it('looks out of a piece wherever it stands on a table without cells', () => {
      table.gridType = GridType.NONE;
      touch(table.identifier);
      const piece = pieceAt(15, 5);

      service().enterSeat(piece.identifier);

      expect(service().showing()).toBe(true);
    });

    it('says whether the piece the table names can still be shown', () => {
      expect(service().sharedUsable()).toBe(false);

      const piece = pieceAt(5, 5);
      table.sharedViewPiece = piece.identifier;
      touch(table.identifier);
      expect(service().sharedUsable()).toBe(true);

      piece.location = { ...piece.location, name: 'graveyard' };
      touch(piece.identifier);
      expect(service().sharedUsable()).toBe(false);
    });

    it('hands the choice of a piece for everyone to the game master alone', () => {
      const piece = pieceAt(5, 5);

      service().share(piece.identifier);
      expect(table.sharedViewPiece).toBe('');

      becomeGameMaster();
      service().share(piece.identifier);
      expect(table.sharedViewPiece).toBe(piece.identifier);

      service().share(null);
      expect(table.sharedViewPiece).toBe('');
    });
  });

  describe('the pieces this seat may look out of', () => {
    it('takes in a piece the moment it is handed to this seat', () => {
      const piece = pieceAt(5, 5);
      piece.owner = 'somebody-else';
      touch(piece.identifier);
      expect(service().seats()).toEqual([]);

      piece.owner = PeerCursor.myCursor.userId;
      touch(piece.identifier);

      expect(
        service()
          .seats()
          .map((seat) => seat.identifier)
      ).toEqual([piece.identifier]);
    });
  });

  describe('what the eye sees', () => {
    it('sees down the room and not through a wall', () => {
      block(0, 5 * GRID, 12, 1);
      const piece = pieceAt(5, 8);
      service().enterSeat(piece.identifier);
      const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

      const seen = service().seen()!;

      expect(seen.get(cellIndexOf(grid, 5, 6))).toBe(true);
      expect(seen.get(cellIndexOf(grid, 5, 4))).toBe(false);
    });

    it('sees ground a doorway hides the middle of but not the corners, as an eye would', () => {
      block(3 * GRID, 8 * GRID, 1, 1);
      block(5 * GRID, 8 * GRID, 1, 1);
      const piece = pieceAt(4, 8);
      service().enterSeat(piece.identifier);
      const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

      const seen = service().seen()!;

      expect(seen.get(cellIndexOf(grid, 3, 7))).toBe(true);
      expect(seen.get(cellIndexOf(grid, 5, 7))).toBe(true);
      expect(seen.get(cellIndexOf(grid, 2, 8))).toBe(false);
    });

    it('sees over a low wall the view is drawn looking over', () => {
      const fence = Terrain.create('柵', 12, 1, 0.6, 'stone', 'slab');
      fence.location = { name: 'table', x: 0, y: 6 * GRID };
      table.appendChild(fence);
      const piece = pieceAt(5, 8);
      service().enterSeat(piece.identifier);
      const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

      expect(
        service()
          .seen()!
          .get(cellIndexOf(grid, 5, 4))
      ).toBe(true);
    });

    it('never shows a player more than the table shows them', () => {
      table.fogEnabled = true;
      touch(table.identifier);
      const monster = pieceAt(5, 8);
      monster.isNpc = true;
      service().enterSeat(monster.identifier);

      const sight = service().sight()!;
      const seen = service().seen()!;
      const reveal = service().reveal()!;

      expect(count(sight)).toBeGreaterThan(0);
      expect(count(seen)).toBeLessThan(count(sight));
      for (let cell = 0; cell < seen.count; cell++) {
        if (seen.get(cell)) expect(reveal.get(cell)).toBe(true);
      }
    });
  });

  describe('how far the eye sees with no dark on the table', () => {
    it('sees as far as the view reaches, whatever range the piece sees by in the dark', () => {
      const piece = pieceAt(5, 9);
      piece.visionRange = 1;
      touch(piece.identifier);
      service().enterSeat(piece.identifier);
      const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

      expect(
        service()
          .seen()!
          .get(cellIndexOf(grid, 5, 5))
      ).toBe(true);
    });
  });

  describe('what the eye sees in the dark', () => {
    function darkTable(): void {
      table.darknessEnabled = true;
      table.globalIllumination = 0;
      touch(table.identifier);
    }

    function lampAt(col: number, row: number): LightSource {
      const lamp = LightSource.create('灯り');
      lamp.location = { name: 'table', x: col * GRID, y: row * GRID };
      lamp.lightBrightRadius = 3;
      lamp.lightDimRadius = 5;
      table.appendChild(lamp);
      touch(table.identifier, lamp.identifier);
      return lamp;
    }

    it('shows a player with no light of their own no more ground than the table does', () => {
      darkTable();
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      const overlay = TestBed.inject(VisionService).overlayVision()!;
      const seen = service().seen()!;

      expect(count(seen)).toBe(0);
      expect(count(overlay.visible)).toBe(0);
    });

    it('shows a player only ground the table has in sight once a lamp is lit', () => {
      darkTable();
      const piece = pieceAt(5, 5, 90);
      lampAt(6, 5);
      service().enterSeat(piece.identifier);

      const overlay = TestBed.inject(VisionService).overlayVision()!;
      const lit = service().litCells()!;

      expect(count(lit)).toBeGreaterThan(0);
      for (let cell = 0; cell < lit.count; cell++) {
        if (lit.get(cell)) expect(overlay.visible.get(cell)).toBe(true);
      }
    });

    it('shows the game master the room whether or not a lamp is burning in it', () => {
      darkTable();
      becomeGameMaster();
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);
      const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

      const seen = service().seen()!;

      expect(seen.get(cellIndexOf(grid, 7, 5))).toBe(true);
    });

    it('hands back ground the party remembers, told apart from ground in sight', () => {
      darkTable();
      table.fogEnabled = true;
      const memory = new FogMemory();
      memory.initialize();
      table.appendChild(memory);
      const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);
      const walked = new CellBits(grid.cols * grid.rows);
      walked.set(cellIndexOf(grid, 7, 5));
      memory.write(grid, walked);
      touch(table.identifier, memory.identifier);
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      const ahead = cellIndexOf(grid, 7, 5);

      expect(service().litCells()!.get(ahead)).toBe(false);
      expect(service().dimCells()!.get(ahead)).toBe(true);
      expect(service().seen()!.get(ahead)).toBe(true);
      expect(service().tierOfCell(ahead)).toBe('dim');
    });
  });

  describe('walking', () => {
    it('walks a piece a cell along the way it faces', async () => {
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      expect(await service().walk('forward')).toBe(true);

      expect(piece.location.x).toBe(6 * GRID);
      expect(piece.location.y).toBe(5 * GRID);
    });

    it('carries the eye along with the piece as it steps and turns', async () => {
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);
      expect(service().pose()).toEqual({ x: 260, y: 275, z: 40, yaw: 90 });

      await service().walk('forward');
      touch(piece.identifier);
      expect(service().pose()).toEqual({ x: 310, y: 275, z: 40, yaw: 90 });

      await service().turn(1);
      touch(piece.identifier);
      expect(service().pose()?.yaw).toBe(180);
    });

    it('will not walk into a wall', async () => {
      block(6 * GRID, 5 * GRID, 1, 1);
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      expect(await service().walk('forward')).toBe(false);

      expect(piece.location.x).toBe(5 * GRID);
    });

    it('keeps a guest from walking', async () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      touch(PeerCursor.myCursor.identifier);
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      expect(service().canWalk()).toBe(false);
      expect(await service().walk('forward')).toBe(false);
      expect(piece.location.x).toBe(5 * GRID);
    });

    it('turns a piece a quarter at a time on squares', async () => {
      const piece = pieceAt(5, 5, 0);
      service().enterSeat(piece.identifier);

      await service().turn(1);

      expect(piece.rotate).toBe(90);
    });

    it('takes the next step once the one before it has landed', async () => {
      const piece = pieceAt(3, 5, 90);
      service().enterSeat(piece.identifier);

      const first = service().walk('forward');
      void service().walk('forward');
      await first;

      await vi.waitFor(() => expect(piece.location.x).toBe(5 * GRID));
    });

    it('opens the door ahead, and walks through it once it is open', async () => {
      const door = block(6 * GRID + 0.375 * GRID, 5 * GRID, 0.25, 1);
      door.doorStyle = DoorStyle.SWING;
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      expect(await service().walk('forward')).toBe(false);
      expect(service().toggleDoorAhead()).toBe(true);
      expect(door.isDoorOpen).toBe(true);
      expect(await service().walk('forward')).toBe(true);
    });
  });

  describe('walking a hex board', () => {
    beforeEach(() => {
      table.gridType = GridType.HEX_VERTICAL;
    });

    function pieceOnHex(col: number, row: number, rotate: number): GameCharacter {
      const grid = cellGridOf(12, 12, GRID, GridType.HEX_VERTICAL);
      const centre = cellCenterOf(grid, cellIndexOf(grid, col, row));
      const character = GameCharacter.create('コマ', 1, '');
      character.location = { name: 'table', x: centre.x - GRID / 2, y: centre.y - GRID / 2 };
      character.rotate = rotate;
      return character;
    }

    it('turns a sixth at a time', async () => {
      const piece = pieceOnHex(4, 4, 0);
      service().enterSeat(piece.identifier);

      await service().turn(1);

      expect(piece.rotate).toBe(60);
    });

    it('steps along each of the six ways, back ones included', async () => {
      const grid = cellGridOf(12, 12, GRID, GridType.HEX_VERTICAL);
      const piece = pieceOnHex(4, 4, 60);
      service().enterSeat(piece.identifier);
      const start = pieceCellOf(grid, piece, GRID);

      expect(await service().walk('forward')).toBe(true);
      const ahead = pieceCellOf(grid, piece, GRID);
      expect(ahead).toBe(moveNeighbourToward(grid, start, 1));

      expect(await service().walk('backLeft')).toBe(true);
      expect(pieceCellOf(grid, piece, GRID)).toBe(moveNeighbourToward(grid, ahead, 5));
    });
  });

  describe('walking a board without a grid', () => {
    beforeEach(() => {
      table.gridType = GridType.NONE;
    });

    it('steps a cell across at a time, whichever of the eight ways it faces', async () => {
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      expect(await service().walk('forward')).toBe(true);
      expect(piece.location.x).toBeCloseTo(6 * GRID);

      piece.rotate = 45;
      touch(piece.identifier);
      expect(await service().walk('forward')).toBe(true);
      expect(piece.location.x).toBeCloseTo(6 * GRID + GRID * Math.SQRT1_2);
      expect(piece.location.y).toBeCloseTo(5 * GRID - GRID * Math.SQRT1_2);
    });

    it('stops at a block in the way', async () => {
      block(6.2 * GRID, 4.5 * GRID, 0.3, 2);
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      expect(await service().walk('forward')).toBe(false);
      expect(piece.location.x).toBe(5 * GRID);
    });

    it('walks on past a piece this seat cannot see, and stops at one it can', async () => {
      table.piecesShareCells = false;
      touch(table.identifier);
      const ahead = pieceAt(6, 5);
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);
      const visible = vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockReturnValue(true);

      expect(await service().walk('forward')).toBe(false);

      visible.mockImplementation((token) => token !== ahead);
      expect(await service().walk('forward')).toBe(true);
    });
  });

  describe('who may walk a view the game master put up', () => {
    function sharedView(owner: string): GameCharacter {
      gameMasterInTheRoom();
      const piece = pieceAt(5, 5, 90);
      piece.owner = owner;
      table.sharedViewPiece = piece.identifier;
      touch(table.identifier, piece.identifier);
      return piece;
    }

    it('lets the player whose piece it is walk it', () => {
      sharedView(PeerCursor.myCursor.userId);

      expect(service().forced()).toBe(true);
      expect(service().canWalk()).toBe(true);
    });

    it('keeps another player to watching', () => {
      sharedView('somebody-else');

      expect(service().canWalk()).toBe(false);
    });

    it('keeps a piece nobody has claimed for the game master alone', async () => {
      const piece = sharedView('');

      expect(service().canWalk()).toBe(false);
      expect(await service().walk('forward')).toBe(false);
      expect(piece.location.x).toBe(5 * GRID);

      becomeGameMaster();
      service().enterSeat(piece.identifier);
      expect(service().canWalk()).toBe(true);
    });

    it('still lets a seat walk a piece nobody has claimed when no view is forced', () => {
      const piece = pieceAt(5, 5, 90);
      piece.owner = '';
      service().enterSeat(piece.identifier);

      expect(service().forced()).toBe(false);
      expect(service().canWalk()).toBe(true);
    });
  });

  describe('the light the explorer carries', () => {
    it('lights a torch on the piece being looked out of, and puts it out again', () => {
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);
      expect(service().torchLit()).toBe(false);

      expect(service().toggleTorch()).toBe(true);
      touch(piece.identifier);

      expect(piece.lightEnabled).toBe(true);
      expect(piece.lightPreset).toBe(LightPreset.TORCH);
      expect(piece.lightDimRadius).toBeGreaterThan(0);
      expect(service().torchLit()).toBe(true);

      expect(service().toggleTorch()).toBe(true);
      touch(piece.identifier);
      expect(piece.lightEnabled).toBe(false);
      expect(service().torchLit()).toBe(false);
    });

    it('leaves a light the piece was already given as it stands', () => {
      const piece = pieceAt(5, 5, 90);
      piece.lightPreset = LightPreset.CANDLE;
      piece.lightBrightRadius = 1;
      piece.lightDimRadius = 2;
      service().enterSeat(piece.identifier);

      service().toggleTorch();

      expect(piece.lightEnabled).toBe(true);
      expect(piece.lightPreset).toBe(LightPreset.CANDLE);
      expect(piece.lightDimRadius).toBe(2);
    });

    it('keeps a viewer of a forced view from striking a light on it', () => {
      gameMasterInTheRoom();
      const piece = pieceAt(5, 5, 90);
      piece.owner = 'somebody-else';
      table.sharedViewPiece = piece.identifier;
      touch(table.identifier, piece.identifier);

      expect(service().toggleTorch()).toBe(false);
      expect(piece.lightEnabled).toBe(false);
    });
  });

  describe('the sound of walking', () => {
    it('plays one sound for a step taken and another for one that is blocked', async () => {
      PresetSound.piecePut = 'step';
      PresetSound.blockPut = 'bump';
      const played: string[] = [];
      vi.spyOn(SoundEffect, 'play').mockImplementation((arg) => {
        played.push(typeof arg === 'string' ? arg : arg.identifier);
      });
      block(6 * GRID, 5 * GRID, 1, 1);
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);

      expect(await service().walk('forward')).toBe(false);
      expect(played).toEqual(['bump']);

      piece.rotate = 270;
      touch(piece.identifier);
      expect(await service().walk('forward')).toBe(true);
      expect(played).toEqual(['bump', 'step']);
    });
  });

  describe('the map in the corner', () => {
    it('marks the walls and the shut doors about the eye, and the ground it stands on', () => {
      block(6 * GRID, 5 * GRID, 1, 1);
      const door = block(4 * GRID + 0.375 * GRID, 5 * GRID, 0.25, 1);
      door.doorStyle = DoorStyle.SWING;
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);
      const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

      const tones = new Map(
        service()
          .minimap()!
          .cells.map((cell) => [cell.index, cell.tone])
      );

      expect(tones.get(cellIndexOf(grid, 6, 5))).toBe('wall');
      expect(tones.get(cellIndexOf(grid, 4, 5))).toBe('doorShut');
      expect(tones.get(cellIndexOf(grid, 5, 5))).toBe('floor');
    });

    it('works the board out again only when the board changes, not as the eye turns', async () => {
      const piece = pieceAt(5, 5, 90);
      service().enterSeat(piece.identifier);
      expect(service().minimap()).not.toBeNull();
      const terrains = vi.spyOn(table, 'terrains', 'get');

      await service().turn(1);
      touch(piece.identifier);

      expect(service().minimap()).not.toBeNull();
      expect(terrains).not.toHaveBeenCalled();
    });
  });
});
