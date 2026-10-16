import { xmlLoaded$ } from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { localDispatch, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { AssetDownloadMiss, AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { ImageContext, ImageFile, ImageState } from '@axe/core/storage/image-file';
import { CatalogItem, ImageStorage } from '@axe/core/storage/image-storage';
import * as MimeType from '@axe/core/storage/mime-type';
import { generateUuid } from '@axe/core/util/uuid';

/**
 * How long a finished transfer waits before telling everyone else what this seat now holds.
 * Transfers finish in runs while a room fills up, and each run needs to be told only once.
 */
const CATALOG_BROADCAST_DELAY_MS = 1000;

export class ImageSharingSystem {
  private static _instance: ImageSharingSystem;
  /** The one image sharing system for the page, created on first use. */
  static get instance(): ImageSharingSystem {
    if (!ImageSharingSystem._instance) ImageSharingSystem._instance = new ImageSharingSystem();
    return ImageSharingSystem._instance;
  }

  private sendTaskMap: Map<string, BufferSharingTask<ImageContext[]>> = new Map();
  private receiveTaskMap: Map<string, BufferSharingTask<ImageContext[]>> = new Map();
  private maxSendTask: number = 2;
  private maxReceiveTask: number = 4;
  private cleanups: (() => void)[] = [];
  /**
   * Images being fetched from the asset server, so a second catalogue does not fetch them again,
   * each with the first peer whose catalogue named it meanwhile, to ask should the server fail.
   */
  private httpFetching: Map<string, string | null> = new Map();
  /** Images the asset server did not have, which are asked of peers from then on. */
  private httpMissed: Set<string> = new Set();
  /** Images the room's list named that the asset server could not send just then. */
  private httpRetries = new AssetRetries();

  private constructor() {}

  /**
   * Starts answering the network messages that trade images between peers, and registers image URLs
   * found in loaded XML as linked images.
   *
   * Calling it again drops the earlier subscriptions first, so it never listens twice.
   */
  initialize() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        switch (msg.eventName) {
          case 'CONNECT_PEER':
            if (msg.isSendFromSelf) ImageStorage.instance.synchronize((msg.data as { peerId: string }).peerId);
            break;
          case 'SYNCHRONIZE_FILE_LIST': {
            if (msg.isSendFromSelf) break;
            const otherCatalog: CatalogItem[] = msg.data as CatalogItem[];
            const request: CatalogItem[] = [];
            for (const item of otherCatalog) {
              let image = ImageStorage.instance.get(item.identifier);
              if (image === null) {
                image = ImageFile.createEmpty(item.identifier);
                ImageStorage.instance.add(image);
              }
              if (image.state < ImageState.COMPLETE && !this.receiveTaskMap.has(item.identifier)) {
                if (this.fetchOverHttp(item.identifier, msg.sendFrom)) continue;
                request.push({ identifier: item.identifier, state: image.state });
              }
            }
            if (
              request.length < 1 &&
              !this.hasActiveTask() &&
              otherCatalog.length < ImageStorage.instance.getCatalog().length
            ) {
              ImageStorage.instance.synchronize(msg.sendFrom);
            }
            if (request.length < 1 || this.isLimitReceiveTask()) break;
            this.request(request, msg.sendFrom);
            break;
          }
          case 'REQUEST_FILE_RESOURE': {
            if (msg.isSendFromSelf) break;
            const data = msg.data as { identifiers: CatalogItem[]; receiver: string; candidatePeers: string[] };
            const randomRequest: CatalogItem[] = [];
            for (const item of data.identifiers) {
              const image = ImageStorage.instance.get(item.identifier);
              if (image && item.state < image.state)
                randomRequest.push({ identifier: item.identifier, state: item.state });
            }
            if (!this.isLimitSendTask() && 0 < randomRequest.length && !this.existsSendTask(data.receiver)) {
              const updateImages: ImageContext[] = this.makeSendUpdateImages(randomRequest);
              this.startSendTask(updateImages, data.receiver);
            } else {
              const candidatePeers: string[] = data.candidatePeers;
              const idx = candidatePeers.indexOf(Network.peerId);
              if (-1 < idx) candidatePeers.splice(idx, 1);
              for (const peerId of candidatePeers) {
                networkSend(msg.eventName, data, peerId);
                return;
              }
            }
            break;
          }
          case 'UPDATE_FILE_RESOURE': {
            const updateImages: ImageContext[] = (msg.data as { updateImages: ImageContext[] }).updateImages;
            for (const context of updateImages) {
              if (context.blob) context.blob = new Blob([context.blob], { type: context.type });
              if (context.thumbnail.blob)
                context.thumbnail.blob = new Blob([context.thumbnail.blob], { type: context.thumbnail.type });
              ImageStorage.instance.add(context);
              if (this.httpMissed.has(context.identifier)) ImageStorage.instance.uploadReceived(context.identifier);
            }
            break;
          }
          case 'START_FILE_TRANSMISSION': {
            const identifier = (msg.data as { taskIdentifier: string }).taskIdentifier;
            const image = ImageStorage.instance.get(identifier);
            if (this.receiveTaskMap.has(identifier) || (image && ImageState.COMPLETE <= image.state)) {
              Logger.warn('[ImageSync] タスクキャンセル', identifier);
              networkSend(`CANCEL_TASK_${identifier}`, null, msg.sendFrom);
            } else {
              this.startReceiveTask(identifier);
            }
            break;
          }
        }
      })
    );

    this.cleanups.push(
      xmlLoaded$.subscribe((event) => {
        convertUrlImage(event.xmlElement);
      })
    );
  }

  private destroy() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  private async startSendTask(updateImages: ImageContext[], sendTo: string) {
    const identifier = updateImages.length === 1 ? updateImages[0].identifier : generateUuid();
    const task = BufferSharingTask.createSendTask<ImageContext[]>(identifier, sendTo);
    this.sendTaskMap.set(task.identifier, task);
    networkSend('START_FILE_TRANSMISSION', { taskIdentifier: identifier }, sendTo);

    for (const context of updateImages) {
      if (context.thumbnail.blob) {
        const buf = await FileReaderUtil.readAsArrayBufferAsync(context.thumbnail.blob);
        context.thumbnail.blob = new Uint8Array(buf) as unknown as Blob;
      } else if (context.blob) {
        const buf = await FileReaderUtil.readAsArrayBufferAsync(context.blob);
        context.blob = new Uint8Array(buf) as unknown as Blob;
      }
    }
    /* */

    task.onfinish = (task) => {
      this.stopSendTask(task.identifier);
      ImageStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
      if (task.sendTo) ImageStorage.instance.synchronize(task.sendTo);
    };

    task.start(updateImages);
  }

  /**
   * Fetches from the room's asset store the pictures it holds that this seat lacks, named by the
   * room's list rather than by a peer's catalogue: those left in a room that everybody had gone
   * from, say. Each keeps the name it was put there with. One the store lacks waits for a catalogue
   * to name it; one it could not send just then is tried again a few times.
   */
  fetchListed(assets: readonly { id: string; name: string }[]): void {
    for (const { id, name } of assets) {
      let image = ImageStorage.instance.get(id);
      if (image === null) {
        image = ImageFile.createEmpty(id, name);
        ImageStorage.instance.add(image);
      } else if (!image.name && name && image.state < ImageState.COMPLETE) {
        image.context.name = name;
      }
      if (image.state < ImageState.COMPLETE && !this.receiveTaskMap.has(id)) this.fetchOverHttp(id, null);
    }
  }

  /**
   * Forgets which pictures the asset store lacked, for another room, which may hold them, and drops
   * the tries still to come of those it could not send.
   */
  forgetMisses(): void {
    this.httpMissed.clear();
    this.httpRetries.clear();
  }

  private fetchListedAgain(identifier: string): void {
    const image = ImageStorage.instance.get(identifier);
    if (image && image.state < ImageState.COMPLETE && !this.receiveTaskMap.has(identifier))
      this.fetchOverHttp(identifier, null);
  }

  /**
   * Starts fetching an image from the asset server, and says whether it is on its way from there,
   * so it need not be asked of a peer.
   *
   * An image the server could not send is asked of the peer whose catalogue named it, the way it
   * would have been without the server. With no such peer, one the server lacks, or sends bytes for
   * that do not match, is left, and one it could not send just then is tried again later. Only the
   * server's lacking it keeps it from being fetched from there again.
   */
  private fetchOverHttp(identifier: string, catalogPeer: string | null): boolean {
    const store = AssetHttpStore.instance;
    if (!store.isEnabled || !AssetHttpStore.isAssetId(identifier) || this.httpMissed.has(identifier)) return false;
    if (this.httpFetching.has(identifier)) {
      if (this.httpFetching.get(identifier) === null) this.httpFetching.set(identifier, catalogPeer);
      return true;
    }
    this.httpFetching.set(identifier, catalogPeer);
    void this.receiveOverHttp(identifier)
      .then((received) => {
        if (received === true) {
          this.httpRetries.forget(identifier);
          return;
        }
        if (received === 'missing') this.httpMissed.add(identifier);
        const image = ImageStorage.instance.get(identifier);
        if (!image || ImageState.COMPLETE <= image.state) return;
        const namedBy = this.httpFetching.get(identifier) ?? null;
        if (namedBy === null) {
          if (received === 'failed') this.httpRetries.schedule(identifier, () => this.fetchListedAgain(identifier));
          return;
        }
        if (this.receiveTaskMap.has(identifier) || this.isLimitReceiveTask()) return;
        this.request([{ identifier, state: image.state }], namedBy);
      })
      .finally(() => this.httpFetching.delete(identifier));
    return true;
  }

  private async receiveOverHttp(identifier: string): Promise<true | AssetDownloadMiss> {
    const fetched = await AssetHttpStore.instance.download(identifier);
    if (typeof fetched === 'string') return fetched;
    let context: ImageContext;
    try {
      // The name it was put up under fills in an entry with none; one the entry has stays.
      context = { ...(await ImageFile.contextFromBytesAsync(identifier, fetched.blob)), name: fetched.name };
    } catch (reason) {
      Logger.warn('[ImageSync] サーバーから受け取った画像を読めませんでした', identifier, reason);
      return 'missing';
    }
    localDispatch('UPDATE_FILE_RESOURE', { identifier, updateImages: [context] });
    ImageStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
    return true;
  }

  private startReceiveTask(identifier: string) {
    const task = BufferSharingTask.createReceiveTask<ImageContext[]>(identifier);
    this.receiveTaskMap.set(identifier, task);
    task.onfinish = (task, data) => {
      this.stopReceiveTask(task.identifier);
      if (data)
        localDispatch('UPDATE_FILE_RESOURE', {
          identifier: task.identifier,
          updateImages: data,
        });
      ImageStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
    };
    task.ontimeout = (task) => {
      Logger.warn('[ImageSync] receiveTask timeout', task.identifier);
    };
    task.oncancel = (task) => {
      Logger.warn('[ImageSync] receiveTask cancel', task.identifier);
    };

    task.start();
  }

  private stopSendTask(identifier: string) {
    const task = this.sendTaskMap.get(identifier);
    if (task) {
      task.cancel();
    }
    this.sendTaskMap.delete(identifier);
  }

  private stopReceiveTask(identifier: string) {
    const task = this.receiveTaskMap.get(identifier);
    if (task) {
      task.cancel();
    }
    this.receiveTaskMap.delete(identifier);
  }

  private request(request: CatalogItem[], peerId: string) {
    const peerIds = Network.peerIds;
    peerIds.splice(peerIds.indexOf(Network.peerId), 1);
    networkSend(
      'REQUEST_FILE_RESOURE',
      {
        identifiers: request,
        receiver: Network.peerId,
        candidatePeers: peerIds,
      },
      peerId
    );
  }

  private makeSendUpdateImages(catalog: CatalogItem[], maxSize: number = 1024 * 1024 * 0.5): ImageContext[] {
    const updateImages: ImageContext[] = [];
    let byteSize: number = 0;

    // Fisher-Yates
    for (let i = catalog.length - 1; 0 <= i; i--) {
      const rand = Math.floor(Math.random() * (i + 1));
      [catalog[i], catalog[rand]] = [catalog[rand], catalog[i]];
    }

    catalog.sort((a, b) => {
      if (a.state < b.state) return -1;
      if (a.state > b.state) return 1;
      return 0;
    });

    for (let i = 0; i < catalog.length; i++) {
      const item: { identifier: string; state: number } = catalog[i];
      const image = ImageStorage.instance.get(item.identifier);
      if (!image) continue;

      const context: ImageContext = {
        identifier: image.identifier,
        name: image.name,
        type: '',
        blob: null,
        url: '',
        thumbnail: { type: '', blob: null, url: '' },
      };

      if (image.state === ImageState.URL) {
        context.url = image.url;
      } else if (item.state === ImageState.NULL) {
        context.thumbnail.blob = image.thumbnail.blob; //
        context.thumbnail.type = image.thumbnail.type;
      } else if (image.blob) {
        context.blob = image.blob; //
        context.type = image.blob.type;
      } else {
        continue;
      }

      const size = context.blob ? context.blob.size : context.thumbnail.blob ? context.thumbnail.blob.size : 100;

      updateImages.push(context);
      byteSize += size;
      if (maxSize < byteSize) break;
    }
    return updateImages;
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
    for (const task of this.sendTaskMap.values()) {
      if (task && task.sendTo === peerId) return true;
    }
    return false;
  }
}

