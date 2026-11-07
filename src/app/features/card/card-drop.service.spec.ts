import { TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { MultiMovableService } from '@axe/application/ui/multi-movable.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { CardDropService } from '@axe/features/card/card-drop.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CardDropService', () => {
  let service: CardDropService;
  let cards: Card[];
  let stacks: CardStack[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const tabletop = TestBed.inject(TabletopService);
    cards = [];
    stacks = [];
    vi.spyOn(tabletop, 'cards', 'get').mockImplementation(() => cards.filter((card) => card.isVisibleOnTable));
    vi.spyOn(tabletop, 'cardStacks', 'get').mockImplementation(() => stacks.filter((stack) => stack.isVisibleOnTable));
    vi.spyOn(tabletop, 'gridSize').mockReturnValue(50);
    service = TestBed.inject(CardDropService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function place<T extends TabletopObject>(object: T, x: number, y: number, surface?: string): T {
    object.location = { name: 'table', x, y, surface };
    return object;
  }

  function card(x: number, y: number, surface?: string): Card {
    const made = place(Card.create('card', '', ''), x, y, surface);
    cards.push(made);
    return made;
  }

  function stack(x: number, y: number, surface?: string, count = 0): CardStack {
    const made = place(CardStack.create('stack'), x, y, surface);
    for (let i = 0; i < count; i++) made.putOnBottom(Card.create(`in ${i}`, '', ''));
    stacks.push(made);
    return made;
  }

  it('puts a card let go of within a cell of a stack on top of it, and leaves one further off', () => {
    const deck = stack(100, 100);
    const near = card(140, 120);
    const far = card(160, 100);

    service.drop(near);
    service.drop(far);

    expect(deck.topCard).toBe(near);
    expect(deck.cards).not.toContain(far);
  });

  it('takes in the cards moved along with the one let go of', () => {
    const deck = stack(100, 100);
    const leader = card(110, 100);
    const follower = card(400, 400);
    vi.spyOn(TestBed.inject(MultiMovableService), 'followerTabletopObjectsFor').mockReturnValue([follower]);

    service.drop(leader);

    expect(deck.cards).toEqual(expect.arrayContaining([leader, follower]));
  });

  it('lays a stack let go of within half a cell of a card on it, taking the card in at the bottom', () => {
    const lying = card(200, 200);
    const deck = stack(215, 210, undefined, 2);

    service.drop(deck);

    expect(deck.location).toMatchObject({ x: 200, y: 200 });
    expect(deck.cards.at(-1)).toBe(lying);
  });

  it('merges a stack let go of within half a cell of another into a new one, its cards on top', () => {
    const lower = stack(300, 300, undefined, 2);
    const upper = stack(310, 300, undefined, 3);
    const upperCards = [...upper.cards];

    service.drop(upper);

    const merged = ObjectStore.instance.getObjects(CardStack).filter((one) => one !== lower && one !== upper);
    expect(merged).toHaveLength(1);
    expect(merged[0].cards.slice(0, 3)).toEqual(upperCards);
    expect(merged[0].cards).toHaveLength(5);
    expect(merged[0].location).toMatchObject({ x: 300, y: 300 });
    expect(ObjectStore.instance.get(lower.identifier)).toBeNull();
    expect(ObjectStore.instance.get(upper.identifier)).toBeNull();
  });

  it('merges a stack let go of between two others with the first alone, leaving the second as it was', () => {
    const first = stack(100, 100, undefined, 2);
    const second = stack(110, 100, undefined, 3);
    const dropped = stack(105, 100, undefined, 1);
    const secondId = second.identifier;

    service.drop(dropped);

    expect(ObjectStore.instance.get(secondId)).toBe(second);
    expect(second.cards).toHaveLength(3);
    expect(first.isVisibleOnTable && ObjectStore.instance.get(first.identifier)).toBeFalsy();
  });

  it('puts a card let go of between two stacks on the first alone', () => {
    const first = stack(100, 100);
    const second = stack(130, 100);
    const dropped = card(115, 100);

    service.drop(dropped);

    expect(first.cards).toEqual([dropped]);
    expect(second.cards).toEqual([]);
  });

  it('keeps a stack merged on a wall on that wall', () => {
    stack(300, 300, 'east-wall', 1);
    const upper = stack(305, 300, 'east-wall', 1);

    service.drop(upper);

    const merged = ObjectStore.instance.getObjects(CardStack);
    expect(merged).toHaveLength(1);
    expect(merged[0].location.surface).toBe('east-wall');
  });

  it('asks only what stands on the same face', () => {
    const onFloor = stack(100, 100);
    const onWall = card(100, 100, 'north-wall');

    service.drop(onWall);

    expect(onFloor.cards).toHaveLength(0);
  });
});
