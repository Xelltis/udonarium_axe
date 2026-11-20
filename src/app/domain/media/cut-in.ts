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
import { clamp } from '@axe/core/util/clamp';
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

  private normalMaxSizeWidth = 1920;
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

  /** Whether the cut-in plays a YouTube video, which is sized within a video's bounds rather than a picture's. */
  get playsVideo(): boolean {
    return this.videoId.length > 0;
  }

  /**
   * A width and a height held inside the bounds the cut-in's kind allows (see {@link minSizeWidth} and
   * the rest), in whole pixels. A side that is not a finite number keeps the cut-in's own, or the least
   * its kind allows where that is not one either.
   */
  clampSize(width: number, height: number): { width: number; height: number } {
    const video = this.playsVideo;
    return {
      width: clampSide(width, this.width, this.minSizeWidth(video), this.maxSizeWidth(video)),
      height: clampSide(height, this.height, this.minSizeHeight(video), this.maxSizeHeight(video)),
    };
  }

  /**
   * Sizes the cut-in, each side held inside the bounds its kind allows (see {@link clampSize}); a side
   * given as anything but a finite number stays as it is. Only a side that changes is written.
   */
  setSize(width: number, height: number): void {
    const held = this.clampSize(width, height);
    if (this.width !== held.width) this.width = held.width;
    if (this.height !== held.height) this.height = held.height;
  }

  /**
   * Sizes the cut-in by one side, the other following at the proportions of `shape` where one is given
   * with both sides known, as keeping its aspect does; both are then held inside the bounds its kind
   * allows (see {@link setSize}). Where the side that follows would go past its bounds, it is held at
   * them and the side given follows it back, so the proportions stay; only where no size within both
   * bounds has them is the cut-in sized to the nearest it can be. A side given as anything but a
   * finite number, as a field left empty gives, changes nothing, the other side included.
   */
  resizeSide(side: 'width' | 'height', value: number, shape: { width: number; height: number } | null): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const given = this.clampSize(side === 'width' ? value : this.width, side === 'height' ? value : this.height);
    if (!shape || !(shape.width > 0) || !(shape.height > 0)) {
      this.setSize(given.width, given.height);
      return;
    }
    const tall = shape.height / shape.width;
    const byWidth = (width: number) => ({ width, height: Math.floor(width * tall) });
    const byHeight = (height: number) => ({ width: Math.floor(height / tall), height });
    const wanted = side === 'width' ? byWidth(given.width) : byHeight(given.height);
    const held = this.clampSize(wanted.width, wanted.height);
    const kept =
      held.width === wanted.width && held.height === wanted.height
        ? wanted
        : side === 'width'
          ? byHeight(held.height)
          : byWidth(held.width);
    this.setSize(kept.width, kept.height);
  }

  /**
   * The proportions keeping the cut-in's aspect keeps (see {@link resizeSide}): a video's default size,
   * or its picture's own size where that is known, both sides above 0; null where neither is, as for a
   * picture not read yet. Never the size the cut-in has, which is rounded and held to its bounds.
   */
  ownShape(picture: { width: number; height: number } | null): { width: number; height: number } | null {
    if (this.playsVideo) return { width: this.defVideoSizeWidth, height: this.defVideoSizeHeight };
    return picture && picture.width > 0 && picture.height > 0 ? { width: picture.width, height: picture.height } : null;
  }

  /**
   * Takes the size of the cut-in's own picture or video as it is while original size is on, which the
   * bounds do not apply to; nothing while it is off, nor for a side not known yet (not above 0).
   */
  fitOwnSize(width: number, height: number): void {
    if (!this.originalSize) return;
    if (width > 0 && this.width !== width) this.width = width;
    if (height > 0 && this.height !== height) this.height = height;
  }

  /**
   * The size the cut-in plays at: its picture's or video's own at original size, and otherwise the size
   * it was given held inside the bounds its kind allows, which one saved or sent from elsewhere may lie
   * outside.
   */
  get shownSize(): { width: number; height: number } {
    if (this.originalSize) return { width: Number(this.width), height: Number(this.height) };
    return this.clampSize(Number(this.width), Number(this.height));
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
      if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
        const shortsMatch = url.pathname.match(/^\/shorts\/([^/?&#]+)/);
        if (shortsMatch) {
          ret = encodeURI(shortsMatch[1]);
        } else {
          const tmp = this.videoUrl.split('v=');
          if (tmp[1]) ret = encodeURI(tmp[1].split(/[?&#/]/)[0]);
        }
      } else if (hostname === 'youtu.be') {
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
      this.audioName.length === 0 ||
      this.audioIdentifier.length === 0 ||
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

/**
 * Where a cut-in's panel stands in a viewport and how large it is: the cut-in's own size with the
 * room its title bar takes, placed by its position as a share of the room left over across and down.
 * A cut-in larger than the viewport starts from the left or the top edge.
 */
export function cutInPanelBox(
  cutIn: CutIn,
  viewport: { readonly width: number; readonly height: number }
): { left: number; top: number; width: number; height: number } {
  const chrome = cutInPanelChrome(cutIn);
  const size = cutIn.shownSize;
  const marginWidth = Math.max(0, viewport.width - size.width);
  const marginHeight = Math.max(0, viewport.height - size.height - chrome);
  return {
    left: (marginWidth * cutIn.x_pos) / 100,
    top: (marginHeight * cutIn.y_pos) / 100,
    width: size.width,
    height: size.height + chrome,
  };
}

/**
 * One side of a cut-in held inside its bounds, in whole pixels: `value` where it is a finite number, else
 * `fallback`, else the least allowed.
 */
function clampSide(value: number, fallback: number, min: number, max: number): number {
  const given = Number.isFinite(value) ? value : Number.isFinite(fallback) ? fallback : min;
  return clamp(Math.round(given), min, max);
}
