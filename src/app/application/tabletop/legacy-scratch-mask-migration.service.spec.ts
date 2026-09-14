import { TestBed } from '@angular/core/testing';
import { LegacyScratchMaskMigrationService } from '@axe/application/tabletop/legacy-scratch-mask-migration.service';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { waitFor } from '@axe/testing/wait-for';

describe('LegacyScratchMaskMigrationService', () => {
  let store: ObjectStore;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    store = ObjectStore.instance;
    table = new GameTable('table-in-play');
    table.initialize();
  });

  afterEach(() => {
    setNetworkIsolated(false);
    ObjectSynchronizer.instance.destroy();
    vi.restoreAllMocks();
  });

  function legacyOn(identifier: string, name = '古いマスク'): GameTableScratchMask {
    const legacy = GameTableScratchMask.create(name, 4, 3, 100, identifier);
    table.appendChild(legacy);
    return legacy;
  }

  function nextTask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function withEverythingBelow(node: ObjectNode): ObjectNode[] {
    return [node, ...node.children.flatMap((child) => withEverythingBelow(child))];
  }

  /** What an older seat sends for a legacy mask, taken off one built here and then put out of the store again. */
  function sentByAnOlderSeat(identifier: string): { mask: ObjectContext; pieces: ObjectContext[] } {
    const objects = withEverythingBelow(legacyOn(identifier, '届いたマスク'));
    (objects[0] as GameTableScratchMask).isLock = true;
    const [mask, ...pieces] = objects.map((object) => object.toContext());
    for (const object of [...objects].reverse()) store.remove(object);
    return { mask, pieces };
  }

  it('converts the legacy masks already in the room when it starts', async () => {
    legacyOn('already-here');
    await nextTask();

    TestBed.inject(LegacyScratchMaskMigrationService);

    await waitFor(() => table.masks.length === 1, { description: 'the legacy mask to be converted' });
    expect(store.getObjects(GameTableScratchMask)).toEqual([]);
  });

  it('converts a legacy mask an older seat sends after the room has loaded, once all of it has arrived', async () => {
    const sent = sentByAnOlderSeat('from-older-seat');
    await nextTask();
    const passes = vi.spyOn(LegacyScratchMaskMigrationService.prototype, 'migrate');
    TestBed.inject(LegacyScratchMaskMigrationService);
    ObjectSynchronizer.instance.initialize();
    await waitFor(() => passes.mock.calls.length > 0, { description: 'the pass made on starting' });
    const passesBeforeArrival = passes.mock.calls.length;

    localDispatch('UPDATE_GAME_OBJECT', sent.mask, 'older-seat');
    await waitFor(() => passes.mock.calls.length > passesBeforeArrival, {
      description: 'a pass over the half-arrived mask',
    });

    expect(table.masks).toEqual([]);
    expect(store.get('from-older-seat')).toBeInstanceOf(GameTableScratchMask);

    for (const piece of sent.pieces) localDispatch('UPDATE_GAME_OBJECT', piece, 'older-seat');
    await waitFor(() => table.masks.length === 1, { description: 'the arrived mask to be converted' });

    const mask = table.masks[0];
    expect(mask.name).toBe('届いたマスク');
    expect(mask.width).toBe(4);
    expect(mask.height).toBe(3);
    expect(mask.isLock).toBe(true);
    expect(store.getObjects(GameTableScratchMask)).toEqual([]);
  });

  it('leaves legacy masks to a seat that may change the table, and converts them once this one may', async () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Guest;
    legacyOn('left-for-an-editor');
    const passes = vi.spyOn(LegacyScratchMaskMigrationService.prototype, 'migrate');
    const service = TestBed.inject(LegacyScratchMaskMigrationService);
    await waitFor(() => passes.mock.calls.length > 0, { description: 'the pass made on starting' });

    expect(service.migrate()).toBe(1);
    expect(table.masks).toEqual([]);

    PeerCursor.myCursor.role = PeerRole.Player;

    await waitFor(() => table.masks.length === 1, { description: 'the promoted seat to convert the mask' });
    expect(store.getObjects(GameTableScratchMask)).toEqual([]);
  });

  it('converts nothing while a replay holds the table', () => {
    const service = TestBed.inject(LegacyScratchMaskMigrationService);
    legacyOn('in-a-replay');
    setNetworkIsolated(true);

    expect(service.migrate()).toBe(1);
    expect(table.masks).toEqual([]);
  });
});
