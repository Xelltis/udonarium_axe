import { inject, Injectable } from '@angular/core';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { SCENE_IMAGE_EXPORTER } from '@axe/application/file/scene-image-exporter';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PartyService } from '@axe/application/party/party.service';
import { DUNGEON_GRID_SIZE, DungeonBuildService } from '@axe/application/tabletop/dungeon-build.service';
import { GameTableService } from '@axe/application/tabletop/game-table.service';
import { describeDungeon } from '@axe/application/tabletop/map-generation/dungeon-notes';
import { describeField } from '@axe/application/tabletop/map-generation/field-notes';
import { buildGroundScene } from '@axe/application/tabletop/map-generation/ground-scene';
import {
  type DungeonPlan,
  mapFloorOf,
  mapPlanOf,
  type MapSettings,
  mapWallHeightOf,
  mapWallOf,
} from '@axe/application/tabletop/map-generation/map-settings';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { ImageStorage } from '@axe/core/storage/image-storage';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import type { DungeonPoint } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { musterCells } from '@axe/domain/tabletop/dungeon/entrance-muster';
import type { FieldPlan } from '@axe/domain/tabletop/field/field-generator';
import type { GameTable } from '@axe/domain/tabletop/game-table';
import { MAP_MAX_TERRAINS } from '@axe/domain/tabletop/map-blocks';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import type { GeneratedLightMotion } from '@axe/domain/tabletop/vision-types';

/** What a map is built with besides its settings: its name, whether fog covers it, who walks in, how its lights move. */
export interface MapBuildOptions {
  readonly name: string;
  readonly fogEnabled: boolean;
  /** The party whose pieces are stood at the way in of a dungeon, or empty for nobody. */
  readonly musterParty: string;
  readonly lightMotion: GeneratedLightMotion;
}

/** A map built: its table, the picture its floor was painted as, and what the master needs to run it. */
export interface GeneratedMap {
  readonly table: GameTable;
  readonly floorImage: string;
  readonly summary: string;
}

/**
 * Building a map from its settings, for the generator panel and the AI link alike: laid out, its floor
 * painted, written up for the master, built as a table of its own with the party stood at the way in,
 * and taken away again, painted floor and all, where it is not wanted. The table is not switched to;
 * whoever built it says whether it is.
 */
