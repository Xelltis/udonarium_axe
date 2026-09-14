import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { CutInBgmComponent } from '@axe/features/media/cut-in-bgm/cut-in-bgm.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { OpenUrlComponent } from '@axe/ui/components/open-url/open-url.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

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
  private readonly t = inject(TRANSLATE_FN);

  readonly cutIn = input<CutIn | null>(null);
  readonly isEditable = input(false);

  readonly isYouTubeCutIn = signal(false);

  _minSizeWidth = 10;
  _maxSizeWidth = 10;
  _minSizeHeight = 1200;
  _maxSizeHeight = 1200;

  private get c(): CutIn | null {
    return this.cutIn();
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
   * or the picture's. While original size is on, reading it first resets the width to the picture's
   * or video's own. Reads 0 while not editable.
   */
  set cutInWidth(cutInWidth: number) {
    if (!this.c) return;
    if (this.editable) this.c.width = cutInWidth;
    if (this.keepImageAspect) {
      if (this.isYouTubeCutIn()) {
        this.c.height = Math.floor((cutInWidth * this.c.defVideoSizeHeight) / this.c.defVideoSizeWidth);
      } else {
        this.c.height = Math.floor((cutInWidth * this.originalImgHeight()) / this.originalImgWidth());
      }
    }
  }

  get cutInWidth(): number {
    if (!this.editable || !this.c) return 0;
    if (this.cutInOriginalSize) {
      if (this.isYouTubeCutIn()) {
        const width = this.c.defVideoSizeWidth;
        if (this.c.width !== width) this.c.width = width;
      } else {
        const width = this.cutInImage().url ? this.originalImgWidth() : 0;
        if (width > 0 && this.c.width !== width) this.c.width = width;
      }
    }
    return this.c.width;
  }

  /**
   * The cut-in's height in pixels, from the height field.
   *
   * Writing it also sets the width when the aspect is kept, from the video's default proportions or
   * the picture's. While original size is on, reading it first resets the height to the picture's
   * or video's own. Reads 0 while not editable.
   */
  set cutInHeight(cutInHeight: number) {
    if (!this.c) return;
    if (this.editable) this.c.height = cutInHeight;
    if (this.keepImageAspect) {
      if (this.isYouTubeCutIn()) {
        this.c.width = Math.floor((cutInHeight * this.c.defVideoSizeWidth) / this.c.defVideoSizeHeight);
      } else {
        this.c.width = Math.floor((cutInHeight * this.originalImgWidth()) / this.originalImgHeight());
      }
    }
  }

  get cutInHeight(): number {
    if (!this.editable || !this.c) return 0;
    if (this.cutInOriginalSize) {
      if (this.isYouTubeCutIn()) {
        const height = this.c.defVideoSizeHeight;
        if (this.c.height !== height) this.c.height = height;
      } else {
        const height = this.cutInImage().url ? this.originalImgHeight() : 0;
        if (height > 0 && this.c.height !== height) this.c.height = height;
      }
    }
    return this.c.height;
  }

  /**
   * Whether changing the width or height keeps the picture's proportions; false and unwritable
   * while not editable.
   */
  get keepImageAspect(): boolean {
    if (!this.editable || !this.c) return false;
    return this.c.keepImageAspect;
  }
  set keepImageAspect(aspect: boolean) {
    if (!this.editable || !this.c) return;
    this.c.keepImageAspect = aspect;
  }

  /** Whether the cut-in is shown without its window frame. */
  get cutInFrameless(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.frameless : false;
  }
  set cutInFrameless(frameless: boolean) {
    if (this.editable && this.c) this.c.frameless = frameless;
  }

  /** Whether the cut-in is shown at its picture's or video's own size, which locks the size fields. */
  get cutInOriginalSize(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.originalSize : false;
  }
  set cutInOriginalSize(cutInOriginalSize: boolean) {
    if (this.editable && this.c) this.c.originalSize = cutInOriginalSize;
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

  /** Whether the cut-in plays a YouTube video instead of showing a picture. */
  get cutInIsVideo(): boolean {
    if (!this.c) return false;
    return this.editable ? this.c.isVideoCutIn : false;
  }
  set cutInIsVideo(isVideo: boolean) {
    if (this.editable && this.c) this.c.isVideoCutIn = isVideo;
  }

  /** The YouTube URL of a video cut-in. */
  get cutInVideoURL(): string {
    if (!this.c) return '';
    return this.editable ? this.c.videoUrl : '';
  }
  set cutInVideoURL(videoUrl: string) {
    if (this.editable && this.c) this.c.videoUrl = videoUrl;
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

  readonly audios = computed(() => {
    this.objectChange.fileVersion();
    return this.audioStorage.audios.filter((audio) => !audio.isHidden);
  });

  /** The smallest width the width field allows, which differs for a video cut-in. */
  get minSizeWidth(): number {
    if (this.c) this._minSizeWidth = this.c.minSizeWidth(this.isYouTubeCutIn());
    return this._minSizeWidth;
  }

  /** The largest width the width field allows, which differs for a video cut-in. */
  get maxSizeWidth(): number {
    if (this.c) this._maxSizeWidth = this.c.maxSizeWidth(this.isYouTubeCutIn());
    return this._maxSizeWidth;
  }

  /** The smallest height the height field allows, which differs for a video cut-in. */
  get minSizeHeight(): number {
    if (this.c) this._minSizeHeight = this.c.minSizeHeight(this.isYouTubeCutIn());
    return this._minSizeHeight;
  }

  /** The largest height the height field allows, which differs for a video cut-in. */
  get maxSizeHeight(): number {
    if (this.c) this._maxSizeHeight = this.c.maxSizeHeight(this.isYouTubeCutIn());
    return this._maxSizeHeight;
  }

  /** Whether the cut-in's sound is present in this room's audio storage. */
  isCutInBgmUploaded(): boolean {
    if (!this.c) return false;
    return this.audioStorage.get(this.cutInAudioIdentifier) !== null;
  }

  /**
   * Snaps the height to the video's or picture's proportions after the keep-aspect box is clicked,
   * once the new value has been applied.
   */
  chkImageAspect() {
    if (!this.editable || !this.c) return;
    const cutIn = this.c;
    setTimeout(() => {
      if (this.keepImageAspect) {
        const imageurl = this.cutInImage().url;
        if (imageurl.length > 0) {
          const img = new Image();
          img.src = imageurl;
          if (this.isYouTubeCutIn()) {
            cutIn.height = Math.floor((cutIn.width * cutIn.defVideoSizeHeight) / cutIn.defVideoSizeWidth);
          } else {
            cutIn.height = Math.floor((cutIn.width * img.height) / img.width);
          }
        }
      }
    });
  }

  /**
   * Notes whether the cut-in is a video after its video fields change, resetting its size to the
   * new kind's defaults when it switches.
   */
  changeYouTubeInfo() {
    if (!this.c) return;
    const isVideo = !!this.c.videoId;
    if ((!this.isYouTubeCutIn() && isVideo) || (this.isYouTubeCutIn() && !isVideo)) {
      this.setDefaultControl(isVideo);
    }
    this.isYouTubeCutIn.set(isVideo);
  }

  /**
   * Resets the cut-in's size to a video's default size or to its picture's own size; does nothing
   * while not editable.
   */
  setDefaultControl(isVideo: boolean) {
    if (!this.editable || !this.c) return;
    if (isVideo) {
      this.c.width = this.c.defVideoSizeWidth;
      this.c.height = this.c.defVideoSizeHeight;
    } else {
      this.c.width = this.originalImgWidth();
      this.c.height = this.originalImgHeight();
    }
  }

  /** The natural width of the cut-in's picture, or 0 when it has none or it has not loaded yet. */
  originalImgWidth(): number {
    const imageurl = this.cutInImage().url;
    if (imageurl.length > 0) {
      const img = new Image();
      img.src = imageurl;
      return img.width;
    }
    return 0;
  }

  /** The natural height of the cut-in's picture, or 0 when it has none or it has not loaded yet. */
  originalImgHeight(): number {
    const imageurl = this.cutInImage().url;
    if (imageurl.length > 0) {
      const img = new Image();
      img.src = imageurl;
      return img.height;
    }
    return 0;
  }

  /** Plays the cut-in on this screen only, sized to its picture first when original size is on. */
  previewCutIn() {
    if (!this.c) return;
    if (this.c.originalSize) {
      const imageurl = this.cutInImage().url;
      if (imageurl.length > 0) {
        this.c.width = this.originalImgWidth();
        this.c.height = this.originalImgHeight();
      }
    }
    this.cutInLauncher.startCutInMySelf(this.c);
  }

  /**
   * Plays the cut-in for everyone in the room.
   *
   * It is sized to its picture first when original size is on, and the jukebox is stopped when the
   * cut-in brings its own sound and has no tag.
   */
  playCutIn() {
    if (!this.c) return;
    if (this.c.originalSize) {
      const imageurl = this.cutInImage().url;
      if (imageurl.length > 0) {
        this.c.width = this.originalImgWidth();
        this.c.height = this.originalImgHeight();
      }
    }
    if (this.isCutInBgmUploaded() && this.cutInTagName === '') {
      this.jukebox.stop();
    }
    this.cutInLauncher.startCutIn(this.c);
  }

  /** Stops the cut-in for everyone in the room. */
  stopCutIn() {
    if (this.c) this.cutInLauncher.stopCutIn(this.c);
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
    return Math.min(100, Math.max(0, Math.round(volume)));
  }

  private get cutInLauncher(): CutInLauncher {
    return this.objectStore.get<CutInLauncher>('CutInLauncher')!;
  }

  private get jukebox(): Jukebox {
    return this.objectStore.get<Jukebox>('Jukebox')!;
  }
}
