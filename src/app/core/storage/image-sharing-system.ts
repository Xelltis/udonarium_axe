import { xmlLoaded$ } from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { localDispatch, networkSend } from '@axe/core/network/network-messaging';
import { AssetDownloadMiss, AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { ImageContext, ImageFile, ImageState, ThumbnailContext } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import * as MimeType from '@axe/core/storage/mime-type';
import { CATALOG_BROADCAST_DELAY_MS, SharedAssetSharingSystem } from '@axe/core/storage/shared-asset-sharing-system';
import { CatalogItem } from '@axe/core/storage/shared-asset-storage';
import { shuffle } from '@axe/core/util/array-util';
import { generateUuid } from '@axe/core/util/uuid';

/** How many bytes of pictures go to a peer in one transfer, at most, but for the first picture. */
const SEND_BATCH_BYTES = 1024 * 1024 * 0.5;

/**
 * A picture as it travels to a peer: the bytes of the picture or its thumbnail as an array, which the
 * packing carries where a Blob would not go.
 */
export type ImageWireContext = Omit<ImageContext, 'blob' | 'thumbnail'> & {
  blob: Uint8Array<ArrayBuffer> | Blob | null;
  thumbnail: Omit<ThumbnailContext, 'blob'> & { blob: Uint8Array<ArrayBuffer> | Blob | null };
};

/**
 * Trades the pictures between peers as the sounds and the models are traded, but in their own
 * shape: a peer is asked for every picture it names at once, several go in one transfer, and the
 * thumbnail of each goes ahead of its bytes. Pictures found in loaded XML by their link are held as
 * linked pictures.
 */
export class ImageSharingSystem extends SharedAssetSharingSystem<ImageFile, ImageContext> {
  private static _instance: ImageSharingSystem;
  /** The one image sharing system for the page, created on first use. */
  static get instance(): ImageSharingSystem {
    if (!ImageSharingSystem._instance) ImageSharingSystem._instance = new ImageSharingSystem();
    return ImageSharingSystem._instance;
  }

  private constructor() {
    super({
      storage: () => ImageStorage.instance,
      createEmpty: (identifier, name) => ImageFile.createEmpty(identifier, name),
      messages: {
        request: 'REQUEST_FILE_RESOURE',
        update: 'UPDATE_FILE_RESOURE',
        start: 'START_FILE_TRANSMISSION',
      },
      logName: 'ImageSync',
    });
  }

  /**
   * Starts answering the network messages that trade images between peers, and registers image URLs
   * found in loaded XML as linked images.
   *
   * Calling it again drops the earlier subscriptions first, so it never listens twice.
   */
  override initialize(): void {
    super.initialize();
    this.cleanups.push(
      xmlLoaded$.subscribe((event) => {
        convertUrlImage(event.xmlElement);
      })
    );
  }

  /** Every picture a peer names that this seat lacks is asked for at once, as several go in one transfer. */
  protected override toRequest(wanted: readonly CatalogItem[]): CatalogItem[] {
    return [...wanted];
  }

  /**
   * A peer is asked for nothing while pictures from it are still coming in: a transfer does not say
   * which pictures it carries, so those would be asked for again.
   */
  protected override asksDuringTransfer(): boolean {
    return false;
  }

  /** Sends as many of those asked for as fit a transfer, those the peer has the least of first. */
  protected override sendRequested(requested: CatalogItem[], sendTo: string): void {
    void this.sendImages(this.makeSendUpdateImages(requested), sendTo);
  }

  /** The update message carries the pictures under `updateImages`, each with its thumbnail's bytes beside its own. */
  protected override takeIn(data: unknown): void {
    for (const context of (data as { updateImages: ImageWireContext[] }).updateImages) {
      if (context.thumbnail.blob) {
        context.thumbnail.blob = new Blob([context.thumbnail.blob], { type: context.thumbnail.type });
      }
      this.keep({ ...context, thumbnail: context.thumbnail as ThumbnailContext });
    }
  }

  /** The start message names the transfer, which carries one picture or several, by `taskIdentifier`. */
  protected override transferIn(data: unknown): string {
    return (data as { taskIdentifier: string }).taskIdentifier;
  }

  /** A placeholder the room's list names takes the name it is listed under, while its bytes are still to come. */
  protected override placeFor(identifier: string, name?: string): ImageFile {
    const image = super.placeFor(identifier, name);
    if (!image.name && name && image.state < ImageState.COMPLETE) image.context.name = name;
    return image;
  }

  /**
   * Takes a picture from the room's asset store, drawing its thumbnail here. Bytes that make no
   * picture count as the store lacking it. The name it was put up under fills in an entry with none;
   * one the entry has stays.
   */
  protected override async receiveOverHttp(identifier: string, first: boolean): Promise<true | AssetDownloadMiss> {
    const fetched = await AssetHttpStore.instance.download(identifier, { first });
    if (typeof fetched === 'string') return fetched;
    let context: ImageContext;
    try {
      context = { ...(await ImageFile.contextFromBytesAsync(identifier, fetched.blob)), name: fetched.name };
    } catch (reason) {
      Logger.warn('[ImageSync] サーバーから受け取った画像を読めませんでした', identifier, reason);
      return 'missing';
    }
    localDispatch(this.messages.update, { identifier, updateImages: [context] });
    this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
    return true;
  }

  /**
   * Sends pictures to a peer in one transfer, named by the one picture's identifier or by a name of
   * its own for several: the thumbnail's bytes where the context carries a thumbnail, the picture's
   * own otherwise.
   */
  private async sendImages(updateImages: ImageContext[], sendTo: string): Promise<void> {
    const identifier = updateImages.length === 1 ? updateImages[0].identifier : generateUuid();
    const task = BufferSharingTask.createSendTask<ImageWireContext[]>(identifier, sendTo);
    this.sendTaskMap.set(task.identifier, task);
    networkSend(this.messages.start, { taskIdentifier: identifier }, sendTo);

    const onWire: ImageWireContext[] = [];
    for (const context of updateImages) {
      const wire: ImageWireContext = { ...context, thumbnail: { ...context.thumbnail } };
      if (context.thumbnail.blob) {
        wire.thumbnail.blob = new Uint8Array(await FileReaderUtil.readAsArrayBufferAsync(context.thumbnail.blob));
      } else if (context.blob) {
        wire.blob = new Uint8Array(await FileReaderUtil.readAsArrayBufferAsync(context.blob));
      }
      onWire.push(wire);
    }

    task.onfinish = (task) => {
      this.stopSendTask(task.identifier);
      this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
      if (task.sendTo) this.storage.synchronize(task.sendTo);
    };

    task.start(onWire);
  }

  /** Takes in the pictures a peer sends in one transfer, which come as an update once all have arrived. */
  protected override startReceiveTask(identifier: string): void {
    const task = BufferSharingTask.createReceiveTask<ImageWireContext[]>(identifier);
    this.receiveTaskMap.set(identifier, task);
    task.onfinish = (task, data) => {
      this.stopReceiveTask(task.identifier);
      if (data) localDispatch(this.messages.update, { identifier: task.identifier, updateImages: data });
      this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
      this.transferTakenIn(task.identifier);
    };
    task.ontimeout = (task) => {
      Logger.warn('[ImageSync] receiveTask timeout', task.identifier);
    };
    task.oncancel = (task) => {
      Logger.warn('[ImageSync] receiveTask cancel', task.identifier);
    };

    task.start();
  }

  /**
   * The pictures to send out of those asked for, as many as fit a transfer: in a random order, those
   * the peer has nothing of first, each as its thumbnail where the peer has nothing of it, as its bytes
   * where it has the thumbnail, and as its link where it is held by one.
   */
  private makeSendUpdateImages(catalog: CatalogItem[], maxSize: number = SEND_BATCH_BYTES): ImageContext[] {
    const updateImages: ImageContext[] = [];
    let byteSize: number = 0;

    shuffle(catalog);

    catalog.sort((a, b) => {
      if (a.state < b.state) return -1;
      if (a.state > b.state) return 1;
      return 0;
    });

    for (let i = 0; i < catalog.length; i++) {
      const item: { identifier: string; state: number } = catalog[i];
      const image = this.storage.get(item.identifier);
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
        context.thumbnail.blob = image.thumbnail.blob;
        context.thumbnail.type = image.thumbnail.type;
      } else if (image.blob) {
        context.blob = image.blob;
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
