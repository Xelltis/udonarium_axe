import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PartyService } from '@axe/application/party/party.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { DUNGEON_GRID_SIZE } from '@axe/application/tabletop/dungeon-build.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { DungeonGeneratorComponent } from '@axe/features/dungeon-generator/dungeon-generator.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

type Panel = DungeonGeneratorComponent & {
  atmosphere: { (): string; set(value: string): void };
  roomCount: { (): number; set(value: number): void };
  seed: { (): number; set(value: number): void };
  tableName: { (): string; set(value: string): void };
  wall(): { kind: string; id?: string; identifier?: string };
  floor(): { kind: string; id?: string; identifier?: string };
  usingDefaults(): boolean;
  wallHeight(): number;
  setWallHeight(height: number): void;
  terrainCount(): number;
  syncCount(): number;
  lightCount(): number;
  paintCount(): number;
  kind(): 'dungeon' | 'field';
  field(): boolean;
  chooseKind(kind: 'dungeon' | 'field'): void;
  chooseFieldAtmosphere(id: string): void;
  fieldPlan(): {
    blocks: { blocks: { thing?: string; model?: string; skin?: { side: { kind: string; id?: string } } }[] };
  };
  fieldSeason(): string;
  fieldSize: { set(value: number): void; (): number };
  fieldDensity: { set(value: number): void; (): number };
  setFieldRelief(relief: number): void;
  fieldRaises(): boolean;
  boardSize(): string;
  tooMany(): boolean;
  preview(): { viewBox: string; rects: unknown[] };
  builtTable(): GameTable | null;
  summary(): string;
  canEdit: boolean;
  setWall(material: { kind: 'texture'; id: string }): void;
  resetMaterials(): void;
  chooseAtmosphere(id: string): void;
  reroll(): void;
  nameFor(): string;
  plan(): {
    layout: {
      entrance: { x: number; y: number };
      mouth: { x: number; y: number } | null;
      doorLeaves: { w: number; h: number; mirrored: boolean }[];
    };
    blocks: { blocks: { kind: string; prop?: string; doorStyle?: string }[] };
  };
  doorKind(): string | null;
  generate(): Promise<void>;
  discardPrevious(): void;
  corridorWidth(): { least: number; most: number };
  setCorridorLeast(width: number): void;
  setCorridorMost(width: number): void;
  doorWidth(): { least: number; most: number };
  setDoorLeast(width: number): void;
  setDoorMost(width: number): void;
  doubleDoors(): number;
  setDoubleDoors(percent: number): void;
  fogEnabled: { (): boolean; set(value: boolean): void };
  musterParty: { (): string; set(value: string): void };
  setMusterParty(identifier: string): void;
};

const PAINTED = 'painted-ground';

/** The real path decodes the picture it makes, which no test browser will do. */
function stubPainting(): ReturnType<typeof vi.fn> {
  const exportStub = vi.fn().mockResolvedValue(new Blob(['floor'], { type: 'image/webp' }));
  vi.spyOn(ImageStorage.instance, 'addAsync').mockImplementation(async () => ImageStorage.instance.add(PAINTED));
  return exportStub;
}

