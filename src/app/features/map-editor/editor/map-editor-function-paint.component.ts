import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { DungeonBuildService } from '@axe/application/tabletop/dungeon-build.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { resourceNamesOf } from '@axe/domain/character/resource-catalog';
import { ambiencePalette } from '@axe/domain/effect/ambience/ambience-kind';
import { isBuiltinMaterial } from '@axe/domain/media/builtin-materials';
import { CutIn } from '@axe/domain/media/cut-in';
import { ImageTag } from '@axe/domain/media/image-tag';
import {
  TEXTURE_ASSET_URLS,
  TEXTURE_BASE_COLOR,
  TEXTURE_IDS,
  TEXTURE_IMAGE_TAG,
  WALL_TEXTURE_ASSET_URLS,
  WALL_TEXTURE_BASE_COLOR,
  WALL_TEXTURE_IDS,
} from '@axe/domain/media/texture-catalog';
import {
  encodeSwitchDefinition,
  parseSwitchDefinition,
  SwitchDefinition,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import {
  HazardPaintSpec,
  MAP_FUNCTION_ROLES,
  MaskPaintSpec,
  MoveCostPaintSpec,
  TERRAIN_FACE_KEYS,
  TerrainFaceImages,
  TerrainPaintSpec,
  TriggerPaintSpec,
  waterDepthOf,
  waterDirtOf,
  waterFlowDirectionOf,
  waterFlowSpeedOf,
  waterLeavesOf,
  waterTurbidityOf,
} from '@axe/domain/tabletop/function-paint';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { HAZARD_KINDS, hazardPresetOf } from '@axe/domain/tabletop/hazard-presets';
import { asShownTo, SHOWN_TO, ShownTo } from '@axe/domain/tabletop/shown-to';
import { DEFAULT_MOVE_COST_ROAD_COLOR, MOST_MOVE_COST_EXTRA } from '@axe/domain/tabletop/table-move-cost';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TerrainViewState } from '@axe/domain/tabletop/terrain';
import { asTriggerRepeat, TRIGGER_REPEATS, TriggerRepeat } from '@axe/domain/tabletop/trigger-event';
import { TRIGGER_MOMENTS, TRIGGER_TARGETS } from '@axe/domain/tabletop/trigger-event';
import { FLOW_DIRECTIONS } from '@axe/domain/tabletop/water/water-flow';
import {
  WATER_PRESET_IDS,
  type WaterPresetId,
  waterPresetNamed,
  waterPresetOf,
} from '@axe/domain/tabletop/water/water-presets';
import { MAX_SURFACE_CELLS } from '@axe/domain/tabletop/water/water-surface';
import { EditorTool, MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TextureIntakeService } from '@axe/features/map-editor/editor/texture-intake.service';
import { SwitchDefinitionFieldsComponent } from '@axe/features/tabletop/board-switch/switch-definition-fields.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What the one movement picker holds for a road.
 *
 * The picker runs from ground nobody may enter, through nought and up to nine steps over; a
 * road is easier than plain ground, so it sits at the other end, below the lot.
 */
const MOVE_COST_ROAD = -1;

