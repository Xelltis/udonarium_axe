import { emitCcfoliaRoomDropped, emitFileLoaded, emitImageDropped, emitXmlLoaded } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import type { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import * as MimeType from '@axe/core/storage/mime-type';
import { isCcfoliaRoomArchive } from '@axe/core/storage/room-archive';
import { createZipBlob, readZipEntries } from '@axe/core/storage/zip-archive';
import type { ZipEntry } from '@axe/core/storage/zip-archive-message';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { downloadBlob } from '@axe/core/util/download-blob';
import { xml2element } from '@axe/core/util/xml-util';
import type { Unzipped } from 'fflate';

type MetaData = { percent: number; currentFile: string };
type UpdateCallback = (metadata: MetaData) => void;

/** The shape of the guard from the domain. Core does not know the domain, so it depends on
 *  a singleton in the store answering to this shape. */
interface LoadGuard extends GameObject {
  reloadCheckStart(isOnline: boolean): void;
  isLoadOk(): boolean;
}

const MEGA_BYTE = 1024 * 1024;
const DROP_STACK_OFFSET = 20;
const XML_MIME_TYPE = 'text/xml';
const INTERNAL_DRAG_TYPE = 'application/x-axe-internal-drag';

/** What {@link FileArchiver.loadImages} took in and what it had to leave out. */
export interface ImageLoadResult {
  /** The entry the image store keeps for each image taken, in the order the files came. */
  readonly images: ImageFile[];
  /** The names of the images left out for being over the size limit. */
  readonly oversized: string[];
}

/**
 * Whether a dropped file may be room or object XML: typed as plain text or XML, and not
 * named as some other kind of file.
 *
 * Some systems report XML files as plain text, so the name is checked rather than the type
 * trusted alone.
 */
export function isXmlCandidateFile(file: File): boolean {
  if (!file.type.startsWith('text/')) return false;
  if (file.type !== 'text/plain' && file.type !== XML_MIME_TYPE) return false;

  const typeByName = MimeType.type(file.name);
  return typeByName === '' || typeByName === XML_MIME_TYPE;
}

export class FileArchiver {
  private static _instance: FileArchiver;
  /** The one file archiver for the page, created on first use. */
  static get instance(): FileArchiver {
    if (!FileArchiver._instance) FileArchiver._instance = new FileArchiver();
    return FileArchiver._instance;
  }

  networkService = Network;
  /**
   * The guard that asks, during online play, before dropped data overwrites the room settings; null
   * until the domain has put one in the object store.
   */
  get reloadCheck(): LoadGuard | null {
    return ObjectStore.instance.get<LoadGuard>('ReloadCheck');
  }

  private maxImageSize = 2 * MEGA_BYTE;
  private maxAudioSize = 10 * MEGA_BYTE;

  private callbackOnDragStart: ((this: HTMLElement, e: DragEvent) => void) | null = null;
  private callbackOnDragEnter: ((this: HTMLElement, e: DragEvent) => void) | null = null;
  private callbackOnDragOver: ((this: HTMLElement, e: DragEvent) => void) | null = null;
  private callbackOnDrop: ((this: HTMLElement, e: DragEvent) => void) | null = null;

  private constructor() {}

  /**
   * Starts taking files dropped anywhere on the page and loading them with `load`.
   *
   * Calling it again removes the earlier listeners first. Drags that began inside the page are
   * ignored when they are dropped.
   */
  initialize() {
    this.destroy();
    this.addEventListeners();
  }

  /** Lets go of the page again, which a test that started one has to be able to ask for. */
  destroy() {
    this.removeEventListeners();
  }

  private addEventListeners() {
    this.removeEventListeners();
    this.callbackOnDragStart = (e) => this.onDragStart(e);
    this.callbackOnDragEnter = (e) => this.onDragEnter(e);
    this.callbackOnDragOver = (e) => this.onDragOver(e);
    this.callbackOnDrop = (e) => this.onDrop(e);
    document.body.addEventListener('dragstart', this.callbackOnDragStart as EventListener, true);
    document.body.addEventListener('dragenter', this.callbackOnDragEnter as EventListener, false);
    document.body.addEventListener('dragover', this.callbackOnDragOver as EventListener, false);
    document.body.addEventListener('drop', this.callbackOnDrop as EventListener, false);
  }

  private removeEventListeners() {
    if (this.callbackOnDragStart)
      document.body.removeEventListener('dragstart', this.callbackOnDragStart as EventListener, true);
    if (this.callbackOnDragEnter)
      document.body.removeEventListener('dragenter', this.callbackOnDragEnter as EventListener, false);
    if (this.callbackOnDragOver)
      document.body.removeEventListener('dragover', this.callbackOnDragOver as EventListener, false);
    if (this.callbackOnDrop) document.body.removeEventListener('drop', this.callbackOnDrop as EventListener, false);
    this.callbackOnDragStart = null;
    this.callbackOnDragEnter = null;
    this.callbackOnDragOver = null;
    this.callbackOnDrop = null;
  }

  private onDragStart(event: DragEvent) {
    event.dataTransfer?.setData(INTERNAL_DRAG_TYPE, '1');
  }

  private onDragEnter(event: DragEvent) {
    event.preventDefault();
  }

  private onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  private onDrop(event: DragEvent) {
    event.preventDefault();
    // A drop made up rather than made by a browser may carry no list of types at all.
    if (event.dataTransfer?.types?.includes(INTERNAL_DRAG_TYPE)) return;

    // A drop can arrive before startup finishes, or where no guard exists at all.
    this.reloadCheck?.reloadCheckStart(this.networkService.peerContext?.roomName !== '');

    const files = event.dataTransfer?.files;
    if (!files) return;
    this.load(files, { x: event.clientX, y: event.clientY });
  }

  /**
   * Loads files as if dropped: images and audio into their stores, XML as room or object data, and
   * zips by loading what is inside.
   *
   * Images over 2 MB and audio over 10 MB are skipped with a warning. Given a drop point, each
   * image is announced for placing on the table, the next one offset a little from the last. Images
   * inside a zip are not placed, and a zip exported as a CCFOLIA room is handed on whole instead.
   */
  async load(files: File[] | FileList, dropPoint?: { x: number; y: number }): Promise<void> {
    await this.loadFiles(files, dropPoint, true);
  }

  private async loadFiles(
    files: File[] | FileList,
    dropPoint: { x: number; y: number } | undefined,
    placesDroppedImages: boolean
  ): Promise<void> {
    if (!files) return;
    const loadFiles: File[] = files instanceof FileList ? toArrayOfFileList(files) : files;

    let droppedImageCount = 0;
    for (const file of loadFiles) {
      const imageDropPoint = placesDroppedImages ? this.offsetDropPoint(dropPoint, droppedImageCount) : undefined;
      const isImageDropped = await this.handleImage(file, imageDropPoint);
      if (isImageDropped) droppedImageCount++;
      await this.handleAudio(file);
      await this.handleText(file, dropPoint);
      await this.handleZip(file, dropPoint);
      emitFileLoaded();
    }
  }

  private offsetDropPoint(
    dropPoint: { x: number; y: number } | undefined,
    index: number
  ): { x: number; y: number } | undefined {
    if (!dropPoint) return undefined;
    const offset = index * DROP_STACK_OFFSET;
    return { x: dropPoint.x + offset, y: dropPoint.y + offset };
  }

  /**
   * Stores only the images among the files, for a picker that wants pictures and nothing else.
   *
   * Other kinds of file are ignored rather than read, so no room data or zip is opened and
   * nothing is placed on the table. Images over 2 MB are left out and named in the result.
   */
  async loadImages(files: File[] | FileList): Promise<ImageLoadResult> {
    const images: ImageFile[] = [];
    const oversized: string[] = [];
    for (const file of files instanceof FileList ? toArrayOfFileList(files) : files) {
      if (!file.type.startsWith('image/')) continue;
      const image = await this.storeImage(file);
      if (image) images.push(image);
      else oversized.push(file.name);
    }
    if (images.length) emitFileLoaded();
    return { images, oversized };
  }

  private async handleImage(file: File, dropPoint?: { x: number; y: number }): Promise<boolean> {
    if (!file.type.startsWith('image/')) return false;
    // With no guard there is nothing to stop it.
    if (!(this.reloadCheck?.isLoadOk() ?? true)) return false;
    const image = await this.storeImage(file);
    if (!image) return false;
    if (dropPoint) emitImageDropped({ identifier: image.identifier, fileName: file.name, dropPoint });
    return dropPoint != null;
  }

  private async storeImage(file: File): Promise<ImageFile | null> {
    if (file.size > this.maxImageSize) {
      Logger.warn(`[FileArchiver] ファイルサイズ制限超過: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return null;
    }
    return ImageStorage.instance.addAsync(file);
  }

  private async handleAudio(file: File) {
    if (!file.type.startsWith('audio/')) return;
    if (file.size > this.maxAudioSize) {
      Logger.warn(`[FileArchiver] ファイルサイズ制限超過: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return;
    }
    await AudioStorage.instance.addAsync(file);
  }

  private async handleText(file: File, dropPoint?: { x: number; y: number }): Promise<void> {
    if (!isXmlCandidateFile(file)) return;

    let isLoadOk = true;
    // room data passes here and is confirmed later, once its contents are known
    if (
      file.name === 'config.xml' ||
      file.name === 'imagetag.xml' ||
      file.name === 'audiotag.xml' ||
      file.name === 'summary.xml' ||
      file.name === 'ailment.xml'
    ) {
      isLoadOk = this.reloadCheck?.isLoadOk() ?? true;
    }

    if (isLoadOk) {
      try {
        const xmlElement: Element | null = xml2element(await FileReaderUtil.readAsTextAsync(file));
        if (xmlElement) emitXmlLoaded({ xmlElement, dropPoint });
      } catch (reason) {
        Logger.warn('[FileArchiver] XML読み込みエラー', reason);
      }
    }
  }

  private async handleZip(file: File, dropPoint?: { x: number; y: number }) {
    if (!file.type.includes('application/') && file.type.length > 0) return;
    let entries: ZipEntry[];
    try {
      entries = await readZipEntries(file);
    } catch (reason) {
      Logger.warn('[FileArchiver] ZIP読み込みエラー', reason);
      return;
    }
    if (isCcfoliaRoomArchive(entries.map((entry) => entry.name))) {
      emitCcfoliaRoomDropped({ entries: await toUnzipped(entries) });
      return;
    }

    for (const entry of entries) {
      try {
        await this.loadFiles([new File([entry.blob], entry.name, { type: entry.type })], dropPoint, false);
      } catch (reason) {
        Logger.warn('[FileArchiver] ZIP展開エラー', reason);
      }
    }
  }

  /** Unpacks a zip into its entries, in a worker where one can be used. */
  async readZipEntriesAsync(file: File | Blob): Promise<ZipEntry[]> {
    return readZipEntries(file);
  }

  /**
   * Packs files into a zip, reporting 0% before and 100% after, since packing
   * reports no progress in between.
   */
  async createZipBlobAsync(files: File[] | FileList, updateCallback?: UpdateCallback): Promise<Blob> {
    const saveFiles: File[] = files instanceof FileList ? toArrayOfFileList(files) : files;

    updateCallback?.({ percent: 0, currentFile: '' });

    const blob = await createZipBlob(saveFiles);

    updateCallback?.({ percent: 100, currentFile: '' });
    return blob;
  }

  /** Packs files into a zip and hands it to the browser as a download named after `zipName`. */
  async saveAsync(files: File[] | FileList, zipName: string, updateCallback?: UpdateCallback): Promise<void> {
    if (!files) return;
    const blob = await this.createZipBlobAsync(files, updateCallback);
    downloadBlob(blob, `${zipName}.zip`);
  }
}

async function toUnzipped(entries: readonly ZipEntry[]): Promise<Unzipped> {
  const unzipped: Unzipped = {};
  for (const entry of entries) {
    unzipped[entry.name] = new Uint8Array(await entry.blob.arrayBuffer());
  }
  return unzipped;
}

function toArrayOfFileList(fileList: FileList): File[] {
  return Array.from(fileList);
}