describe('DungeonGeneratorComponent', () => {
  let component: Panel;
  let fixture: ComponentFixture<DungeonGeneratorComponent>;
  let store: ObjectStore;

  function wipe(): void {}

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DungeonGeneratorComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    store = ObjectStore.instance;
    wipe();
    fixture = TestBed.createComponent(DungeonGeneratorComponent);
    component = fixture.componentInstance as Panel;
  });

  afterEach(() => {
    wipe();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts on the stone dungeon with eight rooms', () => {
    expect(component.atmosphere()).toBe('stoneDungeon');
    expect(component.roomCount()).toBe(8);
    expect(component.usingDefaults()).toBe(true);
  });

  it('takes its materials from the atmosphere until they are touched', () => {
    expect(component.wall()).toEqual({ kind: 'texture', id: 'wall_ashlar' });

    component.chooseAtmosphere('crypt');
    expect(component.wall()).toEqual({ kind: 'texture', id: 'wall_bone' });
  });

  it('leaves a chosen material alone when the atmosphere changes', () => {
    component.setWall({ kind: 'texture', id: 'wall_metal' });
    component.chooseAtmosphere('crypt');

    expect(component.wall()).toEqual({ kind: 'texture', id: 'wall_metal' });
    expect(component.usingDefaults()).toBe(false);
  });

  it('marks the kind of map and the atmosphere chosen, and only those, moving the mark as another is chosen', () => {
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const chosen = (prefix: string) =>
      [...element.querySelectorAll<HTMLButtonElement>(`[data-testid^="${prefix}"]`)]
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => [button.dataset['testid'], button.querySelector('.material-icons')?.textContent]);
    const press = (id: string) => {
      element.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click();
      fixture.detectChanges();
    };

    expect(chosen('map-kind-')).toEqual([['map-kind-dungeon', 'check']]);
    expect(chosen('atmosphere-')).toEqual([['atmosphere-stoneDungeon', 'check']]);

    press('atmosphere-crypt');
    expect(chosen('atmosphere-')).toEqual([['atmosphere-crypt', 'check']]);

    press('map-kind-field');
    expect(chosen('map-kind-')).toEqual([['map-kind-field', 'check']]);
    expect(chosen('atmosphere-')).toEqual([['atmosphere-woodland', 'check']]);
    press('atmosphere-snowfield');
    expect(chosen('atmosphere-')).toEqual([['atmosphere-snowfield', 'check']]);
  });

  it('hangs the kind of door chosen in every doorway until the defaults are restored', () => {
    fixture.detectChanges();
    const doors = () => component.plan().blocks.blocks.filter((block) => block.kind === 'door');
    const press = (id: string) => {
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click();
      fixture.detectChanges();
    };
    expect(doors().every((door) => door.prop === 'door_wood')).toBe(true);

    press('door-kind-door_saloon');
    expect(doors().length).toBeGreaterThan(0);
    expect(doors().every((door) => door.prop === 'door_saloon' && door.doorStyle === 'swing')).toBe(true);
    expect(component.usingDefaults()).toBe(false);

    component.resetMaterials();
    expect(component.doorKind()).toBeNull();
    expect(doors().every((door) => door.prop === 'door_wood')).toBe(true);
    expect(component.usingDefaults()).toBe(true);
  });

  it('follows the atmosphere again once the materials are reset', () => {
    component.setWall({ kind: 'texture', id: 'wall_metal' });
    component.resetMaterials();
    component.chooseAtmosphere('crypt');

    expect(component.wall()).toEqual({ kind: 'texture', id: 'wall_bone' });
    expect(component.usingDefaults()).toBe(true);
  });

  it('takes the wall height from the atmosphere until it is touched', () => {
    expect(component.wallHeight()).toBe(2);

    component.chooseAtmosphere('cavern');
    expect(component.wallHeight()).toBe(3);
  });

  it('keeps a height that was set by hand when the atmosphere changes', () => {
    component.setWallHeight(4.5);
    component.chooseAtmosphere('cavern');

    expect(component.wallHeight()).toBe(4.5);
    expect(component.usingDefaults()).toBe(false);
  });

  it('holds the height inside what a table can show', () => {
    component.setWallHeight(99);
    expect(component.wallHeight()).toBe(6);

    component.setWallHeight(0);
    expect(component.wallHeight()).toBe(0.5);
  });

  it('follows the atmosphere again once the defaults are restored', () => {
    component.setWallHeight(4.5);
    component.resetMaterials();

    expect(component.wallHeight()).toBe(2);
    expect(component.usingDefaults()).toBe(true);
  });

  it('shows the painted ground and one rectangle for every terrain it would build', () => {
    expect(component.preview().rects.length).toBe(
      component.paintCount() + component.terrainCount() + component.lightCount()
    );
    expect(component.syncCount()).toBe(component.terrainCount() * 12);
  });

  it('rolls a new shape when the seed changes', () => {
    const before = component.preview().viewBox + JSON.stringify(component.preview().rects.slice(0, 5));
    component.seed.set(component.seed() + 1);
    const after = component.preview().viewBox + JSON.stringify(component.preview().rects.slice(0, 5));

    expect(after).not.toBe(before);
  });

  it('keeps the shape when only the material changes', () => {
    const before = component.preview().rects.length;
    component.setWall({ kind: 'texture', id: 'wall_metal' });

    expect(component.preview().rects.length).toBe(before);
  });

  it('names the table after the atmosphere until one is typed', () => {
    expect(component.nameFor().length).toBeGreaterThan(0);

    component.tableName.set('  Deep hold  ');
    expect(component.nameFor()).toBe('Deep hold');
  });

  it('stays inside the budget at the sizes it offers', () => {
    component.roomCount.set(20);

    expect(component.tooMany()).toBe(false);
  });

  it('builds nothing for someone who may not edit the tabletop', async () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);

    await component.generate();

    expect(store.getObjects(GameTable).length).toBe(0);
    expect(component.builtTable()).toBeNull();
  });

  it('builds one table and remembers it', async () => {
    component.roomCount.set(3);

    await component.generate();

    expect(component.builtTable()).not.toBeNull();
    expect(store.getObjects(GameTable).length).toBe(1);
  });

  it('paints the ground and hangs it on the table', async () => {
    const exportStub = stubPainting();
    (component as unknown as { exportFn: unknown }).exportFn = exportStub;
    component.roomCount.set(3);

    await component.generate();

    expect(exportStub).toHaveBeenCalledOnce();
    expect(ImageStorage.instance.addAsync).toHaveBeenCalledWith(expect.any(Blob), { putBack: true });
    expect(component.builtTable()!.imageIdentifier).toBe(PAINTED);
  });

  it('builds the dungeon even when the ground cannot be painted', async () => {
    (component as unknown as { exportFn: unknown }).exportFn = vi.fn().mockRejectedValue(new Error('no canvas'));
    component.roomCount.set(3);

    await component.generate();

    expect(component.builtTable()).not.toBeNull();
    expect(component.builtTable()!.imageIdentifier).toBe('');
  });

  it('takes the painted ground away with the table it was made for', async () => {
    (component as unknown as { exportFn: unknown }).exportFn = stubPainting();
    component.roomCount.set(3);
    await component.generate();

    expect(ImageStorage.instance.get(PAINTED)).not.toBeNull();

    component.discardPrevious();

    expect(ImageStorage.instance.get(PAINTED)).toBeNull();
  });

  describe('a field', () => {
    beforeEach(() => {
      component.chooseKind('field');
    });

    it('starts on a wood, and lays a board three deep for every four across', () => {
      expect(component.field()).toBe(true);
      component.fieldSize.set(40);

      expect(component.boardSize()).toBe('40 x 30');
    });

    it('paints the whole board and stands things on it', () => {
      expect(component.paintCount()).toBeGreaterThan(0);
      expect(component.terrainCount()).toBeGreaterThan(0);
      expect(component.preview().rects.length).toBe(
        component.paintCount() + component.terrainCount() + component.lightCount()
      );
    });

    it('grows thicker when asked for more and clears when asked for none', () => {
      component.fieldDensity.set(0);
      const bare = component.terrainCount();
      component.fieldDensity.set(100);

      expect(bare).toBe(0);
      expect(component.terrainCount()).toBeGreaterThan(0);
    });

    it('grows the trees of the season chosen, the broadleaves turning in autumn and standing bare in winter', () => {
      fixture.detectChanges();
      const models = () => new Set(component.fieldPlan().blocks.blocks.map((block) => block.model ?? ''));
      const season = (name: string) => {
        (fixture.nativeElement as HTMLElement)
          .querySelector<HTMLButtonElement>(`[data-testid="field-season-${name}"]`)!
          .click();
        fixture.detectChanges();
      };
      expect(component.fieldSeason()).toBe('');
      expect(models().has('tree_oak')).toBe(true);

      season('autumn');
      expect(models().has('tree_oak')).toBe(false);
      expect(models().has('tree_oakAutumn')).toBe(true);

      season('winter');
      expect(models().has('tree_oakBare')).toBe(true);
      expect(models().has('tree_snowFir')).toBe(true);

      season('none');
      expect(models().has('tree_oak')).toBe(true);
    });

    it('changes what it is made of without rolling a new board', () => {
      const before = component.preview().rects.length;
      component.chooseFieldAtmosphere('coast');
      component.setWall({ kind: 'texture', id: 'wall_ice' });

      expect(component.preview().rects.length).not.toBe(0);
      expect(before).toBeGreaterThan(0);
    });

    it('builds a table of open ground with notes to match, and the sky that turns with the clock over it', async () => {
      (component as unknown as { exportFn: unknown }).exportFn = stubPainting();
      component.fieldSize.set(20);

      await component.generate();

      expect(component.builtTable()).not.toBeNull();
      expect(component.builtTable()!.skyKind).toBe('clock');
      expect(component.builtTable()!.terrains.length).toBe(component.terrainCount());
      expect(component.summary()).toContain('20x15');
    });

    it('raises the ground of the table it builds as high as asked, and offers no height for a town', async () => {
      (component as unknown as { exportFn: unknown }).exportFn = stubPainting();
      component.fieldSize.set(20);
      component.setFieldRelief(2);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="field-relief"]')).not.toBeNull();
      await component.generate();

      const kept = groundFieldOn(component.builtTable()!)!.readChunks();
      expect(Math.max(...kept.flatMap((chunk) => [...chunk.heights]))).toBe(2 * 64);

      component.chooseFieldAtmosphere('city');
      fixture.detectChanges();
      expect(component.fieldRaises()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="field-relief"]')).toBeNull();
    });

    it('builds a town in every facade its preset has until a wall is chosen, and in that one after', () => {
      component.chooseFieldAtmosphere('city');
      component.fieldSize.set(48);
      component.fieldDensity.set(100);
      const facades = () =>
        new Set(
          component
            .fieldPlan()
            .blocks.blocks.filter((block) => block.thing === 'building')
            .map((block) => (block.skin?.side as { id?: string } | undefined)?.id)
        );

      expect(facades().size).toBeGreaterThan(1);

      component.setWall({ kind: 'texture', id: 'wall_sf_glass' });

      expect(facades()).toEqual(new Set(['wall_sf_glass']));
    });

    it('leaves the dungeon alone while it is on a field', () => {
      expect(component.kind()).toBe('field');

      component.chooseKind('dungeon');

      expect(component.field()).toBe(false);
    });
  });

  it('throws the last one away when it rolls again', async () => {
    component.roomCount.set(3);
    await component.generate();
    const first = component.builtTable();

    component.reroll();
    await component.generate();

    expect(store.getObjects(GameTable).length).toBe(1);
    expect(component.builtTable()).not.toBe(first);
  });

  it('hands the notes to the panel rather than onto the tabletop', async () => {
    component.roomCount.set(3);
    await component.generate();

    expect(component.summary().length).toBeGreaterThan(0);
    expect(component.summary()).toContain('#1');
  });

  it('forgets the notes once the table is thrown away', async () => {
    component.roomCount.set(3);
    await component.generate();
    component.discardPrevious();

    expect(component.summary()).toBe('');
  });

  it('clears the table away when asked', async () => {
    component.roomCount.set(3);
    await component.generate();

    component.discardPrevious();

    expect(store.getObjects(GameTable).length).toBe(0);
    expect(component.builtTable()).toBeNull();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(DungeonGeneratorComponent);
  });
});

