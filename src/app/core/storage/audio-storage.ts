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
  static get instance(): AudioStorage {
    if (!AudioStorage._instance) AudioStorage._instance = new AudioStorage();
    return AudioStorage._instance;
  }

  private readonly catalogSchedule = new CatalogSendSchedule((peer) =>
    networkSend('SYNCHRONIZE_AUDIO_LIST', this.getCatalog(), peer)
  );
  private hash: { [identifier: string]: AudioFile } = {};

  get audios(): AudioFile[] {
    return Object.values(this.hash);
  }

  private constructor() {}

  private destroy() {
    for (const identifier of Object.keys(this.hash)) {
      this.delete(identifier);
    }
  }

  async addAsync(arg: Blob): Promise<AudioFile> {
    const audio: AudioFile = await AudioFile.createAsync(arg);

    return this._add(audio);
  }

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
    if (AudioState.COMPLETE <= audio.state) this.lazySynchronize(100);
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

  delete(identifier: string): boolean {
    const audio: AudioFile = this.hash[identifier];
    if (audio) {
      audio.destroy();
      delete this.hash[identifier];
      return true;
    }
    return false;
  }

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
