import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BoardSceneService } from '@axe/application/tabletop/board-scene.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import {
  type AmbienceKind,
  DEFAULT_AMBIENCE_DENSITY,
  SKY_AMBIENCE_KINDS,
} from '@axe/domain/effect/ambience/ambience-kind';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { Playlist } from '@axe/domain/media/playlist';
import { soundFileName } from '@axe/domain/media/preset-sound-labels';
import { encodeCutInIdentifiers, parseCutInIdentifiers } from '@axe/domain/media/table-cut-in';
import { BoardScene } from '@axe/domain/scene/board-scene';
import {
  BOARD_SCENE_PART_FIELDS,
  type BoardSceneFields,
  type BoardScenePart,
  SCENE_NO_PICTURE,
  SCENE_WALL_SIDES,
  sceneBgsOf,
  scenePartsOf,
  scenePeriodOf,
  scenePictureIn,
  sceneToggleOf,
  type SceneWallSide,
  sceneWallsShownOf,
  sceneWeatherOf,
} from '@axe/domain/scene/board-scene-parts';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { foregroundFitOf, foregroundOpacityOf, TABLE_FOREGROUND_FITS } from '@axe/domain/tabletop/table-foreground';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import { NgSelectModule } from '@ng-select/ng-select';

/** The fields a scene names a picture in. */
type PictureField =
  | 'floorImageIdentifier'
  | 'backgroundImageIdentifier'
  | 'foregroundImageIdentifier'
  | 'northWallImageIdentifier'
  | 'eastWallImageIdentifier'
  | 'southWallImageIdentifier'
  | 'westWallImageIdentifier';

const WALL_PICTURE_FIELD: Record<SceneWallSide, PictureField> = {
  north: 'northWallImageIdentifier',
  east: 'eastWallImageIdentifier',
  south: 'southWallImageIdentifier',
  west: 'westWallImageIdentifier',
};

/** The parts turned on and off with a box of their own, in the order they are listed. */
const SWITCHED_PARTS: readonly BoardScenePart[] = [
  'table',
  'floor',
  'background',
  'walls',
  'foreground',
  'weather',
  'darkness',
  'fog',
  'bgm',
  'bgs',
  'clock',
];

