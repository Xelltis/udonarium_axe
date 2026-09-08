import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewContainerRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PartyService } from '@axe/application/party/party.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import {
  DUNGEON_GRID_SIZE,
  DungeonBuildService,
  DungeonMaterial,
} from '@axe/application/tabletop/dungeon-build.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import {
  TEXTURE_ASSET_URLS,
  TEXTURE_IDS,
  WALL_TEXTURE_ASSET_URLS,
  WALL_TEXTURE_IDS,
} from '@axe/domain/media/texture-catalog';
import {
  atmosphereById,
  clampWallHeight,
  DUNGEON_ATMOSPHERE_IDS,
  DUNGEON_ENTRANCE_STYLES,
  DungeonAtmosphereId,
  DungeonEntranceStyle,
  MAX_WALL_HEIGHT,
  MIN_WALL_HEIGHT,
} from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import {
  clampRoomCount,
  CorridorWidths,
  corridorWidthsFor,
  MAX_ROOM_COUNT,
  MIN_ROOM_COUNT,
  planDungeon,
} from '@axe/domain/tabletop/dungeon/dungeon-generator';
import {
  clampCorridorWidth,
  DungeonPoint,
  MAX_CORRIDOR_WIDTH,
  MIN_CORRIDOR_WIDTH,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { musterCells } from '@axe/domain/tabletop/dungeon/entrance-muster';
import {
  clampFieldDensity,
  clampFieldSize,
  FIELD_ATMOSPHERE_IDS,
  fieldAtmosphereById,
  FieldAtmosphereId,
  MAX_FIELD_DENSITY,
  MAX_FIELD_SIZE,
  MIN_FIELD_DENSITY,
  MIN_FIELD_SIZE,
} from '@axe/domain/tabletop/field/field-atmosphere';
import { FieldPlan, planField } from '@axe/domain/tabletop/field/field-generator';
import { GridType } from '@axe/domain/tabletop/game-table';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { MAP_HEAVY_TERRAINS, MAP_MAX_TERRAINS, syncObjectCount } from '@axe/domain/tabletop/map-blocks';
import { exportSceneToBlob } from '@axe/features/map-editor/render/export-image';
import { DungeonMaterialPickerComponent } from '@axe/features/tabletop/dungeon-generator/dungeon-material-picker.component';
import { describeDungeon } from '@axe/features/tabletop/dungeon-generator/dungeon-notes';
import { withFieldMaterials } from '@axe/features/tabletop/dungeon-generator/field-materials';
import { describeField } from '@axe/features/tabletop/dungeon-generator/field-notes';
import { buildGroundScene } from '@axe/features/tabletop/dungeon-generator/ground-scene';
import { buildMapPreview, previewColors } from '@axe/features/tabletop/dungeon-generator/map-preview';
import { TranslocoModule } from '@jsverse/transloco';

const SEED_LIMIT = 2 ** 31;

type DungeonPlan = ReturnType<typeof planDungeon>;

export type MapKind = 'dungeon' | 'field';

export const MAP_KINDS: readonly MapKind[] = ['dungeon', 'field'];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'dungeon-generator',
  templateUrl: './dungeon-generator.component.html',
  imports: [FormsModule, TranslocoModule, DungeonMaterialPickerComponent],
})
export class DungeonGeneratorComponent {
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly panelService = inject(PanelService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly dungeonBuild = inject(DungeonBuildService);
  private readonly partyService = inject(PartyService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly atmosphereIds = DUNGEON_ATMOSPHERE_IDS;
  protected readonly wallIds = WALL_TEXTURE_IDS;
  protected readonly floorIds = TEXTURE_IDS;
  protected readonly wallUrls = WALL_TEXTURE_ASSET_URLS;
  protected readonly floorUrls = TEXTURE_ASSET_URLS;
  protected readonly minRooms = MIN_ROOM_COUNT;
  protected readonly maxRooms = MAX_ROOM_COUNT;
  protected readonly heavyLimit = MAP_HEAVY_TERRAINS;
  protected readonly maxTerrains = MAP_MAX_TERRAINS;
  protected readonly entranceStyles = DUNGEON_ENTRANCE_STYLES;
  protected readonly kinds = MAP_KINDS;
  protected readonly fieldAtmosphereIds = FIELD_ATMOSPHERE_IDS;
  protected readonly minFieldSize = MIN_FIELD_SIZE;
  protected readonly maxFieldSize = MAX_FIELD_SIZE;
  protected readonly minDensity = MIN_FIELD_DENSITY;
  protected readonly maxDensity = MAX_FIELD_DENSITY;
  protected readonly minWallHeight = MIN_WALL_HEIGHT;
  protected readonly maxWallHeight = MAX_WALL_HEIGHT;
  protected readonly minCorridorWidth = MIN_CORRIDOR_WIDTH;
  protected readonly maxCorridorWidth = MAX_CORRIDOR_WIDTH;

  protected readonly kind = signal<MapKind>('dungeon');
  protected readonly atmosphere = signal<DungeonAtmosphereId>('stoneDungeon');
  protected readonly fieldAtmosphere = signal<FieldAtmosphereId>('woodland');
  protected readonly fieldSize = signal(40);
  protected readonly fieldDensity = signal(50);
  protected readonly roomCount = signal(8);
  protected readonly seed = signal(Math.floor(Math.random() * SEED_LIMIT));
  protected readonly tableName = signal('');
  protected readonly placeDoors = signal(true);
  protected readonly placeStairs = signal(true);
  protected readonly fogEnabled = signal(false);

  private readonly wallOverride = signal<DungeonMaterial | null>(null);
  private readonly floorOverride = signal<DungeonMaterial | null>(null);
  private readonly heightOverride = signal<number | null>(null);
  private readonly entranceOverride = signal<DungeonEntranceStyle | null>(null);
  private readonly corridorOverride = signal<CorridorWidths | null>(null);

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly builtTable = signal<GameTable | null>(null);
  protected readonly summary = signal('');
  private readonly floorImage = signal('');
  protected readonly copied = signal(false);

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('feature.tabletop.dungeonGenerator.title')));
  }

  protected get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  protected readonly field = computed(() => this.kind() === 'field');

  protected readonly wall = computed<DungeonMaterial>(() => {
    if (this.wallOverride()) return this.wallOverride()!;
    const id = this.field()
      ? fieldAtmosphereById(this.fieldAtmosphere()).defaultProp
      : atmosphereById(this.atmosphere()).defaultWall;
    return { kind: 'texture', id };
  });
  protected readonly floor = computed<DungeonMaterial>(() => {
    if (this.floorOverride()) return this.floorOverride()!;
    const id = this.field()
      ? fieldAtmosphereById(this.fieldAtmosphere()).defaultGround
      : atmosphereById(this.atmosphere()).defaultFloor;
    return { kind: 'texture', id };
  });
  protected readonly wallHeight = computed(() =>
    clampWallHeight(this.heightOverride() ?? atmosphereById(this.atmosphere()).wallHeight)
  );
  protected readonly entrance = computed<DungeonEntranceStyle>(
    () => this.entranceOverride() ?? atmosphereById(this.atmosphere()).entrance
  );
  /** How wide the passages are cut, which each atmosphere has its own idea of. */
  protected readonly corridorWidth = computed(() =>
    corridorWidthsFor(atmosphereById(this.atmosphere()), this.corridorOverride() ?? undefined)
  );
  protected readonly usingDefaults = computed(
    () =>
      this.wallOverride() === null &&
      this.floorOverride() === null &&
      this.heightOverride() === null &&
      this.entranceOverride() === null &&
      this.corridorOverride() === null
  );

  /**
   * What shape the cells are.
   *
   * Hexes cannot be gathered into rectangles, so a hex board pays a block for every cell and
   * is made smaller to afford it. The shape is part of the plan rather than of the building,
   * since it changes how much of a board there is to draw.
   */
  readonly gridType = signal<GridType>(GridType.SQUARE);
  readonly gridChoices: readonly GridType[] = [GridType.SQUARE, GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL];

  /** Materials do not change the shape, so a new swatch must not roll the dungeon again. */
  protected readonly plan = computed(() =>
    planDungeon(
      {
        atmosphere: this.atmosphere(),
        roomCount: this.roomCount(),
        seed: this.seed(),
        entrance: this.entrance(),
        corridorWidth: this.corridorWidth(),
        gridType: this.gridType(),
      },
      { placeDoors: this.placeDoors(), placeStairs: this.placeStairs() }
    )
  );

  /** Rolled from the shape alone, so a new swatch does not roll the field again either. */
  private readonly fieldShape = computed(() =>
    planField({
      atmosphere: this.fieldAtmosphere(),
      size: this.fieldSize(),
      density: this.fieldDensity(),
      seed: this.seed(),
      gridType: this.gridType(),
    })
  );

  protected readonly fieldPlan = computed<FieldPlan>(() => {
    const plan = this.fieldShape();
    return { ...plan, blocks: withFieldMaterials(plan.blocks, plan.atmosphere, this.floor(), this.wall()) };
  });

  protected readonly blocks = computed(() => (this.field() ? this.fieldPlan().blocks : this.plan().blocks));
  protected readonly terrainCount = computed(() => this.blocks().blocks.length);
  protected readonly lightCount = computed(() => this.blocks().lights.length);
  protected readonly paintCount = computed(() => this.blocks().paint.length);
  protected readonly syncCount = computed(() => syncObjectCount(this.blocks().blocks));
  protected readonly tooMany = computed(() => this.terrainCount() > MAP_MAX_TERRAINS);
  protected readonly heavy = computed(() => this.terrainCount() > MAP_HEAVY_TERRAINS && !this.tooMany());

  private readonly exportFn = exportSceneToBlob;

  protected readonly preview = computed(() => {
    const wall = this.wall();
    const floor = this.floor();
    const size = this.field() ? this.fieldPlan().layout : this.plan().layout;
    const colors = previewColors(
      wall.kind === 'texture' ? wall.id : '',
      floor.kind === 'texture' ? floor.id : '',
      this.field() ? '' : (this.plan().atmosphere.cave?.hazardFloor ?? '')
    );
    return buildMapPreview(size, this.blocks(), colors, this.gridType());
  });

  protected readonly roomsFound = computed(() => this.plan().layout.rooms.length);
  protected readonly roomsDiffer = computed(
    () => !this.field() && this.roomsFound() !== clampRoomCount(this.roomCount())
  );
  protected readonly boardSize = computed(() => {
    const layout = this.field() ? this.fieldPlan().layout : this.plan().layout;
    return `${layout.width} x ${layout.height}`;
  });

  protected chooseKind(kind: MapKind): void {
    this.kind.set(kind);
  }

  protected chooseAtmosphere(id: DungeonAtmosphereId): void {
    this.atmosphere.set(id);
  }

  protected chooseFieldAtmosphere(id: FieldAtmosphereId): void {
    this.fieldAtmosphere.set(id);
  }

  protected setFieldSize(size: number): void {
    this.fieldSize.set(clampFieldSize(size));
  }

  protected setFieldDensity(density: number): void {
    this.fieldDensity.set(clampFieldDensity(density));
  }

  protected setWall(material: DungeonMaterial): void {
    this.wallOverride.set(material);
  }

  protected setFloor(material: DungeonMaterial): void {
    this.floorOverride.set(material);
  }

  protected setWallHeight(height: number): void {
    this.heightOverride.set(height);
  }

  protected setEntrance(style: DungeonEntranceStyle): void {
    this.entranceOverride.set(style);
  }

  /** The narrowest a passage may be cut. Asking for wider than the widest widens that too. */
  protected setCorridorLeast(width: number): void {
    const least = clampCorridorWidth(width);
    this.corridorOverride.set({ least, most: Math.max(least, this.corridorWidth().most) });
  }

  protected setCorridorMost(width: number): void {
    const most = clampCorridorWidth(width);
    this.corridorOverride.set({ least: Math.min(most, this.corridorWidth().least), most });
  }

  /** Who walks in with the party, which is nobody until a party is picked. */
  protected readonly parties = this.partyService.parties;
  protected readonly musterParty = signal('');

  protected setMusterParty(identifier: string): void {
    this.musterParty.set(identifier);
  }

  protected resetMaterials(): void {
    this.wallOverride.set(null);
    this.floorOverride.set(null);
    this.heightOverride.set(null);
    this.entranceOverride.set(null);
    this.corridorOverride.set(null);
  }

  protected reroll(): void {
    this.seed.set(Math.floor(Math.random() * SEED_LIMIT));
  }

  protected nameFor(): string {
    const typed = this.tableName().trim();
    if (typed.length > 0) return typed;
    if (this.field()) return this.t(`feature.tabletop.dungeonGenerator.field.${this.fieldAtmosphere()}`);
    return this.t(`feature.tabletop.dungeonGenerator.atmosphere.${this.atmosphere()}`);
  }

  protected async generate(): Promise<void> {
    if (!this.canEdit || this.busy() || this.tooMany()) return;
    this.busy.set(true);
    this.progress.set(0);
    try {
      // Rolling again throws the last one away, so a shelf of rejected tables never builds up.
      this.discardPrevious();
      const name = this.nameFor();
      const plan = this.field() ? this.fieldPlan() : this.plan();
      const blocks = plan.blocks;
      const summary = this.field()
        ? describeField(plan as FieldPlan, name, this.seed(), this.t)
        : describeDungeon((plan as DungeonPlan).layout, blocks, name, this.t);
      const result = await this.dungeonBuild.build(
        plan.layout,
        plan.atmosphere,
        blocks,
        {
          name,
          wall: this.wall(),
          wallHeight: this.wallHeight(),
          floorImage: await this.paintFloor(plan),
          summary,
          gridType: this.gridType(),
          fogEnabled: this.fogEnabled(),
          muster: this.musterStands(plan),
        },
        // A map with nothing standing on it is finished the moment it starts, not NaN done.
        (done, total) => this.progress.set(total > 0 ? Math.round((done / total) * 100) : 100)
      );
      this.builtTable.set(result.table);
      this.summary.set(result.summary);
      this.copied.set(false);
      SoundEffect.play(PresetSound.blockPut);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Where each of the party stands once the map is built, or nobody where none was picked.
   *
   * The way in is the break in the outer wall where the dungeon has one, since that is the way
   * the party walked in; where it has none, the stair comes to the same thing. A field has no
   * way in to speak of, so nobody is gathered onto one.
   */
  private musterStands(plan: DungeonPlan | FieldPlan): { piece: GameCharacter; cell: DungeonPoint }[] {
    const identifier = this.musterParty();
    if (!identifier || this.field() || !('layout' in plan)) return [];
    const layout = (plan as DungeonPlan).layout;
    const party = this.partyService.membersOf(identifier);
    if (party.length < 1) return [];
    const cells = musterCells(layout, layout.mouth ?? layout.entrance, party.length);
    return cells.map((cell, index) => ({ piece: party[index], cell }));
  }

  /**
   * Paints the ground and hands back the picture the table wears.
   *
   * Nothing is left of the dungeon if the canvas will not draw, so a failure costs the
   * floor rather than the table.
   */
  private async paintFloor(plan: DungeonPlan | FieldPlan): Promise<string> {
    const floor = this.floor();
    const hazardId =
      'atmosphere' in plan ? ((plan.atmosphere as { cave?: { hazardFloor?: string } }).cave?.hazardFloor ?? '') : '';
    const scene = buildGroundScene(
      plan.layout,
      plan.blocks.paint,
      { floor, hazard: hazardId ? { kind: 'texture', id: hazardId } : floor },
      DUNGEON_GRID_SIZE,
      this.gridType()
    );
    try {
      const blob = await this.exportFn(scene, [], {
        drawGrid: false,
        resolveImageUrl: (id) => this.imageStorage.get(id)?.url ?? null,
      });
      const file = await this.imageStorage.addAsync(blob);
      this.floorImage.set(file.identifier);
      return file.identifier;
    } catch {
      this.floorImage.set('');
      return '';
    }
  }

  protected goToTable(): void {
    const table = this.builtTable();
    if (table) emitSelectGameTable({ identifier: table.identifier });
  }

  protected discardPrevious(): void {
    // Everything the generator makes is a child of its table, so the table takes it all with it.
    this.builtTable()?.destroy();
    this.builtTable.set(null);
    // The painted ground is not a child of anything, and rolling again would leave it behind.
    const painted = this.floorImage();
    if (painted) this.imageStorage.delete(painted);
    this.floorImage.set('');
    this.summary.set('');
  }

  protected async copySummary(): Promise<void> {
    const text = this.summary();
    if (text.length === 0) return;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected close(): void {
    this.panelService.close();
  }

  protected get parentViewContainerRef(): ViewContainerRef {
    return this.viewContainerRef;
  }
}
