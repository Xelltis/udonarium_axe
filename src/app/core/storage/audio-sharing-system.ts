import { AudioFile, AudioFileContext } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SharedAssetSharingSystem } from '@axe/core/storage/shared-asset-sharing-system';

/**
 * Trades the sounds between peers: catalogues, requests, transfers one file at a time from each peer
 * holding one, and the room server's asset store where the room has one. What the room is playing is
 * fetched first.
 */
export class AudioSharingSystem extends SharedAssetSharingSystem<AudioFile, AudioFileContext> {
  private static _instance: AudioSharingSystem;
  /** The one audio sharing system for the page, created on first use. */
  static get instance(): AudioSharingSystem {
    if (!AudioSharingSystem._instance) AudioSharingSystem._instance = new AudioSharingSystem();
    return AudioSharingSystem._instance;
  }

  private constructor() {
    super({
      storage: () => AudioStorage.instance,
      createEmpty: (identifier, name) => AudioFile.createEmpty(identifier, name),
      messages: {
        request: 'REQUEST_AUDIO_RESOURE',
        update: 'UPDATE_AUDIO_RESOURE',
        start: 'START_AUDIO_TRANSMISSION',
      },
      logName: 'AudioSync',
    });
  }
}