/**
 * The settings of the brush that paints what a cell does: which role it paints, and how the wall,
 * the water, the cost of crossing, the mask or the trigger it lays down is set up.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'map-editor-function-paint',
  templateUrl: './map-editor-function-paint.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule, SwitchDefinitionFieldsComponent],
})
export class MapEditorFunctionPaintComponent {
  protected readonly state = inject(MapEditorState);
  private readonly imageStorage = inject(ImageStorage);
  private readonly dungeonBuild = inject(DungeonBuildService);
  private readonly textureIntake = inject(TextureIntakeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly modalService = inject(ModalService);

  private readonly faceTextureInput = viewChild<ElementRef<HTMLInputElement>>('faceTextureInput');

  /** Asks the editor to take up the painting or the erasing brush. */
  readonly toolChosen = output<EditorTool>();

  protected readonly functionTools: EditorTool[] = ['functionPaint', 'functionErase'];

  protected readonly functionRoles = MAP_FUNCTION_ROLES;

  protected setTerrainPaint(patch: Partial<TerrainPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, terrain: { ...spec.terrain, ...patch } });
  }

  protected readonly triggerRepeats = TRIGGER_REPEATS;

  /** How often the brush's ground has a go, reading a brush that only ever said whether it had one. */
  protected triggerRepeat(): TriggerRepeat {
    const spec = this.state.functionSpec().trigger;
    if (spec.repeat.length > 0) return asTriggerRepeat(spec.repeat);
    return spec.once ? 'once' : 'always';
  }

  /**
   * Writes the newer answer and the older one together.
   *
   * A peer that has never heard of the finer answer reads the plain yes or no beside it, so a
   * stretch with one go in it is still spent for them.
   */
  protected setTriggerRepeat(repeat: TriggerRepeat): void {
    this.setTriggerPaint({ repeat, once: repeat === 'once' });
  }

  protected readonly hazardKinds = HAZARD_KINDS;

  /** The highest the water brush may stand the surface over the floor, in cells. */
  protected readonly maxWaterDepth = MAX_SURFACE_CELLS;

  /** What crossing the painted ground costs where the brush leaves it to the kind. */
  protected readonly hazardKindExtraCost = computed(
    () => hazardPresetOf(this.state.functionSpec().hazard.kind).extraCost
  );

  /** Sets how deep the water brush paints, held to tenths of a cell as the table reads it back. */
  protected setWaterDepth(value: unknown): void {
    this.setHazardPaint({ depth: waterDepthOf(value) });
  }

  /** How murky the water brush paints, as a percentage. */
  protected readonly waterTurbidityPercent = computed(() =>
    Math.round(this.state.functionSpec().hazard.turbidity * 100)
  );

  /** Sets how murky the water brush paints, from a percentage. */
  protected setWaterTurbidity(percent: unknown): void {
    this.setHazardPaint({ turbidity: waterTurbidityOf(Number(percent) / 100) });
  }

  /** How dirty the water brush paints, as a percentage. */
  protected readonly waterDirtPercent = computed(() => Math.round(this.state.functionSpec().hazard.dirt * 100));

  /** Sets how dirty the water brush paints, from a percentage. */
  protected setWaterDirt(percent: unknown): void {
    this.setHazardPaint({ dirt: waterDirtOf(Number(percent) / 100) });
  }

  /** How much of the water the brush lays floating leaves over, as a percentage. */
  protected readonly waterLeavesPercent = computed(() => Math.round(this.state.functionSpec().hazard.leaves * 100));

  /** Sets how much of the water the brush lays floating leaves over, from a percentage. */
  protected setWaterLeaves(percent: unknown): void {
    this.setHazardPaint({ leaves: waterLeavesOf(Number(percent) / 100) });
  }

  /** How fast the water brush paints the water flowing, as a percentage. */
  protected readonly waterFlowSpeedPercent = computed(() =>
    Math.round(this.state.functionSpec().hazard.flowSpeed * 100)
  );

  /** Sets how fast the water brush paints the water flowing, from a percentage. */
  protected setWaterFlowSpeed(percent: unknown): void {
    this.setHazardPaint({ flowSpeed: waterFlowSpeedOf(Number(percent) / 100) });
  }

  /** The ways the water brush can paint the water flowing. */
  protected readonly flowDirections = FLOW_DIRECTIONS;

  /** Sets which way the water brush paints the water flowing, in degrees clockwise from the top. */
  protected setWaterFlowDirection(direction: unknown): void {
    this.setHazardPaint({ flowDirection: waterFlowDirectionOf(direction) });
  }

  protected readonly waterPresets = WATER_PRESET_IDS;

  /** Which look the water brush paints, or null where its settings match none of them. */
  protected readonly waterPreset = computed(() => {
    const hazard = this.state.functionSpec().hazard;
    return waterPresetOf(hazard.color, hazard.turbidity, hazard.dirt, hazard.leaves);
  });

  /** Sets the water brush to one look: its colour, murkiness and dirt at once. */
  protected setWaterPreset(id: WaterPresetId | null): void {
    const preset = waterPresetNamed(id);
    if (preset) {
      this.setHazardPaint({
        color: preset.color,
        turbidity: preset.turbidity,
        dirt: preset.dirt,
        leaves: preset.leaves,
      });
    }
  }

  /** The colour the water brush paints in, shown as the colour of water itself where none is set. */
  protected readonly waterColor = computed(
    () => this.state.functionSpec().hazard.color || ambiencePalette('water').primary
  );

  protected setHazardPaint(patch: Partial<HazardPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, hazard: { ...spec.hazard, ...patch } });
  }

  protected setMoveCostPaint(patch: Partial<MoveCostPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, moveCost: { ...spec.moveCost, ...patch } });
  }

  /** The steps a brush may charge, which the reader picks between along with shutting the cell. */
  protected readonly moveCostSteps = Array.from({ length: MOST_MOVE_COST_EXTRA }, (_, step) => step + 1);

  /** What the picker holds for a road, which is the one value below the one that shuts a cell. */
  protected readonly roadCharge = MOVE_COST_ROAD;

  /**
   * What the brush costs as one number: nought is ground nobody may enter, and below nought is
   * a road, which is the one painting that makes the going easier rather than harder.
   */
  protected moveCostCharge(): number {
    const spec = this.state.functionSpec().moveCost;
    if (spec.blocks) return 0;
    return spec.halves ? MOVE_COST_ROAD : spec.extraCost;
  }

  protected setMoveCostCharge(charge: number): void {
    if (charge === 0) {
      this.setMoveCostPaint({ blocks: true, halves: false });
      return;
    }
    if (charge < 0) {
      this.setMoveCostPaint({ blocks: false, halves: true, color: DEFAULT_MOVE_COST_ROAD_COLOR });
      return;
    }
    this.setMoveCostPaint({ blocks: false, halves: false, extraCost: charge });
  }

  protected setMaskPaint(patch: Partial<MaskPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, mask: { ...spec.mask, ...patch } });
  }

  protected readonly shownTo = SHOWN_TO;

  /** Who the brush shows its ground to, reading a brush painted before there was a middle answer. */
  protected triggerShownTo(): ShownTo {
    const spec = this.state.functionSpec().trigger;
    return asShownTo(spec.shownTo, spec.open ? 'room' : 'master');
  }

  /** Written to both answers, so that a peer that knows only the older one still reads it right. */
  protected setTriggerShownTo(shown: ShownTo): void {
    this.setTriggerPaint({ shownTo: shown, open: shown === 'room' });
  }

  protected setTriggerPaint(patch: Partial<TriggerPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, trigger: { ...spec.trigger, ...patch } });
  }

  protected readonly triggerMoments = TRIGGER_MOMENTS;
  protected readonly triggerTargets = TRIGGER_TARGETS;

  /** What pressing the brush's ground does, where it paints ground that is pressed. */
  protected readonly pressDefinition = computed<SwitchDefinition>(() =>
    parseSwitchDefinition(this.state.functionSpec().trigger.press)
  );

  /** Writes a change to what pressing the brush's ground does onto what the brush says now. */
  protected setPressDefinition(change: Partial<SwitchDefinition>): void {
    const held = parseSwitchDefinition(this.state.functionSpec().trigger.press);
    this.setTriggerPaint({ press: encodeSwitchDefinition({ ...held, ...change }) });
  }

  /** The effects the room has to play, offered by name the way chat and the sheets name one. */
  protected readonly effectNames = computed<string[]>(() =>
    this.effectLibrary
      .presets()
      .map((preset) => preset.name.trim())
      .filter((name) => name.length > 0)
      .sort()
  );

  /**
   * The resources the room's pieces are carrying, offered rather than left to be remembered.
   *
   * A trap takes from a resource by name, and a name nobody carries takes nothing at all. The
   * names on the table are the ones worth offering, so the field says what there is to hit.
   */
  private readonly statusAilments = inject(StatusAilmentService);
  private readonly audioStorage = inject(AudioStorage);

  protected readonly resourceNames = computed<string[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return resourceNamesOf(this.objectStore.getObjects<GameCharacter>(GameCharacter));
  });

  /**
   * The states the room keeps, offered to the brush that leaves a piece in one.
   *
   * A name the room has never heard of still works, so this is a list of what there is rather
   * than a list of what is allowed.
   */
  protected readonly ailmentNames = computed<string[]>(() => this.statusAilments.ailments().map((held) => held.name));

  /**
   * The sounds and cut-ins the room has, offered by name to the ground that plays one.
   *
   * Only a name that matches one and no other is any use, so a name two things answer to is
   * left off: the ground would have no way of telling which was meant.
   */
  protected readonly soundNames = computed<string[]>(() => {
    this.objectChange.fileVersion();
    return onlyOnce(this.audioStorage.audios.map((held) => held.name.trim()));
  });

  protected readonly cutInNames = computed<string[]>(() => {
    this.objectChange.collectionOf(CutIn.aliasName)();
    return onlyOnce(this.objectStore.getObjects<CutIn>(CutIn).map((held) => held.name.trim()));
  });

  /**
   * The other tables of the room, offered to the pitfall that opens onto one.
   *
   * The table being edited is left off the list: ground that carried the room to the table it
   * is already looking at would be a hole into the room it is already in.
   */
  protected readonly otherTables = computed<GameTable[]>(() => {
    this.objectChange.collectionOf(GameTable.aliasName)();
    const here = this.tableSelecter.viewTableIdentifier;
    return this.objectStore.getObjects<GameTable>(GameTable).filter((table) => table.identifier !== here);
  });

  protected readonly terrainFaces = TERRAIN_FACE_KEYS;

  protected readonly terrainModes = [
    { mode: TerrainViewState.ALL, key: 'both' },
    { mode: TerrainViewState.WALL, key: 'wall' },
    { mode: TerrainViewState.FLOOR, key: 'floor' },
  ];

  protected faceImageUrl(face: keyof TerrainFaceImages): string | null {
    const id = this.state.functionSpec().terrain.images[face];
    return id ? (this.imageStorage.get(id)?.url ?? null) : null;
  }

  /** Picks the picture one face of a painted wall wears from the whole image library. */
  protected async chooseFaceImage(face: keyof TerrainFaceImages): Promise<void> {
    const id = await this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).catch(() => null);
    if (id === null) return;
    this.wearFaceImage(face, id);
  }

  protected clearFaceImage(face: keyof TerrainFaceImages): void {
    this.setTerrainPaint({ images: { ...this.state.functionSpec().terrain.images, [face]: '' } });
  }

  protected readonly wallTextureIds = WALL_TEXTURE_IDS;
  protected readonly wallTextureAssetUrls = WALL_TEXTURE_ASSET_URLS;
  protected readonly wallTextureBaseColor = WALL_TEXTURE_BASE_COLOR;
  protected readonly groundTextureIds = TEXTURE_IDS;
  protected readonly textureAssetUrls = TEXTURE_ASSET_URLS;
  protected readonly textureBaseColor = TEXTURE_BASE_COLOR;

  protected readonly faceTexturesOpen = signal<string>('');
  private faceTextureAwaiting: keyof TerrainFaceImages | null = null;

  protected toggleFaceTextures(face: keyof TerrainFaceImages): void {
    this.faceTexturesOpen.update((held) => (held === face ? '' : face));
  }

  /** Dresses one face in a picture that ships with the room, the way the dungeons are built. */
  protected chooseFaceTexture(face: keyof TerrainFaceImages, url: string): void {
    const identifier = this.dungeonBuild.registerAsset(url);
    if (identifier.length < 1) return;
    this.wearFaceImage(face, identifier);
  }

  protected readonly faceTextures = computed<ImageFile[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('image-tag')();
    this.tagLock.track();
    // What the tool is built with is shown by its own swatches here, and it is in the library
    // as well, so it is left out of this list rather than offered twice over.
    return ImageTag.searchImages([TEXTURE_IMAGE_TAG], this.rolePermission.canSeeHidden(), this.tagLock.hides).filter(
      (file) => !isBuiltinMaterial(file.identifier)
    );
  });

  protected chooseFaceImageTexture(face: keyof TerrainFaceImages, file: ImageFile): void {
    this.wearFaceImage(face, file.identifier);
  }

  protected addFaceTexture(face: keyof TerrainFaceImages): void {
    this.faceTextureAwaiting = face;
    this.faceTextureInput()?.nativeElement.click();
  }

  protected async onFaceTextureFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const face = this.faceTextureAwaiting;
    this.faceTextureAwaiting = null;
    if (!file || !face) return;
    const imageFile = await this.textureIntake.takeIn(file);
    if (!imageFile) return;
    this.wearFaceImage(face, imageFile.identifier);
  }

  private wearFaceImage(face: keyof TerrainFaceImages, identifier: string): void {
    this.setTerrainPaint({ images: { ...this.state.functionSpec().terrain.images, [face]: identifier } });
    this.faceTexturesOpen.set('');
  }
}

/** The names that answer for one thing only, since a name two things share names neither. */
function onlyOnce(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);
  return [...seen.entries()].filter(([name, count]) => name.length > 0 && count === 1).map(([name]) => name);
}
