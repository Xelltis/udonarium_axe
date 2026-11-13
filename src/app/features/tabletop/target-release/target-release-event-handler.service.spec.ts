import { TestBed } from '@angular/core/testing';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { turnStartMark, TurnState } from '@axe/domain/tabletop/turn-state';
import { VisionType } from '@axe/domain/tabletop/vision-types';
import { TargetReleaseEventHandlerService } from '@axe/features/tabletop/target-release/target-release-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** Longer than the throttle the vision service puts on a change before it reads the table again. */
const SCENE_SETTLE_MS = 50;

function makeMyCursor(userId: string, role: PeerRole): PeerCursor {
  const cursor = new PeerCursor();
  cursor.userId = userId;
  cursor.role = role;
  cursor.initialize();
  PeerCursor.myCursor = cursor;
  return cursor;
}

function addPeer(userId: string, role: PeerRole): PeerCursor {
  const cursor = new PeerCursor();
  cursor.userId = userId;
  cursor.role = role;
  cursor.initialize();
  return cursor;
}

describe('TargetReleaseEventHandlerService', () => {
  let store: ObjectStore;
  let targets: PieceTargetService;
  let hero: GameCharacter;
  let enemy: GameCharacter;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    store = ObjectStore.instance;
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    targets = TestBed.inject(PieceTargetService);

    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = 50;
    table.darknessEnabled = true;
    table.initialize();

    hero = GameCharacter.create('Hero', 1, '');
    hero.owner = 'p1';
    hero.visionType = VisionType.DARKVISION;
    hero.visionRange = 5;
    hero.location = { name: 'table', x: 100, y: 500 };

    enemy = GameCharacter.create('Enemy', 1, '');
    enemy.owner = 'gm';
    enemy.location = { name: 'table', x: 250, y: 500 };
  });

  afterEach(() => {
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    PeerCursor.myCursor = null!;
    vi.useRealTimers();
  });

  /** Hands the turn to a piece, as the round does, and lets this screen hear of it. */
  async function turnPassesTo(identifier: string): Promise<void> {
    TurnState.instance.currentIdentifier = identifier;
    if (identifier) TurnState.instance.turnStart = turnStartMark(identifier, Date.now());
    objectChanged$.emit({ aliasName: 'TurnState', identifier: 'TurnState', isSendFromSelf: true });
    await settle();
  }

  /** Starts the handler and lets the table it reads settle, as a room that has just been joined does. */
  async function start(): Promise<void> {
    TestBed.inject(TargetReleaseEventHandlerService);
    await settle();
  }

  /** Tells the room a piece has changed and waits for the sight on the table to be read again. */
  async function changed(piece: GameCharacter): Promise<void> {
    objectChanged$.emit({ aliasName: GameCharacter.aliasName, identifier: piece.identifier, isSendFromSelf: true });
    await settle();
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(SCENE_SETTLE_MS);
    TestBed.tick();
  }

  it('takes the aim off an enemy that walks out of the sight of a player', async () => {
    makeMyCursor('p1', PeerRole.Player);
    await start();
    targets.toggle(enemy);
    await settle();
    expect(enemy.targeted).toBe(true);

    enemy.location.x = 800;
    await changed(enemy);

    expect(enemy.targeted).toBe(false);
  });

  it('says the aim was taken off, so the marks and the lists are read again', async () => {
    makeMyCursor('p1', PeerRole.Player);
    await start();
    targets.toggle(enemy);
    await settle();
    const told = TestBed.inject(UiSignalService).targetChange;
    const before = told();

    enemy.location.x = 800;
    await changed(enemy);

    expect(told()).not.toBe(before);
    expect(told()).toEqual({ identifier: enemy.identifier, className: enemy.aliasName });
  });

  it('takes the aim off an enemy left behind as the player walks away', async () => {
    makeMyCursor('p1', PeerRole.Player);
    await start();
    targets.toggle(enemy);
    await settle();

    hero.location.x = 900;
    await changed(hero);

    expect(enemy.targeted).toBe(false);
  });

  it('takes the aim off an enemy put into stealth', async () => {
    makeMyCursor('p1', PeerRole.Player);
    await start();
    targets.toggle(enemy);
    await settle();

    enemy.stealth = '1';
    await changed(enemy);

    expect(enemy.targeted).toBe(false);
  });

  it('keeps the aim on an enemy that stays in sight, however it is changed', async () => {
    makeMyCursor('p1', PeerRole.Player);
    await start();
    targets.toggle(enemy);
    await settle();

    enemy.location.x = 300;
    enemy.name = 'Orc';
    await changed(enemy);

    expect(enemy.targeted).toBe(true);
  });

  it('keeps the aim on the player’s own piece, which they see wherever it stands', async () => {
    makeMyCursor('p1', PeerRole.Player);
    await start();
    targets.toggle(hero);
    await settle();

    hero.location.x = 900;
    await changed(hero);

    expect(hero.targeted).toBe(true);
  });

  it('takes no aim off the game master, who sees the whole table', async () => {
    makeMyCursor('gm', PeerRole.GameMaster);
    await start();
    targets.toggle(enemy);
    await settle();

    enemy.location.x = 800;
    await changed(enemy);

    expect(enemy.targeted).toBe(true);
  });

  it('takes no aim off the game master looking at the table as a player', async () => {
    makeMyCursor('gm', PeerRole.GameMaster);
    addPeer('p1', PeerRole.Player);
    enemy.location.x = 800;
    await start();
    targets.toggle(enemy);
    await settle();

    TestBed.inject(VisionService).previewAsUserId.set('p1');
    await settle();

    expect(enemy.targeted).toBe(true);
  });

  describe('as the turn passes', () => {
    it('takes every aim off as the turn passes to another piece, for the game master too', async () => {
      makeMyCursor('gm', PeerRole.GameMaster);
      await start();
      await turnPassesTo(hero.identifier);
      targets.toggle(enemy);
      targets.toggle(hero);
      await settle();

      await turnPassesTo(enemy.identifier);

      expect(enemy.targeted).toBe(false);
      expect(hero.targeted).toBe(false);
    });

    it('takes every aim off as the round closes', async () => {
      makeMyCursor('p1', PeerRole.Player);
      await start();
      await turnPassesTo(hero.identifier);
      targets.toggle(enemy);
      await settle();

      await turnPassesTo('');

      expect(enemy.targeted).toBe(false);
    });

    it('takes every aim off as the turn begins anew for the same piece, the only one in the order', async () => {
      makeMyCursor('p1', PeerRole.Player);
      await start();
      await turnPassesTo(hero.identifier);
      targets.toggle(enemy);
      await settle();

      vi.advanceTimersByTime(1000);
      await turnPassesTo(hero.identifier);

      expect(enemy.targeted).toBe(false);
    });

    it('keeps the aims while the round is told of without the turn passing', async () => {
      makeMyCursor('p1', PeerRole.Player);
      await start();
      await turnPassesTo(hero.identifier);
      targets.toggle(enemy);
      await settle();

      TurnState.instance.round = 2;
      objectChanged$.emit({ aliasName: 'TurnState', identifier: 'TurnState', isSendFromSelf: true });
      await settle();

      expect(enemy.targeted).toBe(true);
    });

    it('leaves a tick on a piece kept off the table, in a tab of the inventory, as it is', async () => {
      makeMyCursor('gm', PeerRole.GameMaster);
      await start();
      await turnPassesTo(hero.identifier);
      enemy.location.name = 'graveyard';
      targets.toggle(enemy);
      await settle();

      await turnPassesTo(hero.identifier + '-other');

      expect(enemy.targeted).toBe(true);
    });

    it('ends nothing on the turn as it stands when first heard of', async () => {
      makeMyCursor('p1', PeerRole.Player);
      TurnState.instance.currentIdentifier = hero.identifier;
      TurnState.instance.turnStart = turnStartMark(hero.identifier, Date.now());
      await start();
      targets.toggle(enemy);
      await settle();

      objectChanged$.emit({ aliasName: 'TurnState', identifier: 'TurnState', isSendFromSelf: true });
      await settle();

      expect(enemy.targeted).toBe(true);
    });
  });
});
