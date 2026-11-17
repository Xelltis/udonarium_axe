import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PlacedRulerService } from '@axe/application/tabletop/placed-ruler.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('PlacedRulerService', () => {
  let service: PlacedRulerService;
  let hidden: Set<string>;

  beforeEach(() => {
    hidden = new Set();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation(
      (piece: GameCharacter) => !hidden.has(piece.identifier)
    );
    vi.spyOn(TestBed.inject(VisionService), 'isHiddenByFog').mockReturnValue(false);
    service = TestBed.inject(PlacedRulerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('leaves a ruler lying on the table for everyone, measuring what it was laid over', () => {
    const ruler = service.place({ from: { x: 25, y: 25, z: 0 }, to: { x: 175, y: 225, z: 0 } });

    expect(ObjectStore.instance.get(ruler.identifier)).toBe(ruler);
    expect(service.placed()).toMatchObject([{ reading: { straight: '5.0' } }]);
    expect(service.guides()).toHaveLength(1);
    expect(service.pickTargets()).toMatchObject([{ id: ruler.identifier, layer: 'table-ruler' }]);
  });

  it('measures from a piece an end is held to wherever it stands, and hides the ruler while the piece is hidden', () => {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: 0, y: 0 };
    service.place({ from: { x: 25, y: 25, z: 0, piece: piece.identifier, lift: 0 }, to: { x: 225, y: 25, z: 0 } });
    expect(service.placed()[0].reading.straight).toBe('4.0');

    piece.location = { name: 'table', x: 100, y: 0 };
    TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
    expect(service.placed()[0].reading.straight).toBe('2.0');

    hidden.add(piece.identifier);
    TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
    expect(service.placed()).toEqual([]);
  });

  it('draws a ruler whose end this seat moves where it is moved, and writes it only once let go and kept', () => {
    const ruler = service.place({ from: { x: 25, y: 25, z: 0 }, to: { x: 75, y: 25, z: 0 } });
    const moved = { from: { x: 25, y: 25, z: 0 }, to: { x: 175, y: 25, z: 0 } };

    service.hold(ruler.identifier, moved);
    expect(service.placed()[0].reading.straight).toBe('3.0');
    expect(ruler.rulerLine?.to.x).toBe(75);

    service.letGo(ruler.identifier, true);
    expect(ruler.rulerLine).toEqual(moved);

    service.hold(ruler.identifier, { ...moved, to: { x: 500, y: 25, z: 0 } });
    service.letGo(ruler.identifier, false);
    expect(ruler.rulerLine).toEqual(moved);
    expect(service.placed()[0].reading.straight).toBe('3.0');
  });

  it('leaves out a ruler that is off the table', () => {
    const ruler = TableRuler.create('物差し', { from: { x: 0, y: 0, z: 0 }, to: { x: 50, y: 0, z: 0 } });
    ruler.setLocation('graveyard');

    expect(service.placed()).toEqual([]);
  });
});