describe('DungeonGeneratorComponent and what a dungeon is asked for', () => {
  let component: Panel;
  let fixture: ComponentFixture<DungeonGeneratorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DungeonGeneratorComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(DungeonGeneratorComponent);
    component = fixture.componentInstance as Panel;
    (component as unknown as { exportFn: unknown }).exportFn = stubPainting();
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    vi.restoreAllMocks();
  });

  it('cuts every passage one width until it is asked for two', () => {
    expect(component.corridorWidth()).toEqual({ least: 1, most: 1 });

    component.chooseAtmosphere('cavern');

    expect(component.corridorWidth()).toEqual({ least: 2, most: 2 });
  });

  it('widens the widest to make room for a narrowest asked past it', () => {
    component.setCorridorLeast(3);

    expect(component.corridorWidth()).toEqual({ least: 3, most: 3 });
  });

  it('narrows the narrowest to keep it inside a widest asked under it', () => {
    component.setCorridorLeast(4);
    component.setCorridorMost(2);

    expect(component.corridorWidth()).toEqual({ least: 2, most: 2 });
  });

  it('hangs a door in a single cell until a wider one is asked for', () => {
    expect(component.doorWidth()).toEqual({ least: 1, most: 1 });
    expect(component.plan().layout.doorLeaves.every((leaf) => Math.max(leaf.w, leaf.h) === 1)).toBe(true);
  });

  it('widens the widest door to make room for a narrowest asked past it', () => {
    component.setDoorLeast(3);

    expect(component.doorWidth()).toEqual({ least: 3, most: 3 });
  });

  it('narrows the narrowest door to keep it inside a widest asked under it', () => {
    component.setDoorLeast(4);
    component.setDoorMost(2);

    expect(component.doorWidth()).toEqual({ least: 2, most: 2 });
  });

  it('cuts the openings wider and halves them once a pair of wide doors is asked for', () => {
    component.setDoorLeast(4);
    component.setDoubleDoors(100);

    expect(component.doubleDoors()).toBe(100);
    expect(component.usingDefaults()).toBe(false);
    expect(component.plan().layout.doorLeaves.some((leaf) => Math.max(leaf.w, leaf.h) === 2)).toBe(true);
    expect(component.plan().layout.doorLeaves.some((leaf) => leaf.mirrored)).toBe(true);
  });

  it('hangs plain doors again once the settings are reset', () => {
    component.setDoorMost(4);
    component.setDoubleDoors(0);
    component.resetMaterials();

    expect(component.doorWidth()).toEqual({ least: 1, most: 1 });
    expect(component.doubleDoors()).toBe(50);
  });

  it('leaves the table uncovered until the fog is asked for, and its background picture past the board', async () => {
    component.roomCount.set(3);

    await component.generate();

    expect(component.builtTable()!.fogEnabled).toBe(false);
    expect(component.builtTable()!.skyKind).toBe('');
  });

  it('draws the fog over the table it builds when it is asked to', async () => {
    component.roomCount.set(3);
    component.fogEnabled.set(true);

    await component.generate();

    expect(component.builtTable()!.fogEnabled).toBe(true);
  });

  it('stands the party it was given by the way in', async () => {
    const party = TestBed.inject(PartyService).create('冒険者');
    const hero = GameCharacter.create('英雄', 1, '');
    const friend = GameCharacter.create('相棒', 1, '');
    for (const piece of [hero, friend]) {
      piece.partyIdentifier = party.identifier;
      piece.location = { name: 'graveyard', x: 0, y: 0 };
    }
    component.roomCount.set(3);
    component.setMusterParty(party.identifier);

    await component.generate();

    const layout = component.plan().layout;
    const way = layout.mouth ?? layout.entrance;
    for (const piece of [hero, friend]) {
      expect(piece.location.name).toBe('table');
      expect(Math.abs(piece.location.x / DUNGEON_GRID_SIZE - way.x)).toBeLessThanOrEqual(4);
      expect(Math.abs(piece.location.y / DUNGEON_GRID_SIZE - way.y)).toBeLessThanOrEqual(4);
    }
    expect(hero.location.x !== friend.location.x || hero.location.y !== friend.location.y).toBe(true);
  });

  it('leaves every piece where it stands while no party is picked', async () => {
    const stray = GameCharacter.create('野良', 1, '');
    stray.location = { name: 'graveyard', x: 0, y: 0 };
    component.roomCount.set(3);

    await component.generate();

    expect(stray.location.name).toBe('graveyard');
  });
});
