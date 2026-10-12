import { TestBed } from '@angular/core/testing';
import { FreeMovePlanService } from '@axe/application/tabletop/free-move-plan.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableFreePathOverlayComponent } from '@axe/features/tabletop/table-free-path-overlay/table-free-path-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('TableFreePathOverlayComponent', () => {
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TableFreePathOverlayComponent], providers: [...TEST_PROVIDERS] });
    Config.instance.pathMove = true;
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.gridType = GridType.NONE;
    table.initialize();
  });

  afterEach(() => {
    Config.instance.pathMove = false;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(piece.rootDataElement!, '移動')!.value = walk;
    return piece;
  }

  it('draws nothing while nobody is drawing a way', async () => {
    const fixture = TestBed.createComponent(TableFreePathOverlayComponent);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="free-path-overlay"]')).toBeNull();
  });

  it('draws the way being worked out here, and what the move still reaches', async () => {
    const plan = TestBed.inject(FreeMovePlanService);
    plan.begin(pieceAt(2, 2, 4));
    plan.lookAt(4.5 * GRID, 2.5 * GRID);
    const fixture = TestBed.createComponent(TableFreePathOverlayComponent);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="free-path-ahead"]')!.getAttribute('points')).toBe('125,125 225,125');
    expect(host.querySelector('[data-testid="free-path-reach"]')!.getAttribute('r')).toBe(`${4 * GRID}`);
  });

  it('draws the way another peer is drawing for a piece on this table', async () => {
    const piece = pieceAt(2, 2, 4);
    const other = new PeerCursor('other-cursor');
    other.initialize();
    other.movingCharacterIdentifier = piece.identifier;
    other.movingTableIdentifier = table.identifier;
    other.movingPoints = '125,125 225,125';
    const fixture = TestBed.createComponent(TableFreePathOverlayComponent);
    await fixture.whenStable();

    const way = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="free-path-other"]');
    expect(way!.getAttribute('points')).toBe('125,125 225,125');
  });
});
