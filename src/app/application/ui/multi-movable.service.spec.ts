import { TestBed } from '@angular/core/testing';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { MovableLike, MultiMovableService } from '@axe/application/ui/multi-movable.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { makeFakeTabletopObject } from '@axe/testing/factories/tabletop-object.factory';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function makeMovable(opts: { id: string; x?: number; y?: number; isLock?: boolean }): MovableLike {
  const obj = makeFakeTabletopObject({ identifier: opts.id, isLock: opts.isLock ?? false });
  return {
    identifier: opts.id,
    tabletopObject: obj,
    posX: opts.x ?? 0,
    posY: opts.y ?? 0,
  };
}

describe('MultiMovableService', () => {
  let service: MultiMovableService;
  let selection: SelectionSignalService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(MultiMovableService);
    selection = TestBed.inject(SelectionSignalService);
  });

  it('refuses to begin a drag when the leader is outside the selection', () => {
    const leader = makeMovable({ id: 'leader' });
    service.register(leader);
    expect(service.beginDrag(leader)).toBe(false);
  });

  it('moves every selected follower by the same delta as the leader', () => {
    const leader = makeMovable({ id: 'a', x: 100, y: 100 });
    const follower = makeMovable({ id: 'b', x: 200, y: 300 });
    service.register(leader);
    service.register(follower);
    selection.replaceSelection(['a', 'b']);

    expect(service.beginDrag(leader)).toBe(true);

    leader.posX = 150;
    leader.posY = 120;
    service.applyLeaderDelta(leader);

    expect(follower.posX).toBe(250);
    expect(follower.posY).toBe(320);
  });

  it('skips a locked follower', () => {
    const leader = makeMovable({ id: 'a', x: 0, y: 0 });
    const locked = makeMovable({ id: 'b', x: 100, y: 100, isLock: true });
    const free = makeMovable({ id: 'c', x: 200, y: 200 });
    service.register(leader);
    service.register(locked);
    service.register(free);
    selection.replaceSelection(['a', 'b', 'c']);

    service.beginDrag(leader);
    leader.posX = 30;
    leader.posY = 40;
    service.applyLeaderDelta(leader);

    expect(locked.posX).toBe(100);
    expect(locked.posY).toBe(100);
    expect(free.posX).toBe(230);
    expect(free.posY).toBe(240);
  });

  it('skips a locked terrain, which keeps its lock as isLocked', () => {
    const wall = Terrain.create('wall', 1, 1, 1, '', '');
    wall.isLocked = true;
    const leader = makeMovable({ id: 'a', x: 0, y: 0 });
    const locked: MovableLike = { identifier: wall.identifier, tabletopObject: wall, posX: 100, posY: 100 };
    service.register(leader);
    service.register(locked);
    selection.replaceSelection(['a', wall.identifier]);

    service.beginDrag(leader);
    leader.posX = 30;
    service.applyLeaderDelta(leader);

    expect(locked.posX).toBe(100);
    wall.destroy();
  });

  it('stops moving followers once the drag has ended', () => {
    const leader = makeMovable({ id: 'a' });
    const follower = makeMovable({ id: 'b' });
    service.register(leader);
    service.register(follower);
    selection.replaceSelection(['a', 'b']);

    service.beginDrag(leader);
    service.endDrag(leader);

    leader.posX = 999;
    service.applyLeaderDelta(leader);
    expect(follower.posX).toBe(0);
  });

  it('lists the follower objects for the leader being dragged', () => {
    const leader = makeMovable({ id: 'leader' });
    const f1 = makeMovable({ id: 'f1' });
    const f2 = makeMovable({ id: 'f2' });
    service.register(leader);
    service.register(f1);
    service.register(f2);
    selection.replaceSelection(['leader', 'f1', 'f2']);

    service.beginDrag(leader);
    const followers = service.followerTabletopObjectsFor('leader');
    expect(followers.map((o) => o.identifier)).toEqual(['f1', 'f2']);
  });

  it('writes each follower where it stands before listing it, for a put down to read', () => {
    const leader = makeMovable({ id: 'leader' });
    const f1 = { ...makeMovable({ id: 'f1' }), commitPosition: vi.fn() };
    service.register(leader);
    service.register(f1);
    selection.replaceSelection(['leader', 'f1']);
    service.beginDrag(leader);

    expect(service.settledFollowersFor('other')).toEqual([]);
    expect(f1.commitPosition).not.toHaveBeenCalled();
    expect(service.settledFollowersFor('leader').map((o) => o.identifier)).toEqual(['f1']);
    expect(f1.commitPosition).toHaveBeenCalledTimes(1);
  });

  it('has each piece that followed a leader, whatever led, bring along what goes with it as the drag ends', () => {
    const leader = makeMovable({ id: 'board', x: 0, y: 0 });
    const dragon = GameCharacter.create('竜', 3, '');
    const follower: MovableLike = { identifier: dragon.identifier, tabletopObject: dragon, posX: 0, posY: 0 };
    const note = makeMovable({ id: 'note' });
    service.register(leader);
    service.register(follower);
    service.register(note);
    selection.replaceSelection(['board', dragon.identifier, 'note']);
    const carry = vi.spyOn(TestBed.inject(PieceLinksService), 'carryBoundAll').mockImplementation(() => undefined);

    try {
      service.beginDrag(leader);
      service.endDrag(leader);
      expect(carry).not.toHaveBeenCalled();

      service.beginDrag(leader);
      leader.posX = 100;
      service.applyLeaderDelta(leader);
      service.endDrag(leader);
      expect(carry).toHaveBeenCalledWith([dragon]);
    } finally {
      dragon.destroy();
    }
  });

  it('stands the parts of a piece that followed a board on it as the drag ends', () => {
    const board = makeMovable({ id: 'board', x: 0, y: 0 });
    const dragon = GameCharacter.create('竜', 3, '');
    dragon.location = { name: 'table', x: 100, y: 100 };
    const head = GameCharacter.create('頭', 1, '');
    head.location = { name: 'table', x: 150, y: 150 };
    head.ridingOn = dragon.identifier;
    head.rideSeat = 'part';
    const follower: MovableLike = {
      identifier: dragon.identifier,
      tabletopObject: dragon,
      posX: 100,
      posY: 100,
      commitPosition() {
        dragon.location.x = this.posX;
        dragon.location.y = this.posY;
      },
    };
    service.register(board);
    service.register(follower);
    selection.replaceSelection(['board', dragon.identifier]);

    try {
      service.beginDrag(board);
      board.posX = board.posY = 200;
      service.applyLeaderDelta(board);
      service.endDrag(board);

      expect([dragon.location.x, dragon.location.y]).toEqual([300, 300]);
      expect([head.location.x, head.location.y]).toEqual([350, 350]);
    } finally {
      head.destroy();
      dragon.destroy();
    }
  });

  it('leaves the followers a leading piece took to bring along to it, and forgets that by the next drag', () => {
    const leader = makeMovable({ id: 'leader' });
    const dragon = GameCharacter.create('竜', 3, '');
    const follower: MovableLike = { identifier: dragon.identifier, tabletopObject: dragon, posX: 0, posY: 0 };
    service.register(leader);
    service.register(follower);
    selection.replaceSelection(['leader', dragon.identifier]);
    const carry = vi.spyOn(TestBed.inject(PieceLinksService), 'carryBoundAll').mockImplementation(() => undefined);

    try {
      service.beginDrag(leader);
      leader.posX = 100;
      expect(service.carriedFollowersFor('leader')).toEqual([dragon]);
      expect(service.carriedFollowersFor('leader')).toEqual([]);
      service.endDrag(leader);
      expect(carry).not.toHaveBeenCalled();

      service.beginDrag(leader);
      service.carriedFollowersFor('leader');
      service.beginDrag(leader);
      leader.posX = 200;
      service.endDrag(leader);
      expect(carry).toHaveBeenCalledWith([dragon]);
    } finally {
      dragon.destroy();
    }
  });

  it('lists nothing for another leader or after the drag', () => {
    const leader = makeMovable({ id: 'leader' });
    const f1 = makeMovable({ id: 'f1' });
    service.register(leader);
    service.register(f1);
    selection.replaceSelection(['leader', 'f1']);
    service.beginDrag(leader);

    expect(service.followerTabletopObjectsFor('other')).toEqual([]);
    service.endDrag(leader);
    expect(service.followerTabletopObjectsFor('leader')).toEqual([]);
  });

  it('leaves an unregistered follower behind', () => {
    const leader = makeMovable({ id: 'a' });
    const follower = makeMovable({ id: 'b', x: 10, y: 10 });
    service.register(leader);
    service.register(follower);
    selection.replaceSelection(['a', 'b']);
    service.beginDrag(leader);

    service.unregister(follower);
    leader.posX = 100;
    service.applyLeaderDelta(leader);
    expect(follower.posX).toBe(10);
  });
});