@Injectable({ providedIn: 'root' })
export class MapGenerationService {
  private readonly dungeonBuild = inject(DungeonBuildService);
  private readonly partyService = inject(PartyService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly tables = inject(GameTableService);
  private readonly assetRemoval = inject(AssetRemovalService);
  private readonly exportScene = inject(SCENE_IMAGE_EXPORTER);
  private readonly t = inject(TRANSLATE_FN);

  /** The name a map is given: the one typed, else its atmosphere's own. */
  nameOf(settings: Pick<MapSettings, 'kind' | 'atmosphere' | 'fieldAtmosphere'>, typed = ''): string {
    if (typed.trim().length > 0) return typed.trim();
    if (settings.kind === 'field') return this.t(`feature.tabletop.dungeonGenerator.field.${settings.fieldAtmosphere}`);
    return this.t(`feature.tabletop.dungeonGenerator.atmosphere.${settings.atmosphere}`);
  }

  /**
   * Builds the map the settings make, answering what was built, or null for one with more terrain than
   * a table may hold (`MAP_MAX_TERRAINS`), of which nothing is built.
   */
  async build(
    settings: MapSettings,
    options: MapBuildOptions,
    onProgress?: (done: number, total: number) => void
  ): Promise<GeneratedMap | null> {
    const plan = mapPlanOf(settings);
    if (plan.blocks.blocks.length > MAP_MAX_TERRAINS) return null;
    const field = settings.kind === 'field';
    const summary = field
      ? describeField(plan as FieldPlan, options.name, settings.seed, this.t)
      : describeDungeon(
          (plan as DungeonPlan).layout,
          plan.blocks,
          options.name,
          this.t,
          (plan as DungeonPlan).atmosphere.roleNames
        );
    const floorImage = await this.paintFloor(plan, settings);
    const built = await this.dungeonBuild.build(
      plan.layout,
      plan.atmosphere,
      plan.blocks,
      {
        name: options.name,
        wall: mapWallOf(settings),
        wallHeight: mapWallHeightOf(settings),
        floorImage,
        summary,
        gridType: settings.gridType,
        fogEnabled: options.fogEnabled,
        muster: this.musterStands(settings, plan, options.musterParty),
        ground: plan.layout.relief ?? null,
        skyKind: field ? 'clock' : '',
        lightMotion: options.lightMotion,
      },
      onProgress
    );
    SoundEffect.play(PresetSound.blockPut);
    return { table: built.table, floorImage, summary: built.summary };
  }

  /**
   * Takes a map built here away as any table is taken away (`GameTableService.remove`): only a table
   * still in the room and not its last, with everything on it, on a seat that may change the table.
   * Its painted floor, a child of nothing, goes with it only where nothing left in the room uses the
   * picture, as a map made again from the same seed, or a room loaded since, may. Answers whether the
   * table was taken away.
   */
  discard(map: GeneratedMap | null): boolean {
    if (!map) return false;
    const removed = this.tables.remove(map.table);
    if (map.floorImage && this.assetRemoval.countUses([map.floorImage]) === 0) this.imageStorage.delete(map.floorImage);
    return removed;
  }

  /**
   * Takes away the map another was made in place of (see {@link discard}), and where everyone was
   * looking at it, shows everyone the one made in its place instead, before it goes, rather than
   * whichever table is left first; answers whether it did.
   */
  replace(previous: GeneratedMap | null, made: GeneratedMap): boolean {
    const shownInstead =
      previous !== null &&
      this.tables.mayRemove(previous.table) &&
      TableSelecter.instance.tableInView === previous.table;
    if (shownInstead) emitSelectGameTable({ identifier: made.table.identifier });
    this.discard(previous);
    return shownInstead;
  }

  /**
   * Where each of the party stands once the map is built, or nobody where none was picked. The way in
   * is the break in the outer wall where the dungeon has one, else its stair; open country has no way
   * in to speak of, so nobody is gathered onto one.
   */
  private musterStands(
    settings: MapSettings,
    plan: DungeonPlan | FieldPlan,
    party: string
  ): { piece: GameCharacter; cell: DungeonPoint }[] {
    if (!party || settings.kind === 'field') return [];
    const layout = (plan as DungeonPlan).layout;
    const members = this.partyService.membersOf(party);
    if (members.length < 1) return [];
    return musterCells(layout, layout.mouth ?? layout.entrance, members.length).map((cell, index) => ({
      piece: members[index],
      cell,
    }));
  }

  /**
   * Paints the ground and hands back the picture the table wears. Nothing is left of the map if the
   * canvas will not draw, so a failure costs the floor rather than the table.
   */
  private async paintFloor(plan: DungeonPlan | FieldPlan, settings: MapSettings): Promise<string> {
    const floor = mapFloorOf(settings);
    const hazardId = (plan.atmosphere as { cave?: { hazardFloor?: string } }).cave?.hazardFloor ?? '';
    const scene = buildGroundScene(
      plan.layout,
      plan.blocks.paint,
      { floor, hazard: hazardId ? { kind: 'texture', id: hazardId } : floor },
      DUNGEON_GRID_SIZE,
      settings.gridType
    );
    try {
      const blob = await this.exportScene(scene, [], {
        drawGrid: false,
        resolveImageUrl: (id) => this.imageStorage.get(id)?.url ?? null,
      });
      return (await this.imageStorage.addAsync(blob, { putBack: true }))?.identifier ?? '';
    } catch {
      return '';
    }
  }
}
