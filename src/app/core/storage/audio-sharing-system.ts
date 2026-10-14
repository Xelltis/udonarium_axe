import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { localDispatch, NetworkMessage, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AudioFile, AudioFileContext, AudioState } from '@axe/core/storage/audio-file';
import { AudioStorage, CatalogItem } from '@axe/core/storage/audio-storage';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';

/**
 * How long a finished transfer waits before telling everyone else what this seat now holds.
 * Transfers finish in runs while a room fills up, and each run needs to be told only once.
 */
const CATALOG_BROADCAST_DELAY_MS = 1000;

export class AudioSharingSystem {
  private static _instance: AudioSharingSystem;
  /** The one audio sharing system for the page, created on first use. */
  static get instance(): AudioSharingSystem {
    if (!AudioSharingSystem._instance) AudioSharingSystem._instance = new AudioSharingSystem();
    return AudioSharingSystem._instance;
  }

  private sendTaskMap: Map<string, BufferSharingTask<AudioFileContext>> = new Map();
  private receiveTaskMap: Map<string, BufferSharingTask<AudioFileContext>> = new Map();
  private maxSendTask: number = 2;
  private maxReceiveTask: number = 4;
  private cleanups: (() => void)[] = [];
  /** Audio being fetched from the asset server, so a second catalogue does not fetch it again. */
  private httpFetching: Set<string> = new Set();
  /** Audio the asset server did not have, which is asked of peers from then on. */
  private httpMissed: Set<string> = new Set();

  /**
   * The audio to fetch before any other, such as what the room is playing.
   *
   * Audio arrives one file at a time from each peer holding it, so a newcomer to a room with
   * many tracks would otherwise wait for a random run of them before hearing the one on.
   */
  preferredIdentifiers: () => readonly string[] = () => [];

  private constructor() {}

