import { TestBed } from '@angular/core/testing';
import { CardTargetService } from '@axe/application/card/card-target.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePlaceService } from '@axe/application/tabletop/piece-place.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { targetArrowGeometry } from '@axe/domain/card/target-arrow';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CardTargetService', () => {
  let service: CardTargetService;
  let selection: SelectionSignalService;
  const created: { destroy(): void }[] = [];

  function makeCard(x: number, y: number): Card {
    const card = Card.create('カード', '', '');
    card.location.name = 'table';
    card.location.x = x;
    card.location.y = y;
    created.push(card);
    return card;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(CardTargetService);
    selection = TestBed.inject(SelectionSignalService);
  });

  afterEach(() => {
    for (const object of created.splice(0)) object.destroy();
  });

  it('takes whatever is chosen while it waits as the target', () => {
    const source = makeCard(0, 0);
    const target = makeCard(300, 0);

    service.beginPicking(source);
    expect(service.isPicking()).toBe(true);

    selection.selectObject(target.identifier, 'Card');
    TestBed.tick();

    expect(source.targetIdentifier).toBe(target.identifier);
    expect(service.isPicking()).toBe(false);
  });

  it('points nothing for a seat made a guest, even at a piece chosen before it is told', () => {
    PeerCursor.createMyCursor().role = PeerRole.Player;
    const source = makeCard(0, 0);
    const target = makeCard(300, 0);
    service.beginPicking(source);
    TestBed.tick();

    PeerCursor.myCursor.role = PeerRole.Guest;
    selection.selectObject(target.identifier, 'Card');
    TestBed.tick();

    expect(source.targetIdentifier).toBe('');
    PeerCursor.myCursor = null!;
  });

  it('stops waiting once its seat is made a guest', () => {
    PeerCursor.createMyCursor().role = PeerRole.Player;
    service.beginPicking(makeCard(0, 0));
    TestBed.tick();

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.tick();

    expect(service.isPicking()).toBe(false);
    PeerCursor.myCursor = null!;
  });

  it('keeps waiting when the chooser picks itself', () => {
    const source = makeCard(0, 0);

    service.beginPicking(source);
    selection.selectObject(source.identifier, 'Card');
    TestBed.tick();

    expect(source.targetIdentifier).toBe('');
    expect(service.isPicking()).toBe(true);
  });

  it('can stop waiting', () => {
    const source = makeCard(0, 0);

    service.beginPicking(source);
    expect(service.cancelPicking()).toBe(true);
    expect(service.cancelPicking()).toBe(false);

    selection.selectObject('other', 'Card');
    TestBed.tick();
    expect(source.targetIdentifier).toBe('');
  });

  it('draws an arrow only from a card that has a target', () => {
    const source = makeCard(0, 0);
    const target = makeCard(300, 400);
    makeCard(600, 0);
    source.targetIdentifier = target.identifier;

    const arrows = service.arrows();

    expect(arrows).toHaveLength(1);
    expect(arrows[0].identifier).toBe(source.identifier);
    expect(arrows[0].length).toBeCloseTo(500, 5);
  });

  it('draws an arrow from a card at its middle on the face it lies on to a piece where it stands, on a wall too', () => {
    const source = makeCard(0, 0);
    const target = GameCharacter.create('壁', 1, '');
    created.push(target);
    target.location.name = 'table';
    source.targetIdentifier = target.identifier;
    const standing = vi
      .spyOn(TestBed.inject(PiecePlaceService), 'standingCentreOf')
      .mockImplementation((one) => (one === source ? { x: 25, y: 25, z: 0 } : { x: 975, y: 975, z: 450 }));

    expect(service.arrows()).toEqual([
      { identifier: source.identifier, ...targetArrowGeometry({ x: 25, y: 25, z: 0 }, { x: 975, y: 975, z: 450 })! },
    ]);
    expect(standing).toHaveBeenCalledWith(source);
    expect(standing).toHaveBeenCalledWith(target);
  });

  it('keeps the arrows drawn while what moves elsewhere on the table leaves them where they are', () => {
    const source = makeCard(0, 0);
    const target = makeCard(300, 0);
    const other = makeCard(600, 0);
    source.targetIdentifier = target.identifier;
    const drawn = service.arrows();

    const change = TestBed.inject(ObjectChangeService);
    other.location = { name: 'table', x: 700, y: 100 };
    change.notifyChanged(other.identifier);
    expect(service.arrows()).toBe(drawn);

    target.location = { name: 'table', x: 300, y: 200 };
    change.notifyChanged(target.identifier);
    expect(service.arrows()).not.toBe(drawn);
  });

  it('follows the piece an arrow points at at each step this seat drags it', () => {
    const viewed = TableSelecter.instance.viewTableIdentifier;
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.initialize();
    created.push(table);
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    try {
      const source = makeCard(0, 0);
      const target = GameCharacter.create('的', 1, '');
      created.push(target);
      target.location = { name: 'table', x: 300, y: 0 };
      source.targetIdentifier = target.identifier;
      const before = service.arrows();

      TestBed.inject(TransientPlacementService).place(target.identifier, { surface: 'floor', x: 300, y: 400, z: 0 });

      expect(service.arrows()).not.toBe(before);
      expect(service.arrows()[0].length).toBeGreaterThan(before[0].length);
    } finally {
      TableSelecter.instance.viewTableIdentifier = viewed;
    }
  });

  it('draws no arrow to a target that is gone', () => {
    const source = makeCard(0, 0);
    const target = makeCard(300, 400);
    source.targetIdentifier = target.identifier;
    ObjectStore.instance.get(target.identifier)!.destroy();

    expect(service.arrows()).toHaveLength(0);
  });

  it('can drop a target', () => {
    const source = makeCard(0, 0);
    const target = makeCard(300, 400);
    source.targetIdentifier = target.identifier;

    service.clearTarget(source);

    expect(source.targetIdentifier).toBe('');
    expect(service.arrows()).toHaveLength(0);
  });
});
