import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { type InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { parseAttributesKeepingIdentifier, toAttributesKeepingIdentifier } from '@axe/core/sync/persisted-identifier';
import { CutInScene } from '@axe/domain/media/cut-in-scene';

@SyncObject('cut-in')
export class CutIn extends GameObject implements InnerXml {
  @SyncVar() name = 'カットイン';
  @SyncVar() width = 480;
  @SyncVar() height = 320;
  @SyncVar() originalSize = true;
  @SyncVar() x_pos = 50;
  @SyncVar() y_pos = 50;

  // Modelled on the jukebox.
  @SyncVar() imageIdentifier = 'imageIdentifier';
  @SyncVar() audioIdentifier = '';
  @SyncVar() audioName = '';
  @SyncVar() startTime = 0;
  @SyncVar() tagName = '';
  @SyncVar() selected = false;
  @SyncVar() isLoop = false;
  @SyncVar() chatActivate = false;

  @SyncVar() outTime = 0;

  @SyncVar() isPlaying = false;
  @SyncVar() keepImageAspect = false;
  @SyncVar() frameless = false;

  @SyncVar() isVideoCutIn = false;
  @SyncVar() videoUrl = '';
  @SyncVar() videoVolume = 50;

  private normalMinSizeWidth = 10;
  private normalMinSizeHeight = 10;

  private normalMaxSizeWidth = 1200;
  private normalMaxSizeHeight = 1200;

  private videoMinSizeWidth = 448;
  private videoMinSizeHeight = 252;

  private videoMaxSizeWidth = 1920;
  private videoMaxSizeHeight = 1080;

  private _defVideoSizeWidth = 640;
  private _defVideoSizeHeight = 360;

  /** The width a video cut-in is given by default, which with the default height sets its 16:9 shape. */
  get defVideoSizeWidth(): number {
    return this._defVideoSizeWidth;
  }

  /** The height a video cut-in is given by default. */
  get defVideoSizeHeight(): number {
    return this._defVideoSizeHeight;
  }

  /** The narrowest a cut-in may be sized, which is wider for a video than for a picture. */
  minSizeWidth(isVideo: boolean): number {
    if (isVideo) {
      return this.videoMinSizeWidth;
    } else {
      return this.normalMinSizeWidth;
    }
  }

  /** The widest a cut-in may be sized, which is wider for a video than for a picture. */
  maxSizeWidth(isVideo: boolean): number {
    if (isVideo) {
      return this.videoMaxSizeWidth;
    } else {
      return this.normalMaxSizeWidth;
    }
  }

  /** The shortest a cut-in may be sized, which is taller for a video than for a picture. */
  minSizeHeight(isVideo: boolean): number {
    if (isVideo) {
      return this.videoMinSizeHeight;
    } else {
      return this.normalMinSizeHeight;
    }
  }

  /** The tallest a cut-in may be sized, which is taller for a video than for a picture. */
  maxSizeHeight(isVideo: boolean): number {
    if (isVideo) {
      return this.videoMaxSizeHeight;
    } else {
      return this.normalMaxSizeHeight;
    }
  }

  /** The sound the cut-in plays, or null when none is set or its file is not in this peer's storage. */
  get audio(): AudioFile | null {
    return AudioStorage.instance.get(this.audioIdentifier);
  }
  private audioPlayer: AudioPlayer = new AudioPlayer();

  /** The picture the cut-in shows, or the empty image when none is set or its file is not in storage. */
  get cutInImage(): ImageFile {
    if (!this.imageIdentifier) {
      return ImageFile.Empty;
    }
    const file = ImageStorage.instance.get(this.imageIdentifier);
    return file ? file : ImageFile.Empty;
  }

  /** Whether the text, trimmed, is an absolute http or https URL. */
  validUrl(url: string): boolean {
    if (!url) return false;
    try {
      new URL(url.trim());
    } catch (_e) {
      return false;
    }
    return /^https?:\/\//.test(url.trim());
  }

  /**
   * The YouTube video id taken from the video URL, for the embedded player.
   *
   * Watch, Shorts and youtu.be links are understood. Empty when this is not a video cut-in or
   * the URL is not one of those; characters that could break out of the embed are stripped.
   */
  get videoId(): string {
    if (!this.isVideoCutIn || !this.videoUrl) return '';
    let ret = '';
    if (this.validUrl(this.videoUrl)) {
      const url = new URL(this.videoUrl);
      const hostname = url.hostname;
      if (hostname == 'youtube.com' || hostname == 'www.youtube.com') {
        const shortsMatch = url.pathname.match(/^\/shorts\/([^/?&#]+)/);
        if (shortsMatch) {
          ret = encodeURI(shortsMatch[1]);
        } else {
          const tmp = this.videoUrl.split('v=');
          if (tmp[1]) ret = encodeURI(tmp[1].split(/[?&#/]/)[0]);
        }
      } else if (hostname == 'youtu.be') {
        const tmp = this.videoUrl.split('youtu.be/');
        if (tmp[1]) ret = encodeURI(tmp[1].split(/[?&#/]/)[0]);
      } else {
        return '';
      }
    } else {
      // Should this take an identifier alone?
      return '';
    }
    return ret.replace(/[<>/:\s\r\n]/g, '');
  }

  /**
   * Where the video starts, in whole seconds as text, from the URL's `start` or `t` parameter.
   *
   * Both plain seconds and the `1h2m3s` form are read. Null when there is no video id or no
   * readable start.
   */
  get videoStart(): string | null {
    if (!this.isVideoCutIn || !this.videoUrl || !this.videoId) return null;
    const result = /[&?](?:start|t)=([\dhms]+)/i.exec(this.videoUrl);
    if (result && result[1]) {
      return this._sec(result[1]);
    }
    return null;
  }

  private _sec(str: string): string | null {
    if (!str) return null;
    let tmp: RegExpExecArray | null;
    if ((tmp = /^(\d+)$/.exec(str))) {
      return tmp[1];
    } else if ((tmp = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(str))) {
      let sec = 0;
      if (tmp[1]) sec += +tmp[1] * 60 * 60;
      if (tmp[2]) sec += +tmp[2] * 60;
      if (tmp[3]) sec += +tmp[3];
      return `${sec}`;
    }
    return null;
  }

  /** The YouTube playlist id from the URL's `list` parameter. Empty when there is no video id or no list. */
  get playListId(): string {
    if (!this.isVideoCutIn || !this.videoId) return '';
    let ret = '';
    if (this.validUrl(this.videoUrl)) {
      const tmp = this.videoUrl.split('list=');
      if (tmp[1]) ret = encodeURI(tmp[1].split(/[&#/]/)[0]);
    } else {
      return '';
    }
    return ret.replace(/[<>/:\s\r\n]/g, '');
  }

  /** False only when a sound is named but its file is missing from this peer's storage. */
  get isValidAudio(): boolean {
    return (
      this.audioName.length == 0 ||
      this.audioIdentifier.length == 0 ||
      !!AudioStorage.instance.get(this.audioIdentifier)
    );
  }

  /** The layered scene belonging to this cut-in, or null when it has never been given one. */
  get scene(): CutInScene | null {
    return CutInScene.of(this.identifier);
  }

  /** Whether this cut-in is built out of layers rather than being one picture. */
  get isComposed(): boolean {
    const scene = this.scene;
    return scene !== null && scene.layers.length > 0;
  }

  /**
   * The identifier is written out with the rest.
   *
   * A table names the cut-ins it plays by their identifiers, so cut-ins read back under new ones
   * would leave every table pointing at nothing, and its settings showing the bare identifiers.
   */
  toAttributes(): Attributes {
    return toAttributesKeepingIdentifier(this);
  }

  /**
   * Reads the cut-in back from a file, taking up the identifier written with it. Brought into a
   * room that still has the one it was saved from, it is a copy under an identifier of its own,
   * since its scene is tied to it by identifier.
   */
  parseAttributes(attributes: NamedNodeMap): void {
    parseAttributesKeepingIdentifier(this, attributes, { whenTaken: 'copy' });
  }

  /**
   * The scene rides inside the cut-in, so a saved room or a saved cut_*.zip carries it
   * and a build that knows nothing of layers reads the attributes and ignores the rest.
   */
  innerXml(): string {
    const scene = this.scene;
    return scene ? ObjectSerializer.instance.toXml(scene) : '';
  }

  /** Reads the scene written inside the cut-in and ties it to this cut-in. Other children are ignored. */
  parseInnerXml(element: Element): void {
    for (const child of Array.from(element.children)) {
      const parsed = ObjectSerializer.instance.parseXml(child);
      // An identifier is never written out, so the scene read back belongs to this copy.
      if (parsed instanceof CutInScene) parsed.cutInIdentifier = this.identifier;
    }
  }

  // GameObject Lifecycle. ObjectStore.delete() calls remove() rather than destroy(),
  // so a deletion made elsewhere reaches the scene only through here.
  /** Destroys the cut-in's scene along with it, so no orphaned layers stay behind. */
  override onStoreRemoved(): void {
    super.onStoreRemoved();
    this.scene?.destroy();
  }
}

/** The height the title bar takes above a cut-in panel. */
export const CUT_IN_TITLE_BAR_HEIGHT = 25;

/** How much taller the panel stands than the cut-in itself. A frameless one wears no title bar. */
export function cutInPanelChrome(cutIn: CutIn): number {
  return cutIn.frameless ? 0 : CUT_IN_TITLE_BAR_HEIGHT;
}