function convertUrlImage(xmlElement: Element) {
  const urls: string[] = [];

  let imageElements = xmlElement.querySelectorAll('*[type="image"]');
  for (let i = 0; i < imageElements.length; i++) {
    const url = imageElements[i].innerHTML;
    if (!ImageStorage.instance.get(url) && 0 < MimeType.type(url).length) {
      urls.push(url);
    }
  }

  imageElements = xmlElement.querySelectorAll('*[imageIdentifier], *[attachmentImageIdentifiers]');
  for (let i = 0; i < imageElements.length; i++) {
    const url = imageElements[i].getAttribute('imageIdentifier');
    if (!ImageStorage.instance.get(url ?? '') && 0 < MimeType.type(url ?? '').length) {
      urls.push(url!);
    }
    const attachmentImageIdentifiers = imageElements[i].getAttribute('attachmentImageIdentifiers') ?? '';
    for (const attachmentImageIdentifier of parseAttachmentImageIdentifiers(attachmentImageIdentifiers)) {
      if (
        !ImageStorage.instance.get(attachmentImageIdentifier) &&
        0 < MimeType.type(attachmentImageIdentifier).length
      ) {
        urls.push(attachmentImageIdentifier);
      }
    }
  }
  for (const url of urls) {
    // aliases a name-based identifier onto an image already held under that name
    const byName = ImageStorage.instance.images.find((i) => i.name === url && i.blob);
    if (byName) {
      const aliasContext: ImageContext = {
        identifier: url,
        name: url,
        blob: byName.context.blob,
        type: byName.context.type,
        url: '', // left empty, so createURLs makes a blob: URL of its own
        thumbnail: {
          blob: byName.context.thumbnail.blob,
          type: byName.context.thumbnail.type,
          url: '',
        },
      };
      ImageStorage.instance.add(aliasContext);
    } else {
      ImageStorage.instance.add(url);
    }
  }
}

function parseAttachmentImageIdentifiers(value: string): string[] {
  const rawValue = value.trim();
  if (rawValue.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (Array.isArray(parsed)) return parsed.map((identifier) => String(identifier));
    } catch {
      return [];
    }
  }
  return rawValue.split(/\n+/);
}
