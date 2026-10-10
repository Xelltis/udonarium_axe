import { TestBed } from '@angular/core/testing';
import { DiceTrayPlacementService, DIE_CELLS, IN_FRONT_CELLS } from '@axe/application/dice/dice-tray-placement.service';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { dieRadiusOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** A view of the table turned some way on the screen, about the page's origin. */
function viewTurnedBy(degrees: number) {
  const [c, s] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  return {
    toPage: (p: PointerCoordinate): PointerCoordinate => ({ x: c * p.x - s * p.y, y: s * p.x + c * p.y, z: 0 }),
    toTable: (p: PointerCoordinate): PointerCoordinate => ({ x: c * p.x + s * p.y, y: -s * p.x + c * p.y, z: 0 }),
  };
}

describe('DiceTrayPlacementService', () => {
  let service: DiceTrayPlacementService;
  let view = viewTurnedBy(0);
  let visible = true;
  let concealed = false;
  let origin: HTMLElement;
  /** The cell of the table on show, which the setup of every test gives. */
  let grid: number;
  const made: { destroy(): void }[] = [];

  function speaker(x: number, y: number, z = 0): GameCharacter {
    const piece = GameCharacter.create('話し手', 1, '');
    piece.location.name = 'table';
    piece.location.x = x;
    piece.location.y = y;
    piece.posZ = z;
    made.push(piece);
    return piece;
  }

  function lineFrom(piece: GameCharacter | null): string {
    return piece?.identifier ?? '';
  }

  /** Where the middle of the tray lands on the table, and which way up the screen its depth runs there. */
  function laid(model: readonly number[]) {
    const centre = { x: model[12], y: model[13], z: model[14] };
    const along = view.toPage({ x: model[4], y: model[5], z: 0 });
    const length = Math.hypot(along.x, along.y);
    return { centre, up: { x: along.x / length, y: along.y / length } };
  }

  beforeEach(() => {
    view = viewTurnedBy(0);
    visible = true;
    concealed = false;
    origin = document.createElement('div');
    document.body.appendChild(origin);
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: CoordinateService,
          useValue: {
            get tabletopOriginElement() {
              return origin;
            },
            convertToGlobal: (p: PointerCoordinate) => view.toPage(p),
            convertToLocal: (p: PointerCoordinate) => view.toTable(p),
          },
        },
        { provide: VisionService, useValue: { isTokenVisible: () => visible } },
        { provide: ConcealmentService, useValue: { isConcealed: () => concealed } },
      ],
    });
    service = TestBed.inject(DiceTrayPlacementService);
    grid = TestBed.inject(TabletopService).currentTable.gridSize;
  });

  afterEach(() => {
    origin.remove();
    for (const object of made.splice(0)) object.destroy();
  });

  it('throws the dice in front of the piece that rolled, on the floor it stands on', () => {
    const piece = speaker(200, 300, 40);

    const placement = service.placementsFor(lineFrom(piece), [2])![0];

    const { centre, up } = laid(placement.model);
    expect(centre.x).toBeCloseTo(200 + grid / 2, 6);
    expect(centre.y).toBeCloseTo(300 + grid / 2 + IN_FRONT_CELLS * grid, 6);
    expect(centre.z).toBe(40);
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(-1, 6);
  });

  it('lays the tray square to the screen however the table is turned', () => {
    view = viewTurnedBy(70);
    const piece = speaker(200, 300);

    const placement = service.placementsFor(lineFrom(piece), [2])![0];

    const { centre, up } = laid(placement.model);
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(-1, 6);
    const foot = view.toPage({ x: 200 + grid / 2, y: 300 + grid / 2, z: 0 });
    const landed = view.toPage(centre);
    expect(landed.x).toBeCloseTo(foot.x, 6);
    expect(landed.y).toBeCloseTo(foot.y + IN_FRONT_CELLS * grid, 6);
  });

  it('keeps the tray’s width across the screen and its height off the table, the dice half a cell large', () => {
    const placement = service.placementsFor(lineFrom(speaker(0, 0)), [2])![0];
    const [rx, ry, , , ax, ay, , , , , up] = placement.model;

    expect(rx * ax + ry * ay).toBeCloseTo(0, 9);
    expect(rx).toBeGreaterThan(0);
    expect(up).toBeCloseTo(Math.hypot(rx, ry), 9);
    const d6Edge = (2 * dieRadiusOf('d6')) / Math.sqrt(3);
    expect(d6Edge * up).toBeCloseTo(DIE_CELLS * grid, 6);
  });

  it('throws the dice in the middle of the screen for a piece out of sight, hidden away, or for no piece', () => {
    const middle = view.toTable({ x: window.innerWidth / 2, y: window.innerHeight / 2, z: 0 });
    const lines = [lineFrom(null)];
    visible = false;
    lines.push(lineFrom(speaker(500, 500)));

    for (const line of lines) {
      const { centre } = laid(service.placementsFor(line, [1])![0].model);
      expect(centre.x).toBeCloseTo(middle.x, 6);
      expect(centre.y).toBeCloseTo(middle.y, 6);
    }

    visible = true;
    concealed = true;
    const { centre } = laid(service.placementsFor(lineFrom(speaker(500, 500)), [1])![0].model);
    expect(centre.x).toBeCloseTo(middle.x, 6);
  });

  it('keeps the tray on the board when the piece that rolled stands at its edge', () => {
    const table = TestBed.inject(TabletopService).currentTable;
    const [width, depth] = [table.width * table.gridSize, table.height * table.gridSize];
    const piece = speaker(width - table.gridSize, depth - table.gridSize);

    const { model, tray } = service.placementsFor(lineFrom(piece), [2])![0];

    const scale = model[10];
    const { centre } = laid(model);
    expect(centre.x + tray.halfWidth * scale).toBeLessThanOrEqual(width + 1e-6);
    expect(centre.y + tray.halfDepth * scale).toBeLessThanOrEqual(depth + 1e-6);
    expect(centre.x - tray.halfWidth * scale).toBeGreaterThanOrEqual(-1e-6);
  });

  it('gives more dice more room', () => {
    const few = service.placementsFor(lineFrom(null), [2])![0].tray;
    const many = service.placementsFor(lineFrom(null), [12])![0].tray;

    expect(many.halfWidth * many.halfDepth).toBeGreaterThan(few.halfWidth * few.halfDepth);
  });

  it('lays the trays of a large roll side by side across the screen, the row centred where one tray would lie', () => {
    const piece = speaker(500, 500);
    const [one] = service.placementsFor(lineFrom(piece), [4])!;
    const row = service.placementsFor(lineFrom(piece), [4, 4, 4])!;

    const centres = row.map((placement) => laid(placement.model).centre);
    expect(centres[1].x).toBeCloseTo(laid(one.model).centre.x);
    expect(centres.map((centre) => centre.y)).toEqual(Array(3).fill(laid(one.model).centre.y));
    const scale = row[0].model[10];
    for (let i = 1; i < row.length; i++) {
      const apart = centres[i].x - centres[i - 1].x;
      expect(apart).toBeGreaterThan((row[i - 1].tray.halfWidth + row[i].tray.halfWidth) * scale);
    }
  });

  it('keeps the whole row of trays on the board when the piece that rolled stands at its edge', () => {
    const table = TestBed.inject(TabletopService).currentTable;
    const width = table.width * table.gridSize;
    const piece = speaker(width - table.gridSize, 500);

    const row = service.placementsFor(lineFrom(piece), [4, 4, 4])!;

    const scale = row[0].model[10];
    const last = row[row.length - 1];
    const first = row[0];
    expect(laid(last.model).centre.x + last.tray.halfWidth * scale).toBeLessThanOrEqual(width + 1e-6);
    expect(laid(first.model).centre.x - first.tray.halfWidth * scale).toBeGreaterThanOrEqual(-1e-6);
  });

  it('places nothing while no table is on show', () => {
    origin.remove();

    expect(service.placementsFor(lineFrom(null), [2])).toBeNull();
  });
});
