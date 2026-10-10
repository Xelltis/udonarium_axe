import { extractArtworkUrl } from '@axe/core/storage/audio-id3';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';

export enum AudioState {
  NULL = 0,
  COMPLETE = 1,
  URL = 1000,
}

export interface AudioFileContext {
  identifier: string;
  name: string;
  type: string;
  blob: Blob | null;
  url: string;
}

export class AudioFile {
  private context: AudioFileContext = {
    identifier: '',
    name: '',
    blob: null,
    type: '',
    url: '',
  };

  /**
   * The key the audio is stored and shared under: the SHA-256 of its bytes for an added file, or
   * the URL itself for audio that is only a link.
   */
  get identifier(): string {
    return this.context.identifier;
  }
  /**
   * The title shown for the track: the file name it was added with, or the
   * identifier when none came with it.
   */
  get name(): string {
    return this.context.name;
  }
  /** The audio bytes, or null while this seat holds only a catalogue entry or a link. */
  get blob(): Blob | null {
    return this.context.blob;
  }
  /**
   * Where a player loads the audio from: an object URL made for the bytes, or the external link for
   * link-only audio. Empty while neither has arrived.
   */
  get url(): string {
    return this.context.url;
  }
  /** Whether there is anything to play yet, either the bytes or a link. */
  get isReady(): boolean {
    return this.state !== AudioState.NULL;
  }
  /**
   * How much of the audio this seat holds, which the sharing system compares with peers'
   * catalogues to decide what to request.
   *
   * NULL means neither bytes nor a link, URL a link with no bytes, and COMPLETE the bytes
   * themselves.
   */
  get state(): AudioState {
    if (!this.url && !this.blob) return AudioState.NULL;
    if (this.url && !this.blob) return AudioState.URL;
    return AudioState.COMPLETE;
  }

  isHidden: boolean = false;

  /** ObjectURL for embedded album artwork (null if none, undefined if not yet extracted) */
  private _artworkUrl: string | null | undefined = undefined;
  /**
   * An object URL for the album artwork embedded in the file, or null when it has none.
   *
   * For audio received from a peer the artwork is read in the background once the bytes arrive, so
   * this stays null for a moment after a transfer finishes.
   */
  get artworkUrl(): string | null {
    return this._artworkUrl ?? null;
  }

  private constructor() {}

  /**
   * A placeholder for audio known only from a peer's catalogue, holding the identifier
   * and name until the bytes arrive.
   */
  static createEmpty(identifier: string, name?: string): AudioFile {
    const audio = new AudioFile();
    audio.context.identifier = identifier;
    if (name) audio.context.name = name;

    return audio;
  }

  /**
   * Wraps either an external URL, which then serves as identifier, name and URL at once, or
   * a context received from a peer.
   */
  static create(arg: string | AudioFileContext): AudioFile {
    const audio = new AudioFile();
    if (typeof arg === 'string') {
      audio.context.identifier = arg;
      audio.context.name = arg;
      audio.context.url = arg;
    } else {
      audio.apply(arg);
    }
    return audio;
  }

  /**
   * Reads an added file into an audio entry keyed by the SHA-256 of its bytes, with its object URL
   * and any embedded artwork ready.
   *
   * A File keeps its name; a bare Blob is named by its hash.
   */
  static async createAsync(blob: Blob): Promise<AudioFile> {
    const name = blob instanceof File ? blob.name : undefined;
    const arrayBuffer = await FileReaderUtil.readAsArrayBufferAsync(blob);

    const audio = new AudioFile();
    audio.context.identifier = await FileReaderUtil.calcSHA256Async(arrayBuffer);
    audio.context.blob = new Blob([arrayBuffer], { type: blob.type });
    audio.context.type = audio.context.blob.type;
    audio.context.url = window.URL.createObjectURL(audio.context.blob);
    audio.context.name = name ?? audio.context.identifier;
    audio._artworkUrl = extractArtworkUrl(arrayBuffer);

    return audio;
  }

  /** Revokes the object URLs made for the bytes and the artwork, so they stop holding memory. */
  destroy() {
    this.revokeURLs();
    if (this._artworkUrl) URL.revokeObjectURL(this._artworkUrl);
  }

  /**
   * Fills in what this entry still lacks from another context, as when a
   * transfer from a peer completes.
   *
   * Fields already held are kept, except the name, which any non-empty incoming name
   * replaces. The first time bytes arrive an object URL is made for them and the embedded
   * artwork is read in the background.
   */
  apply(context: AudioFileContext) {
    this.context.identifier ||= context.identifier;
    if (context.name) this.context.name = context.name;
    const hadBlob = !!this.context.blob;
    this.context.blob ??= context.blob;
    this.context.type ||= context.type;
    this.context.url ||= context.url;
    this.createURLs();
    // Extract artwork when blob first arrives (P2P receive path)
    if (!hadBlob && this.context.blob && this._artworkUrl === undefined) {
      this._artworkUrl = null; // prevent double extraction
      FileReaderUtil.readAsArrayBufferAsync(this.context.blob).then((buf) => {
        this._artworkUrl = extractArtworkUrl(buf);
      });
    }
  }

  private createURLs() {
    if (this.context.blob && !this.context.url) this.context.url = window.URL.createObjectURL(this.context.blob);
  }

  private revokeURLs() {
    if (!this.context.blob) return;
    window.URL.revokeObjectURL(this.context.url);
  }

  /** A shallow copy of the fields, in the shape sent to peers and handed to `apply`. */
  toContext(): AudioFileContext {
    return { ...this.context };
  }
}
