import { TestBed } from '@angular/core/testing';
import { MapGenerationService } from '@axe/application/tabletop/map-generation/map-generation.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import type { GameTable } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MapGenerationService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] }));

  it('takes a map away with its painted floor, which is a child of nothing', () => {
    const destroy = vi.fn();
    const deleted = vi.spyOn(TestBed.inject(ImageStorage), 'delete').mockImplementation(() => true);

    TestBed.inject(MapGenerationService).discard({
      table: { destroy } as unknown as GameTable,
      floorImage: 'painted',
      summary: '',
    });
    TestBed.inject(MapGenerationService).discard(null);

    expect(destroy).toHaveBeenCalledOnce();
    expect(deleted).toHaveBeenCalledWith('painted');
  });

  it('names a map as typed, else by its atmosphere', () => {
    const maps = TestBed.inject(MapGenerationService);
    const dungeon = { kind: 'dungeon', atmosphere: 'stoneDungeon', fieldAtmosphere: 'woodland' } as const;

    expect(maps.nameOf(dungeon, '  古城  ')).toBe('古城');
    expect(maps.nameOf(dungeon)).not.toBe('');
    expect(maps.nameOf({ ...dungeon, kind: 'field' })).not.toBe(maps.nameOf(dungeon));
  });
});
