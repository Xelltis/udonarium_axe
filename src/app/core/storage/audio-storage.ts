import { networkSend } from '@axe/core/network/network-messaging';
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

    return this._add(audio);
  }

  /**
   * Adds audio from a link, an entry or a context received from a peer,
   * returning the entry the store keeps.
   *
   * When the identifier is already held, the new data fills in what that entry lacks and the
   * existing entry is returned. Complete audio also schedules a catalogue broadcast, except a
   * context merged into an entry already held.
   */
  add(arg: string | AudioFile | AudioFileContext): AudioFile {
    let audio: AudioFile;
    if (typeof arg === 'string') {
      audio = AudioFile.create(arg);
    } else if (arg instanceof AudioFile) {
      audio = arg;
    } else {
      if (this.update(arg)) return this.hash[arg.identifier];
      audio = AudioFile.create(arg);
    }
    return this._add(audio);
  }

  private _add(audio: AudioFile): AudioFile {
    if (AudioState.COMPLETE <= audio.state) this.catalogSchedule.whenQuiet(100);
    if (this.update(audio)) return this.hash[audio.identifier];
    this.hash[audio.identifier] = audio;
    return audio;
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
   * peers can request what they lack.
   */
  getCatalog(): CatalogItem[] {
    const catalog: CatalogItem[] = [];
    for (const audio of AudioStorage.instance.audios) {
      if (AudioState.COMPLETE <= audio.state) {
        catalog.push({ identifier: audio.identifier, state: audio.state, name: audio.name });
      }
    }
    return catalog;
  }
}
