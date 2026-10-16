import { Network } from '@axe/core/network/network';
import { networkSend } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { AudioFile, AudioFileContext, AudioState } from '@axe/core/storage/audio-file';
import { CatalogSendSchedule } from '@axe/core/storage/catalog-send-schedule';

export type CatalogItem = {
  readonly identifier: string;
  readonly state: number;
  readonly name?: string;
};

export class AudioStorage {
  private static _instance: AudioStorage;
  /** The one audio store for the page, created on first use. */
  static get instance(): AudioStorage {
    if (!AudioStorage._instance) AudioStorage._instance = new AudioStorage();
    return AudioStorage._instance;
  }

  private readonly catalogSchedule = new CatalogSendSchedule((peer) =>
    networkSend('SYNCHRONIZE_AUDIO_LIST', this.getCatalog(), peer)
  );
  private hash: { [identifier: string]: AudioFile } = {};
  /**
   * Audio added on this seat that is still going up to the asset server. It is left out of the
   * catalogue until then, so peers fetch it from the server rather than asking this seat.
   */
  private readonly uploading = new Set<string>();
  /** Uploads that failed for now, tried again a few times while the seat stays in the room. */
  private readonly uploadRetries = new AssetRetries();

  /** Every audio this seat knows of, including placeholders whose bytes have not arrived. */
  get audios(): AudioFile[] {
    return Object.values(this.hash);
  }

  private constructor() {}

  private destroy() {
    for (const identifier of Object.keys(this.hash)) {
      this.delete(identifier);
    }
  }

  /**
   * Reads a file the user added into the store, keyed by the hash of its bytes, and
   * tells peers about it shortly after.
   *
   * Adding audio already held merges into the existing entry and returns that one.
   */
  async addAsync(arg: Blob): Promise<AudioFile> {
    const audio: AudioFile = await AudioFile.createAsync(arg);

    return this._add(audio, true);
  }

  /**
   * Adds audio from a link, an entry or a context received from a peer,
   * returning the entry the store keeps.
   *
   * When the identifier is already held, the new data fills in what that entry lacks and the
   * existing entry is returned. Complete audio also schedules a catalogue broadcast, except a
   * context merged into an entry already held.
   *
   * An entry made on this seat, rather than a context from a peer, also goes up to the asset server
   * when one is configured.
   */
  add(arg: string | AudioFile | AudioFileContext): AudioFile {
    let audio: AudioFile;
    let isLocal = false;
    if (typeof arg === 'string') {
      audio = AudioFile.create(arg);
    } else if (arg instanceof AudioFile) {
      audio = arg;
      isLocal = true;
    } else {
      if (this.update(arg)) return this.hash[arg.identifier];
      audio = AudioFile.create(arg);
    }
    return this._add(audio, isLocal);
  }

  private _add(audio: AudioFile, isLocal: boolean = false): AudioFile {
    if (isLocal) this.uploadToAssetStore(audio);
    if (AudioState.COMPLETE <= audio.state) this.catalogSchedule.whenQuiet(100);
    if (this.update(audio)) return this.hash[audio.identifier];
    this.hash[audio.identifier] = audio;
    return audio;
  }

  /**
   * Puts every audio held in full up to the room just entered. The room server keeps each room's
   * sounds apart, so those added outside it, or brought from another room, are not there yet;
   * those that are only get asked about.
   */
  uploadAllToAssetStore(): void {
    this.uploadRetries.clear();
    for (const audio of this.audios) this.uploadToAssetStore(audio);
  }

  /**
   * Puts a sound a peer sent up to the room's asset store, for one the store was found to
   * lack: the seat that added it could not put it there, and once that seat leaves nobody else
   * might. Only a GM or a PL may put anything there.
   */
  uploadReceived(identifier: string): void {
    const role = Network.serverRole;
    const audio = this.hash[identifier];
    if (audio && (role === 'gm' || role === 'pl')) this.uploadToAssetStore(audio);
  }

  private uploadToAssetStore(audio: AudioFile): void {
    const store = AssetHttpStore.instance;
    const blob = audio.blob;
    if (!store.isEnabled || audio.state !== AudioState.COMPLETE || !blob) return;
    if (!AssetHttpStore.isAssetId(audio.identifier) || this.uploading.has(audio.identifier)) return;
    const { identifier } = audio;
    this.uploading.add(identifier);
    void store
      .upload(identifier, blob, audio.name)
      .then((result) => {
        if (result === 'failed') this.uploadRetries.schedule(identifier, () => this.retryUpload(identifier));
        else this.uploadRetries.forget(identifier);
      })
      .finally(() => {
        this.uploading.delete(identifier);
        this.catalogSchedule.whenQuiet(100);
      });
  }

  private retryUpload(identifier: string): void {
    const audio = this.hash[identifier];
    if (audio) this.uploadToAssetStore(audio);
  }

  private update(audio: AudioFile | AudioFileContext): boolean {
    const updateAudio: AudioFile = this.hash[audio.identifier];
    if (updateAudio) {
      updateAudio.apply(audio instanceof AudioFile ? audio.toContext() : audio);
      return true;
    }
    return false;
  }

  /**
   * Removes the audio and revokes its object URLs, returning false when it was not held. Peers are
   * not told.
   */
  delete(identifier: string): boolean {
    const audio: AudioFile = this.hash[identifier];
    if (audio) {
      audio.destroy();
      delete this.hash[identifier];
      return true;
    }
    return false;
  }

  /** The audio held under this identifier, or null when this seat has never heard of it. */
  get(identifier: string): AudioFile | null {
    return this.hash[identifier] ?? null;
  }

  /** Sends the catalogue now, to one peer or to everyone. */
  synchronize(peer?: string) {
    this.catalogSchedule.now(peer);
  }

  /** Sends the catalogue a little later, folded together with the calls made meanwhile. */
  lazySynchronize(ms: number, peer?: string) {
    this.catalogSchedule.later(ms, peer);
  }

  /**
   * The audio this seat holds in full or as a link, which is what it advertises so that
   * peers can request what they lack. Audio still going up to the asset server is left out.
   */
  getCatalog(): CatalogItem[] {
    const catalog: CatalogItem[] = [];
    for (const audio of AudioStorage.instance.audios) {
      if (AudioState.COMPLETE <= audio.state && !this.uploading.has(audio.identifier)) {
        catalog.push({ identifier: audio.identifier, state: audio.state, name: audio.name });
      }
    }
    return catalog;
  }
}