/**
 * Where a scene is put together, part by part: each part the scene changes has its box ticked
 * and is set below it, and a part left unticked is left as it is when the scene is put on. Ticking a
 * part fills it from the table as it stands and what the room hears, to be changed from there.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scene-editor',
  templateUrl: './scene-editor.component.html',
  imports: [FormsModule, NgTemplateOutlet, NgSelectModule, NgSelectWindowDirective, SafePipe, TranslocoModule],
})
export class SceneEditorComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);
  private readonly imageService = inject(ImageService);
  private readonly modalService = inject(ModalService);
  private readonly scenes = inject(BoardSceneService);
  private readonly clock = inject(GameClockService);
  private readonly t = inject(TRANSLATE_FN);

  readonly scene = input.required<BoardScene>();
  readonly canEdit = input(false);
  /** The scene is to be put on, as it stands. */
  readonly apply = output<void>();
  /** The table as it stands is to be written over the scene. */
  readonly overwrite = output<void>();

  protected readonly switchedParts = SWITCHED_PARTS;
  protected readonly wallSides = SCENE_WALL_SIDES;
  protected readonly wallPictureField = WALL_PICTURE_FIELD;
  protected readonly foregroundFits = TABLE_FOREGROUND_FITS;
  protected readonly weatherKinds = SKY_AMBIENCE_KINDS;
  protected readonly noPicture = SCENE_NO_PICTURE;

  protected readonly fieldClass =
    'rounded-ui-sm border-ui-border-panel bg-ui-input text-ui-text focus:border-ui-accent box-border min-w-0 border border-solid px-2 py-1 text-[12px] transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50';
  protected readonly smallButtonClass =
    'rounded-ui-sm border-ui-border-panel bg-ui-input text-ui-muted hover:border-ui-accent hover:text-ui-accent m-0 inline-flex cursor-pointer items-center gap-1 border border-solid px-2 py-1 text-[11px] whitespace-nowrap transition-colors hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50 [&_.material-icons]:text-[14px]!';
  protected readonly thumbClass =
    'rounded-ui-sm border-ui-border-panel bg-ui-input text-ui-dim hover:border-ui-accent flex h-12 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden border border-solid p-0 text-[10px] transition-colors hover:shadow-none';

  /**
   * The scene as it now stands, read again whenever anybody changes it. It is the same object
   * every time, so it always counts as changed, or nothing reading it would hear of a change.
   */
  protected readonly current = computed(
    () => {
      const scene = this.scene();
      this.objectChange.versionOf(scene.identifier)();
      return scene;
    },
    { equal: () => false }
  );

  /** The parts the scene changes. */
  protected readonly parts = computed<ReadonlySet<BoardScenePart>>(() => new Set(scenePartsOf(this.current())));

  protected readonly tables = computed(() => {
    this.objectChange.collectionOf(GameTable.aliasName)();
    return this.objectStore.getObjects(GameTable).map((table) => {
      this.objectChange.versionOf(table.identifier)();
      return { identifier: table.identifier, name: table.name };
    });
  });

  /** Whether the table the scene shows is not here by its identifier, as after a save read back. */
  protected readonly tableMissing = computed(() => {
    const scene = this.current();
    return !this.tables().some((table) => table.identifier === scene.tableIdentifier);
  });

  /** The room's music, as the jukebox lists it: neither sound effects nor background sounds. */
  protected readonly musicTracks = computed(() => this.soundsTagged((tag) => tag !== 'SE' && tag !== AUDIO_TAG_BGS));
  protected readonly backgroundSounds = computed(() => this.soundsTagged((tag) => tag === AUDIO_TAG_BGS));

  protected readonly playlists = computed(() => {
    this.objectChange.collectionOf(Playlist.aliasName)();
    return Playlist.all().map((playlist) => {
      this.objectChange.versionOf(playlist.identifier)();
      const name = (playlist.name ?? '').trim();
      const label =
        name ||
        this.t(
          playlist.isDefault ? 'feature.media.jukebox.playlistDefaultName' : 'feature.media.jukebox.playlistUntitled'
        );
      return { identifier: playlist.identifier, name, label };
    });
  });

  protected readonly cutIns = computed(() => {
    this.objectChange.collectionOf(CutIn.aliasName)();
    return this.objectStore.getObjects(CutIn).map((cutIn) => ({ identifier: cutIn.identifier, name: cutIn.name }));
  });

  protected readonly chatTabs = computed(() => {
    this.objectChange.collectionOf('chat-tab')();
    return ChatTabList.instance.chatTabs.map((tab) => ({ identifier: tab.identifier, name: tab.name }));
  });

  protected readonly periods = this.clock.periods;
  protected readonly clockTellsHours = computed(() => this.clock.clock().mode === 'hours');

  /**
   * Whether one of the cut-ins chosen plays music of its own, which stops the room's: put on with
   * the scene's own music, it would cut that off.
   */
  protected readonly cutInStopsMusic = computed(() => {
    if (!this.parts().has('bgm')) return false;
    return parseCutInIdentifiers(this.current().cutInIdentifiers).some((identifier) => {
      const cutIn = this.objectStore.get<CutIn>(identifier);
      return cutIn instanceof CutIn && cutIn.tagName === '' && `${cutIn.audioIdentifier ?? ''}`.length > 0;
    });
  });

  protected isOn(part: BoardScenePart): boolean {
    return this.parts().has(part);
  }

  /**
   * Ticks a part, filling it from the table as it stands and what the room hears, or unticks it,
   * emptying it so the scene leaves it alone. Music and background sounds the room is not playing
   * start as silence.
   */
  protected setPart(part: BoardScenePart, on: boolean): void {
    if (!this.canEdit()) return;
    const fields = BOARD_SCENE_PART_FIELDS[part];
    if (!on) {
      this.write(Object.fromEntries(fields.map((field) => [field, ''])) as Partial<BoardSceneFields>);
      return;
    }
    const now = this.scenes.capture();
    const taken: Partial<Record<keyof BoardSceneFields, unknown>> = {};
    for (const field of fields) if (now[field] !== undefined) taken[field] = now[field];
    if (part === 'bgm' && !now.bgm) taken.bgm = 'stop';
    if (part === 'bgs' && !now.bgs) taken.bgs = 'stop';
    if (part === 'clock') taken.clockPeriod = `${this.clock.clock().period}`;
    if (part === 'table' && !now.tableIdentifier) return;
    this.write(taken as Partial<BoardSceneFields>);
  }

  protected rename(name: string): void {
    this.write({ name: name.trim() });
  }

  protected setTable(identifier: string): void {
    const table = this.objectStore.get<GameTable>(identifier);
    if (table instanceof GameTable) this.write({ tableIdentifier: table.identifier, tableName: table.name });
  }

  /** What a scene puts in a picture's place, as shown: null for none taken away, else the picture. */
  protected pictureOf(field: PictureField): { url: string } | null {
    this.objectChange.fileVersion();
    const picture = scenePictureIn(this.current()[field]);
    if (!picture) return null;
    const image = this.imageService.getEmptyOr(picture);
    return image.isEmpty ? { url: '' } : { url: image.url };
  }

  /** Opens the image picker for a picture of the scene; the empty picture chosen takes the picture away. */
  protected pickPicture(field: PictureField): void {
    if (!this.canEdit()) return;
    void this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!value) return;
      this.write({ [field]: value === 'null' ? SCENE_NO_PICTURE : value });
    });
  }

  protected clearPicture(field: PictureField): void {
    this.write({ [field]: SCENE_NO_PICTURE });
  }

  protected backgroundFilter(): string {
    return `${this.current().backgroundFilter ?? ''}` || 'none';
  }

  protected wallShown(side: SceneWallSide): boolean {
    return sceneWallsShownOf(this.current().wallsShown)[side] === true;
  }

  protected setWallShown(side: SceneWallSide, shown: boolean): void {
    this.write({ wallsShown: JSON.stringify({ ...sceneWallsShownOf(this.current().wallsShown), [side]: shown }) });
  }

  protected foregroundOpacity(): number {
    return Math.round(foregroundOpacityOf(this.current().foregroundOpacity) * 100);
  }

  protected setForegroundOpacity(percent: number): void {
    this.write({ foregroundOpacity: `${foregroundOpacityOf(Number(percent) / 100)}` });
  }

  protected foregroundFit(): string {
    return foregroundFitOf(this.current().foregroundFit);
  }

  protected weather(): { kind: string; color: string; density: number } {
    return sceneWeatherOf(this.current().weather) ?? { kind: '', color: '', density: DEFAULT_AMBIENCE_DENSITY };
  }

  protected setWeather(change: Partial<{ kind: string; color: string; density: number }>): void {
    this.write({ weather: JSON.stringify({ ...this.weather(), ...change }) });
  }

  protected weatherKindLabel(kind: AmbienceKind): string {
    return this.t(`feature.ambience.kind.${kind}`);
  }

  protected toggleOf(part: 'darkness' | 'fog'): string {
    return sceneToggleOf(this.current()[part]) ? 'on' : 'off';
  }

  /** The background sounds the scene leaves playing, the same list until the scene changes. */
  protected readonly bgsChoice = computed<string[]>(() => {
    const bgs = sceneBgsOf(this.current());
    return bgs?.mode === 'replace' ? [...bgs.identifiers] : [];
  });

  protected setBgsChoice(identifiers: readonly string[]): void {
    this.write(
      identifiers.length > 0
        ? { bgs: 'replace', bgsIdentifiers: encodeCutInIdentifiers(identifiers) }
        : { bgs: 'stop', bgsIdentifiers: '' }
    );
  }

  protected bgmPlaylist(): string {
    const scene = this.current();
    const named = this.playlists().find(
      (playlist) => playlist.identifier === scene.bgmPlaylistIdentifier || playlist.name === scene.bgmPlaylistName
    );
    return named?.identifier ?? '';
  }

  protected setBgmPlaylist(identifier: string): void {
    const playlist = this.playlists().find((candidate) => candidate.identifier === identifier);
    if (playlist) this.write({ bgmPlaylistIdentifier: playlist.identifier, bgmPlaylistName: playlist.name });
  }

  /** The cut-ins the scene plays, the same list until the scene changes. */
  protected readonly cutInChoice = computed<string[]>(() => parseCutInIdentifiers(this.current().cutInIdentifiers));

  protected setCutInChoice(identifiers: readonly string[]): void {
    this.write({ cutInIdentifiers: encodeCutInIdentifiers(identifiers) });
  }

  protected period(): number | null {
    return scenePeriodOf(this.current().clockPeriod);
  }

  protected setPeriod(period: number): void {
    this.write({ clockPeriod: `${period}` });
  }

  /** Writes fields of the scene, for a reader who may change it. */
  protected write(fields: Partial<BoardSceneFields>): void {
    if (!this.canEdit()) return;
    Object.assign(this.scene(), fields);
  }

  private soundsTagged(keep: (tag: string) => boolean): { identifier: string; name: string }[] {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    return this.audioStorage.audios
      .filter((audio) => !audio.isHidden && keep(AudioTag.get(audio.identifier)?.tag ?? 'BGM'))
      .map((audio) => ({ identifier: audio.identifier, name: soundFileName(audio.name) }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  }
}
