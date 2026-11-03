import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { ThirdPersonService } from '@axe/application/tabletop/third-person.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import type { Matrix3D } from '@axe/core/transform/matrix-3d';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { type TableCameraView, tableEyeMatrix, type TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { vi } from 'vitest';

const GRID = 50;
const LAYOUT: TableLayout = { left: 0, top: 0, width: 1280, height: 800, boardWidth: 600, boardHeight: 600 };

/** Where a point of the board lands in the eye's space. */
function carried(eye: Matrix3D, x: number, y: number, z: number) {
  return {
    x: x * eye.m11 + y * eye.m21 + z * eye.m31 + eye.m41,
    y: x * eye.m12 + y * eye.m22 + z * eye.m32 + eye.m42,
    z: x * eye.m13 + y * eye.m23 + z * eye.m33 + eye.m43,
  };
}

/** How far in front of the eye a point of the board stands, for a view. */
function aheadOf(view: TableCameraView, x: number, y: number, z: number) {
  const at = carried(tableEyeMatrix(view, LAYOUT), x, y, z);
  return { x: at.x, y: at.y, ahead: view.perspectivePx! - at.z };
}

describe('ThirdPersonService', () => {
  let table: GameTable;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.tableFollow);
    localStorage.removeItem(STORAGE_KEYS.tableRenderer);
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    PeerCursor.myCursor.userId = 'me';
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.inject(TableCameraService).setLayout(LAYOUT);
    vi.spyOn(TestBed.inject(MotionService), 'enabled').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEYS.tableFollow);
    localStorage.removeItem(STORAGE_KEYS.tableRenderer);
  });

  function pieceAt(col: number, row: number, rotate = 0): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    character.rotate = rotate;
    return character;
  }

  function following(): { service: ThirdPersonService; piece: GameCharacter } {
    TestBed.inject(Table3dService).choose('three');
    const piece = pieceAt(5, 5);
    const service = TestBed.inject(ThirdPersonService);
    service.follow(piece.identifier);
    TestBed.tick();
    return { service, piece };
  }

  it('follows a piece only on a table drawn on a canvas, remembers it for this browser, and lets it go', () => {
    const piece = pieceAt(5, 5);
    const service = TestBed.inject(ThirdPersonService);
    service.follow(piece.identifier);
    TestBed.tick();
    expect(service.following()).toBe(false);
    expect(service.view()).toBeNull();

    TestBed.inject(Table3dService).choose('three');
    TestBed.tick();
    expect(service.following()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.tableFollow)).toBe(piece.identifier);
    expect(TestBed.inject(TableEyeService).followed()).toEqual({ owner: piece.identifier, near: false });

    service.stop();
    TestBed.tick();
    expect(service.view()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tableFollow)).toBeNull();
    expect(TestBed.inject(TableEyeService).followed()).toBeNull();
  });

  it('stands the camera back from over the middle of the piece, looking at it the way the piece faces', () => {
    const { service } = following();

    const view = service.view()!;
    const aim = aheadOf(view, 5.5 * GRID, 5.5 * GRID, 0.8 * GRID);
    expect(aim.x).toBeCloseTo(0, 1);
    expect(aim.y).toBeCloseTo(0, 1);
    expect(aim.ahead).toBeCloseTo(4 * GRID, 1);
    expect(aheadOf(view, 5.5 * GRID, 2.5 * GRID, 0.8 * GRID).ahead).toBeGreaterThan(aim.ahead);
  });

  it('comes nearer and goes round the piece as it is asked to', () => {
    const { service } = following();
    const before = service.view()!;

    service.nearerBy(1);
    TestBed.tick();
    expect(aheadOf(service.view()!, 5.5 * GRID, 5.5 * GRID, 0.8 * GRID).ahead).toBeCloseTo(3 * GRID, 1);

    service.turnBy(90, 0);
    TestBed.tick();
    expect(service.view()!.rotateZ).toBeCloseTo(before.rotateZ - 90, 3);
  });

  it('brings the camera in short of a block standing behind the piece, and draws the piece faint once it is near', () => {
    const wall = Terrain.create('壁', 12, 1, 3, 'stone', 'slab');
    wall.location = { name: 'table', x: 0, y: 7 * GRID };
    table.appendChild(wall);
    const { service, piece } = following();

    const ahead = aheadOf(service.view()!, 5.5 * GRID, 5.5 * GRID, 0.8 * GRID).ahead;
    expect(ahead).toBeLessThan(2 * GRID);
    expect(ahead).toBeGreaterThan(0);
    expect(TestBed.inject(TableEyeService).followed()).toEqual({ owner: piece.identifier, near: true });
  });
});
