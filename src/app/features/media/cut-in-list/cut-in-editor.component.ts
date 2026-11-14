import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { emitStartCutIn } from '@axe/core/event/domain-events';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp } from '@axe/core/util/clamp';
import { portraitElementAt } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { saidNameOf } from '@axe/domain/character/hidden-name';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { portraitFitFor } from '@axe/domain/media/cut-in-portrait-fit';
import { type CutInSpeaker, SPEAKER_NAME_TOKEN } from '@axe/domain/media/cut-in-speaker';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CutInBgmComponent } from '@axe/features/media/cut-in-bgm/cut-in-bgm.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { OpenUrlComponent } from '@axe/ui/components/open-url/open-url.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** The bounds the size fields offer while no cut-in is under edit, in pixels. */
const STAND_IN_MIN_SIZE = 10;
const STAND_IN_MAX_SIZE = 1200;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'cut-in-editor',
  templateUrl: './cut-in-editor.component.html',
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class CutInEditorComponent {
  private readonly modalService = inject(ModalService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly names = inject(PieceNameService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly cutIns = inject(CutInService);

  readonly cutIn = input<CutIn | null>(null);
  readonly isEditable = input(false);

  /** Whether the cut-in under edit plays a YouTube video, read from the cut-in itself as it changes. */
  readonly isYouTubeCutIn = computed(() => {
    const c = this.cutIn();
    if (!c) return false;
    this.objectChange.versionOf(c.identifier)();
    return !!c.videoId;
  });

  private get c(): CutIn | null {
    return this.cutIn();
  }

  /** Whether the cut-in's layers show the portrait or the name of whoever it is played for. */
  readonly usesSpeaker = computed(() => {
    const c = this.cutIn();
    if (!c) return false;
    this.objectChange.versionOf(c.identifier)();
    this.objectChange.collectionOf(CutInLayer.aliasName)();
    return (c.scene?.layers ?? []).some((layer) => {
      this.objectChange.versionOf(layer.identifier)();
      return layer.portraitSlot || layer.text.includes(SPEAKER_NAME_TOKEN);
    });
  });

  /** The characters the cut-in can be tried out as, by name. */
  readonly speakerChoices = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => character.location.name !== 'graveyard' && !this.names.isKept(character))
      .map((character) => ({ identifier: character.identifier, name: character.name }));
  });

  /** The character the cut-in is tried out as on this screen, empty for nobody; never shared. */
  readonly trySpeakerId = signal('');

  /** Who the cut-in is played for when tried out here: the character chosen, with their portrait now. */
  private trySpeaker(): CutInSpeaker | null {
    const character = this.objectStore.get<GameCharacter>(this.trySpeakerId());
    if (!(character instanceof GameCharacter) || !this.usesSpeaker()) return null;
    const portrait = portraitElementAt(character, character.selectedPortraitIndex);
    const imageIdentifier = portrait ? `${portrait.value}` : character.imageFile.identifier;
    return {
      characterId: character.identifier,
      imageIdentifier,
      name: saidNameOf(character),
      fit: portraitFitFor(character.cutInPortraitFits, imageIdentifier),
    };
  }

  private get editable(): boolean {
    return this.isEditable();
  }

  readonly cutInImage = computed(() => {
    this.objectChange.fileVersion();
    const c = this.cutIn();
    if (!c) return ImageFile.Empty;
    this.objectChange.versionOf(c.identifier)();
    const file = this.imageStorage.get(c.imageIdentifier);
    return file ? file : ImageFile.Empty;
  });

  /** The cut-in's picture's own size once it has come, with where it was read from. */
  private readonly pictureSize = signal<{
    readonly url: string;
    readonly width: number;
    readonly height: number;
  } | null>(null);

  /**
   * Reads the cut-in's picture for its own size. A picture the page already shows answers at once,
   * but one it does not, as the board of a table drawn on a canvas, has to come in first.
   */
  private readonly measurePicture = effect(() => {
    const url = this.cutInImage().url;
    if (!url || untracked(this.pictureSize)?.url === url) return;
    const picture = new Image();
    picture.onload = () => {
      this.pictureSize.set({ url, width: picture.naturalWidth, height: picture.naturalHeight });
      this.fitToOriginal();
    };
    picture.src = url;
  });

  readonly cutInImageUrl = computed(() => {
    const c = this.cutIn();
    if (!c) return ImageFile.Empty.url;
    this.objectChange.versionOf(c.identifier)();
    return !c.videoId ? this.cutInImage().url : `https://img.youtube.com/vi/${c.videoId}/hqdefault.jpg`;
  });

  /**
   * The cut-in's name as edited in the form; reads empty and ignores writes while the form is not
   * editable.
   */
  get cutInName(): string {
    if (!this.c) return '';
    return this.editable ? this.c.name : '';
  }
  set cutInName(cutInName: string) {
    if (this.editable && this.c) this.c.name = cutInName;
  }

  /**
   * The cut-in's width in pixels, from the width field.
   *
   * Writing it also sets the height when the aspect is kept, from the video's default proportions
   * or the picture's, once the picture's size is known. While original size is on it reads the picture's or video's own width, without
   * writing it to the cut-in. Reads 0 while not editable.
   */
  set cutInWidth(cutInWidth: number) {
    const cutIn = this.c;
    if (!cutIn) return;
    if (this.editable) cutIn.width = cutInWidth;
    if (!this.keepImageAspect) return;
    const own = this.ownSize(cutIn);
    if (own.width > 0 && own.height > 0) cutIn.height = Math.floor((cutInWidth * own.height) / own.width);
  }

  get cutInWidth(): number {
    if (!this.editable || !this.c) return 0;
    const width = this.c.originalSize ? this.ownSize(this.c).width : 0;
    return width > 0 ? width : this.c.width;
  }

  /**
   * The cut-in's height in pixels, from the height field.
   *
   * Writing it also sets the width when the aspect is kept, from the video's default proportions or
   * the picture's, once the picture's size is known. While original size is on it reads the picture's or video's own height, without
   * writing it to the cut-in. Reads 0 while not editable.
   */
  set cutInHeight(cutInHeight: number) {
    const cutIn = this.c;
    if (!cutIn) return;
    if (this.editable) cutIn.height = cutInHeight;
    if (!this.keepImageAspect) return;
    const own = this.ownSize(cutIn);
    if (own.width > 0 && own.height > 0) cutIn.width = Math.floor((cutInHeight * own.width) / own.height);
  }

  get cutInHeight(): number {
    if (!this.editable || !this.c) return 0;
    const height = this.c.originalSize ? this.ownSize(this.c).height : 0;
    return height > 0 ? height : this.c.height;
  }

  /**
   * The size the cut-in has of its own: a video's default size, or its picture's size, with 0 for a
   * side that is not known yet.
   */
  private ownSize(cutIn: CutIn): { width: number; height: number } {
    if (cutIn.videoId) return { width: cutIn.defVideoSizeWidth, height: cutIn.defVideoSizeHeight };
    if (!this.cutInImage().url) return { width: 0, height: 0 };
    return { width: this.originalImgWidth(), height: this.originalImgHeight() };
  }

  /**
   * Writes the cut-in's own size onto it while original size is on, a side at a time as each is
   * known; does nothing while not editable.
   */
  private fitToOriginal(): void {
    const cutIn = this.c;
    if (!this.editable || !cutIn || !cutIn.originalSize) return;
    const { width, height } = this.ownSize(cutIn);
    if (width > 0 && cutIn.width !== width) cutIn.width = width;
    if (height > 0 && cutIn.height !== height) cutIn.height = height;
  }

  /**
   * Whether changing the width or height keeps the picture's proportions; false and unwritable
   * while not editable.
   *
   * Turning it on snaps the height to the video's or picture's proportions at the width the cut-in
   * has, which waits for a picture whose size is not known yet.
   */
  get keepImageAspect(): boolean {
    if (!this.editable || !this.c) return false;
    return this.c.keepImageAspect;
  }
  set keepImageAspect(aspect: boolean) {
    const cutIn = this.c;
    if (!this.editable || !cutIn) return;
    cutIn.keepImageAspect = aspect;
    if (!aspect || !this.cutInImage().url) return;
    if (cutIn.videoId) {
      cutIn.height = Math.floor((cutIn.width * cutIn.defVideoSizeHeight) / cutIn.defVideoSizeWidth);
      return;
    }
    const width = this.originalImgWidth();
    const height = this.originalImgHeight();
    if (width > 0 && height > 0) cutIn.height = Math.floor((cutIn.width * height) / width);
  }

  /** Whether the cut-in is shown without its window frame. */
  get cutInFrameless(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.frameless : false;
  }
  set cutInFrameless(frameless: boolean) {
    if (this.editable && this.c) this.c.frameless = frameless;
  }

  /**
   * Whether the cut-in is shown at its picture's or video's own size, which locks the size fields.
   * Turning it on writes that size onto the cut-in.
   */
  get cutInOriginalSize(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.originalSize : false;
  }
  set cutInOriginalSize(cutInOriginalSize: boolean) {
    if (!this.editable || !this.c) return;
    this.c.originalSize = cutInOriginalSize;
    this.fitToOriginal();
  }

  /** Where the cut-in is placed across the screen, as a percentage from 0 to 100. */
  get cutInX_Pos(): number {
    if (!this.c) return 0;
    return this.editable ? this.c.x_pos : 0;
  }
  set cutInX_Pos(cutInX_Pos: number) {
    if (this.editable && this.c) this.c.x_pos = cutInX_Pos;
  }

  /** Where the cut-in is placed down the screen, as a percentage from 0 to 100. */
  get cutInY_Pos(): number {
    if (!this.c) return 0;
    return this.editable ? this.c.y_pos : 0;
  }
  set cutInY_Pos(cutInY_Pos: number) {
    if (this.editable && this.c) this.c.y_pos = cutInY_Pos;
  }

  /** Whether the cut-in stays up until stopped; turning it on clears the time it closes after. */
  get cutInIsLoop(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.isLoop : false;
  }
  set cutInIsLoop(cutInIsLoop: boolean) {
    if (this.editable && this.c) {
      this.c.isLoop = cutInIsLoop;
      if (cutInIsLoop) this.c.outTime = 0;
    }
  }

  /** How many seconds the cut-in stays up before closing on its own; 0 keeps it up. */
  get cutInOutTime(): number {
    if (!this.c) return 0;
    return this.editable ? this.c.outTime : 0;
  }
  set cutInOutTime(cutInOutTime: number) {
    if (this.editable && this.c) this.c.outTime = cutInOutTime;
  }

  /** Whether the cut-in can be played by naming it in a chat message. */
  get chatActivate(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.chatActivate : false;
  }
  set chatActivate(chatActivate: boolean) {
    if (this.editable && this.c) this.c.chatActivate = chatActivate;
  }

  /**
   * Whether the cut-in plays a YouTube video instead of showing a picture. A write that turns the
   * cut-in into a video, or back into a picture, resets its size to the new kind's own.
   */
  get cutInIsVideo(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.isVideoCutIn : false;
  }
  set cutInIsVideo(isVideo: boolean) {
    if (!this.editable || !this.c) return;
    const cutIn = this.c;
    this.resizingOnKindChange(cutIn, () => (cutIn.isVideoCutIn = isVideo));
  }

  /**
   * The YouTube URL of a video cut-in. A write that turns the cut-in into a video, or back into a
   * picture, resets its size to the new kind's own.
   */
  get cutInVideoURL(): string {
    if (!this.c) return '';
    return this.editable ? this.c.videoUrl : '';
  }
  set cutInVideoURL(videoUrl: string) {
    if (!this.editable || !this.c) return;
    const cutIn = this.c;
    this.resizingOnKindChange(cutIn, () => (cutIn.videoUrl = videoUrl));
  }

  private resizingOnKindChange(cutIn: CutIn, write: () => void): void {
    const wasVideo = !!cutIn.videoId;
    write();
    const isVideo = !!cutIn.videoId;
    if (wasVideo !== isVideo) this.setDefaultControl(isVideo);
  }

  /**
   * The volume of a video cut-in from 0 to 100; writes are rounded and held in range, and an
   * unreadable value becomes 50.
   */
  get cutInVideoVolume(): number {
    if (!this.c) return 100;
    return this.editable ? this.c.videoVolume : 100;
  }
  set cutInVideoVolume(videoVolume: number) {
    if (this.editable && this.c) this.c.videoVolume = this.normalizeVideoVolume(videoVolume);
  }

  /**
   * The cut-in's tag; starting it stops any other cut-in with the same tag, and one with no tag and
   * its own sound stops the jukebox.
   */
  get cutInTagName(): string {
    if (!this.c) return '';
    return this.editable ? this.c.tagName : '';
  }
  set cutInTagName(cutInTagName: string) {
    if (this.editable && this.c) this.c.tagName = cutInTagName;
  }

  /** The name of the sound played with the cut-in, shown in the form. */
  get cutInAudioName(): string {
    if (!this.c) return '';
    return this.editable ? this.c.audioName : '';
  }
  set cutInAudioName(cutInAudioName: string) {
    if (this.editable && this.c) this.c.audioName = cutInAudioName;
  }

  /** The identifier of the sound played with the cut-in; empty when it has none. */
  get cutInAudioIdentifier(): string {
    if (!this.c) return '';
    return this.editable ? this.c.audioIdentifier : '';
  }
  set cutInAudioIdentifier(cutInAudioIdentifier: string) {
    if (this.editable && this.c) this.c.audioIdentifier = cutInAudioIdentifier;
  }

  /** The smallest width the width field allows, which differs for a video cut-in. */
  get minSizeWidth(): number {
    return this.c?.minSizeWidth(this.isYouTubeCutIn()) ?? STAND_IN_MIN_SIZE;
  }

  /** The largest width the width field allows, which differs for a video cut-in. */
  get maxSizeWidth(): number {
    return this.c?.maxSizeWidth(this.isYouTubeCutIn()) ?? STAND_IN_MAX_SIZE;
  }

  /** The smallest height the height field allows, which differs for a video cut-in. */
  get minSizeHeight(): number {
    return this.c?.minSizeHeight(this.isYouTubeCutIn()) ?? STAND_IN_MIN_SIZE;
  }

  /** The largest height the height field allows, which differs for a video cut-in. */
  get maxSizeHeight(): number {
    return this.c?.maxSizeHeight(this.isYouTubeCutIn()) ?? STAND_IN_MAX_SIZE;
  }

  /** Whether the cut-in's sound is present in this room's audio storage. */
  isCutInBgmUploaded(): boolean {
    if (!this.c) return false;
    return this.audioStorage.get(this.cutInAudioIdentifier) !== null;
  }

  /**
   * Resets the cut-in's size to a video's default size or to its picture's own size; does nothing
   * while not editable, and leaves the size as it is for a picture not measured yet.
   */
  private setDefaultControl(isVideo: boolean) {
    if (!this.editable || !this.c) return;
    if (isVideo) {
      this.c.width = this.c.defVideoSizeWidth;
      this.c.height = this.c.defVideoSizeHeight;
    } else {
      this.writePictureSize(this.c);
    }
  }

  private writePictureSize(cutIn: CutIn): void {
    const { width, height } = this.originalImgSize();
    if (width <= 0 || height <= 0) return;
    cutIn.width = width;
    cutIn.height = height;
  }

  /** The natural width of the cut-in's picture, or 0 when it has none or it has not loaded yet. */
  originalImgWidth(): number {
    return this.originalImgSize().width;
  }

  /** The natural height of the cut-in's picture, or 0 when it has none or it has not loaded yet. */
  originalImgHeight(): number {
    return this.originalImgSize().height;
  }

  /** The cut-in's picture's own size: as read once it came, or as the page holds it already, or nothing. */
  private originalImgSize(): { width: number; height: number } {
    const imageurl = this.cutInImage().url;
    if (imageurl.length < 1) return { width: 0, height: 0 };
    const size = this.pictureSize();
    if (size?.url === imageurl) return size;
    const img = new Image();
    img.src = imageurl;
    return { width: img.width, height: img.height };
  }

  /**
   * Whether this reader is a guest on a room server, which takes back the launcher a guest writes:
   * such a reader may only try a cut-in out on this screen, without the launcher.
   */
  readonly keptOffTable = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfKeptOffTable;
  });

  /**
   * Plays the cut-in on this screen only, sized to its picture first when original size is on. A
   * guest on a room server plays it here alone without touching the cut-in or the launcher.
   */
  previewCutIn() {
    if (!this.c) return;
    if (PeerCursor.isMyselfKeptOffTable) {
      emitStartCutIn({ cutIn: this.c, speaker: this.trySpeaker() });
      return;
    }
    this.fitToPicture(this.c);
    this.cutInLauncher?.startCutInMySelf(this.c, this.trySpeaker());
  }

  /**
   * Plays the cut-in for everyone in the room.
   *
   * It is sized to its picture first when original size is on, and the jukebox is stopped when the
   * cut-in brings its own sound and has no tag. Not for a guest on a room server.
   */
  playCutIn() {
    if (!this.c || PeerCursor.isMyselfKeptOffTable) return;
    this.fitToPicture(this.c);
    this.cutIns.launch(this.c, undefined, this.trySpeaker());
  }

  private fitToPicture(cutIn: CutIn): void {
    if (cutIn.originalSize) this.writePictureSize(cutIn);
  }

  /** Stops the cut-in for everyone in the room; not for a guest on a room server. */
  stopCutIn() {
    if (this.c && !PeerCursor.isMyselfKeptOffTable) this.cutInLauncher?.stopCutIn(this.c);
  }

  /**
   * Opens the image picker and sets the chosen picture on the cut-in; cancelling leaves the picture
   * as it was.
   */
  openCutInImageModal() {
    if (!this.c) return;
    const cutIn = this.c;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!cutIn || value === undefined || value === null) return;
      cutIn.imageIdentifier = value;
    });
  }

  /** Opens the sound picker and attaches the chosen sound, with its name, to the cut-in. */
  openCutInBgmModal() {
    if (!this.c) return;
    this.modalService.open<string>(CutInBgmComponent).then((value) => {
      if (!this.c || !value) return;
      this.cutInAudioIdentifier = value;
      const audio = this.audioStorage.get(value);
      if (audio) this.cutInAudioName = audio.name;
    });
  }

  /** Opens YouTube's terms of service in a dialog, returning false so the link does not also navigate. */
  openYouTubeTerms() {
    this.modalService.open(OpenUrlComponent, {
      url: 'https://www.youtube.com/terms',
      title: this.t('feature.media.cutIn.youtubeTerms'),
    });
    return false;
  }

  private normalizeVideoVolume(videoVolume: number): number {
    const volume = Number(videoVolume);
    if (!Number.isFinite(volume)) return 50;
    return clamp(Math.round(volume), 0, 100);
  }

  private get cutInLauncher(): CutInLauncher | null {
    return this.objectStore.get<CutInLauncher>('CutInLauncher') ?? null;
  }
}