  /**
   * Starts answering the network messages that trade audio between peers: catalogues,
   * requests, transfers and cancellations.
   *
   * Calling it again drops the earlier subscription first, so it never listens twice.
   */
  initialize() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        switch (msg.eventName) {
          case 'CONNECT_PEER':
            if ((msg as NetworkMessage<{ peerId: string }>).isSendFromSelf)
              AudioStorage.instance.synchronize((msg as NetworkMessage<{ peerId: string }>).data.peerId);
            break;
          case 'SYNCHRONIZE_AUDIO_LIST': {
            if (msg.isSendFromSelf) break;
            const otherCatalog: CatalogItem[] = msg.data as CatalogItem[];
            const request: CatalogItem[] = [];
            for (const item of this.preferredFirst(otherCatalog)) {
              let audio = AudioStorage.instance.get(item.identifier);
              if (audio === null) {
                audio = AudioFile.createEmpty(item.identifier, item.name);
                AudioStorage.instance.add(audio);
              }
              if (audio.state < AudioState.COMPLETE && !this.receiveTaskMap.has(item.identifier)) {
                if (this.fetchOverHttp(item.identifier, msg.sendFrom)) continue;
                request.push({ identifier: item.identifier, state: audio.state });
              }
            }
            if (
              request.length < 1 &&
              !this.hasActiveTask() &&
              otherCatalog.length < AudioStorage.instance.getCatalog().length
            ) {
              AudioStorage.instance.synchronize(msg.sendFrom);
            }
            if (request.length < 1 || this.isLimitReceiveTask()) break;
            this.request([this.pickRequest(request)], msg.sendFrom);
            break;
          }
          case 'REQUEST_AUDIO_RESOURE': {
            if (msg.isSendFromSelf) break;
            const data = msg.data as { identifiers: CatalogItem[]; receiver: string; candidatePeers: string[] };
            const randomRequest: CatalogItem[] = data.identifiers.filter((item) => {
              const audio = AudioStorage.instance.get(item.identifier);
              return audio && item.state < audio.state;
            });
            if (!this.isLimitSendTask() && 0 < randomRequest.length && !this.existsSendTask(data.receiver)) {
              const idx = Math.floor(Math.random() * randomRequest.length);
              const item = randomRequest[idx];
              const audio = AudioStorage.instance.get(item.identifier);
              if (audio) this.startSendTask(audio, data.receiver);
            } else {
              const candidatePeers: string[] = data.candidatePeers;
              const selfIdx = candidatePeers.indexOf(Network.peerId);
              if (-1 < selfIdx) candidatePeers.splice(selfIdx, 1);
              for (const peerId of candidatePeers) {
                networkSend(msg.eventName, data, peerId);
                return;
              }
            }
            break;
          }
          case 'UPDATE_AUDIO_RESOURE': {
            const updateAudios: AudioFileContext[] = msg.data as AudioFileContext[];
            for (const context of updateAudios) {
              if (context.blob) context.blob = new Blob([context.blob], { type: context.type });
              AudioStorage.instance.add(context);
            }
            break;
          }
          case 'START_AUDIO_TRANSMISSION': {
            const identifier: string = (msg.data as { fileIdentifier: string }).fileIdentifier;
            const audio = AudioStorage.instance.get(identifier);
            if (this.receiveTaskMap.has(identifier) || audio?.isReady) {
              Logger.warn('[AudioSync] タスクキャンセル', identifier);
              networkSend(`CANCEL_TASK_${identifier}`, null, msg.sendFrom);
            } else {
              this.startReceiveTask(identifier);
            }
            break;
          }
        }
      })
    );
  }

  private destroy() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  /** The catalogue with the preferred audio moved to the front, so it is fetched first. */
  private preferredFirst(catalog: readonly CatalogItem[]): CatalogItem[] {
    const preferred = this.preferredIdentifiers();
    if (preferred.length < 1) return [...catalog];
    return [
      ...catalog.filter((item) => preferred.includes(item.identifier)),
      ...catalog.filter((item) => !preferred.includes(item.identifier)),
    ];
  }

  /**
   * Starts fetching audio from the asset server, and says whether it is on its way from there, so it
   * need not be asked of a peer.
   *
   * Audio the server lacks, or sends bytes for that do not match, is asked of the peer whose
   * catalogue named it, the way it would have been without the server.
   */
  private fetchOverHttp(identifier: string, catalogPeer: string): boolean {
    const store = AssetHttpStore.instance;
    if (!store.isEnabled || !AssetHttpStore.isAssetId(identifier) || this.httpMissed.has(identifier)) return false;
    if (this.httpFetching.has(identifier)) return true;
    this.httpFetching.add(identifier);
    void store
      .download(identifier)
      .then((blob) => {
        if (blob) {
          localDispatch('UPDATE_AUDIO_RESOURE', [{ identifier, name: '', type: blob.type, blob, url: '' }]);
          AudioStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
          return;
        }
        this.httpMissed.add(identifier);
        const audio = AudioStorage.instance.get(identifier);
        if (!audio || AudioState.COMPLETE <= audio.state) return;
        if (this.receiveTaskMap.has(identifier) || this.isLimitReceiveTask()) return;
        this.request([{ identifier, state: audio.state }], catalogPeer);
      })
      .finally(() => this.httpFetching.delete(identifier));
    return true;
  }

  /** The audio to ask for next: a preferred one if it is wanted, otherwise any of them. */
  private pickRequest(request: readonly CatalogItem[]): CatalogItem {
    const preferred = this.preferredIdentifiers();
    const wanted = request.find((item) => preferred.includes(item.identifier));
    return wanted ?? request[Math.floor(Math.random() * request.length)];
  }

  private async startSendTask(audio: AudioFile, sendTo: string) {
    const task = BufferSharingTask.createSendTask<AudioFileContext>(audio.identifier, sendTo);
    this.sendTaskMap.set(audio.identifier, task);

    networkSend('START_AUDIO_TRANSMISSION', { fileIdentifier: audio.identifier }, sendTo);

    const context: AudioFileContext = {
      identifier: audio.identifier,
      name: audio.name,
      blob: null,
      type: '',
      url: '',
    };

    if (audio.state === AudioState.URL) {
      context.url = audio.url;
    } else if (audio.blob) {
      const buf = await FileReaderUtil.readAsArrayBufferAsync(audio.blob);
      context.blob = new Uint8Array(buf) as unknown as Blob;
      context.type = audio.blob.type;
    }

    task.onfinish = () => {
      this.stopSendTask(task.identifier);
      AudioStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
      AudioStorage.instance.synchronize(sendTo);
    };

    task.start(context);
  }

  private startReceiveTask(identifier: string) {
    let audio = AudioStorage.instance.get(identifier);
    if (!audio) {
      audio = AudioFile.createEmpty(identifier);
      AudioStorage.instance.add(audio);
    }
    const task = BufferSharingTask.createReceiveTask<AudioFileContext>(identifier);
    this.receiveTaskMap.set(identifier, task);

    task.onprogress = (_task, _loded, _total) => {
      // Writing progress into the name would overwrite the title that arrived with the catalogue
      // and leak a percentage into every place it is shown, so the name is left alone.
      // Showing progress would need its own channel rather than riding on the object.
      audio.apply(audio.toContext());
    };
    task.onfinish = (task, data) => {
      this.stopReceiveTask(task.identifier);
      if (data) {
        if (data.blob) data.blob = new Blob([data.blob], { type: data.type });
        AudioStorage.instance.add(data);
        localDispatch('UPDATE_AUDIO_RESOURE', [data]);
      }
      AudioStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
    };

    task.start();
  }

  private stopSendTask(identifier: string) {
    this.sendTaskMap.get(identifier)?.cancel();
    this.sendTaskMap.delete(identifier);
  }

  private stopReceiveTask(identifier: string) {
    this.receiveTaskMap.get(identifier)?.cancel();
    this.receiveTaskMap.delete(identifier);
  }

  private request(request: CatalogItem[], peerId: string) {
    const peerIds = Network.peerIds;
    peerIds.splice(peerIds.indexOf(Network.peerId), 1);
    networkSend(
      'REQUEST_AUDIO_RESOURE',
      {
        identifiers: request,
        receiver: Network.peerId,
        candidatePeers: peerIds,
      },
      peerId
    );
  }

  private hasActiveTask(): boolean {
    return 0 < this.sendTaskMap.size || 0 < this.receiveTaskMap.size;
  }

  private isLimitSendTask(): boolean {
    return this.maxSendTask <= this.sendTaskMap.size;
  }

  private isLimitReceiveTask(): boolean {
    return this.maxReceiveTask <= this.receiveTaskMap.size;
  }

  private existsSendTask(peerId: string): boolean {
    return [...this.sendTaskMap.values()].some((task) => task?.sendTo === peerId);
  }
}
