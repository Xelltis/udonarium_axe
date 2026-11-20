import { TestBed } from '@angular/core/testing';
import { MapGenerationService } from '@axe/application/tabletop/map-generation/map-generation.service';
import { selectGameTable$ } from '@axe/core/event/domain-events';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MapGenerationService', () => {
  let maps: MapGenerationService;
  let deleted: ReturnType<typeof vi.spyOn>;
  let standing: GameTable;

  /** A table in the room, wearing a floor picture. */
  function table(floor = ''): GameTable {
    const made = new GameTable();
    made.initialize();
    made.imageIdentifier = floor;
    return made;
  }

  /** A map built on a table of its own, its floor painted as the picture named. */
  function map(floor = 'painted'): { table: GameTable; floorImage: string; summary: string } {
    return { table: table(floor), floorImage: floor, summary: '' };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    maps = TestBed.inject(MapGenerationService);
    deleted = vi.spyOn(TestBed.inject(ImageStorage), 'delete').mockImplementation(() => true);
    standing = table();
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('takes a map away as any table is taken away, with its painted floor where nothing else uses it', () => {
    const made = map();

    expect(maps.discard(made)).toBe(true);
    expect(maps.discard(null)).toBe(false);

    expect(ObjectStore.instance.get(made.table.identifier)).toBeNull();
    expect(deleted).toHaveBeenCalledWith('painted');
  });

  it('keeps the painted floor a table left in the room wears, as one made again from the same seed does', () => {
    const before = map();
    map();

    maps.discard(before);

    expect(ObjectStore.instance.get(before.table.identifier)).toBeNull();
    expect(deleted).not.toHaveBeenCalled();
  });

  it("takes away no table the room no longer holds as it was made, nor the room's last, keeping the floor worn", () => {
    const made = map();
    ObjectStore.instance.remove(made.table);
    const loaded = new GameTable(made.table.identifier);
    loaded.initialize();
    loaded.imageIdentifier = 'painted';

    expect(maps.discard(made)).toBe(false);
    expect(ObjectStore.instance.get(made.table.identifier)).toBe(loaded);

    standing.destroy();
    expect(maps.discard({ table: loaded, floorImage: 'painted', summary: '' })).toBe(false);
    expect(ObjectStore.instance.get(loaded.identifier)).toBe(loaded);
    expect(deleted).not.toHaveBeenCalled();
  });

  it('shows everyone the map made in place of one they were looking at, and leaves the view where it was otherwise', () => {
    const shown: string[] = [];
    const off = selectGameTable$.subscribe((event) => shown.push(event.identifier));
    const looked = map('looked');
    const aside = map('aside');
    TableSelecter.instance.viewTableIdentifier = looked.table.identifier;

    const first = map('first');
    expect(maps.replace(aside, first)).toBe(false);
    const second = map('second');
    expect(maps.replace(looked, second)).toBe(true);
    expect(maps.replace(null, map('third'))).toBe(false);
    off();

    expect(shown).toEqual([second.table.identifier]);
  });
});
