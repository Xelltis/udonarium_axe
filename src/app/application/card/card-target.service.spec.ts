import { TestBed } from '@angular/core/testing';
import { CardTargetService } from '@axe/application/card/card-target.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
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
