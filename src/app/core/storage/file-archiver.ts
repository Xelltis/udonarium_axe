import {
  emitCcfoliaRoomDropped,
  emitFileLoaded,
  emitFilesTooLarge,
  emitImageDropped,
  emitXmlLoaded,
  type FileTooLarge,
} from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import type { ImageFile } from '@axe/core/storage/image-file';
import { imageTypeOf } from '@axe/core/storage/image-sniff';
import { ImageStorage } from '@axe/core/storage/image-storage';
import * as MimeType from '@axe/core/storage/mime-type';
import { ccfoliaRoomFolderOf } from '@axe/core/storage/room-archive';
import { createZipBlob, readZipEntries, ZipCodeUnavailableError } from '@axe/core/storage/zip-archive';
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
  answerWithheldCheck(): boolean;
  answerCheck(): boolean;
}

const MEGA_BYTE = 1024 * 1024;

/** The largest image a load takes in. */
export const MAX_LOADED_IMAGE_BYTES = 2 * MEGA_BYTE;
/** The largest sound a load takes in. */
export const MAX_LOADED_AUDIO_BYTES = 10 * MEGA_BYTE;
const DROP_STACK_OFFSET = 20;
const XML_MIME_TYPE = 'text/xml';
const INTERNAL_DRAG_TYPE = 'application/x-axe-internal-drag';

/** What a load found out as it went. */
export interface LoadResult {
  /**
   * Whether the `data.xml` of a save was read and handed on, which is the room or object it holds;
   * true even where taking it in then failed partway, as the table is no longer as it was.
   */
  readonly dataRead: boolean;
  /** The identifiers of the pictures the load took in. */
  readonly images: readonly string[];
  /** The identifiers of the sounds the load took in. */
  readonly audios: readonly string[];
}

/** What one load carries along from file to file. */
interface LoadRun {
  readonly tooLarge: FileTooLarge[];
  /** Asked before each file inside a zip; once it answers false, the rest of the load is left. */
  readonly stillWanted: () => boolean;
  dataRead: boolean;
  readonly images: string[];
  readonly audios: string[];
}

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
   * Whether the reader may bring dropped files in, asked at each drop. A guest may not. Until the
   * app puts in its own answer, every drop is taken.
   */
  mayLoadDrops: () => boolean = () => true;
  /**
   * Told when a zip could not be packed or unpacked because the code for it could not be fetched,
   * which a reload mends. The app puts in its notice; until then nothing is said.
   */
  onCodeUnavailable: () => void = () => {};
  /**
   * The guard that asks, during online play, before dropped data overwrites the room settings; null
   * until the domain has put one in the object store.
   */
  get reloadCheck(): LoadGuard | null {
    return ObjectStore.instance.get<LoadGuard>('ReloadCheck');
  }

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
    if (!this.mayLoadDrops()) return;

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
   * Images over 2 MB and audio over 10 MB are left out, those inside a zip included, and once the
   * load is done they are announced together, so the reader learns why they did not appear. An
   * image left out that was not inside a zip is announced with the file itself and where it was
   * dropped, so it can be made smaller and added after all. Given a drop point, each image is
   * announced for placing on the table, the next one offset a little from the last. Images inside
   * a zip are not placed, and a zip exported as a CCFOLIA room is handed on whole instead.
   *
   * A zip that cannot be read is logged rather than thrown, so whether a save's data was read at all
   * is answered in the result. Given `stillWanted`, it is asked before each file inside a zip, and the
   * rest is left once it answers false.
   */
  async load(
    files: File[] | FileList,
    dropPoint?: { x: number; y: number },
    options: { stillWanted?: () => boolean } = {}
  ): Promise<LoadResult> {
    const run: LoadRun = {
      tooLarge: [],
      stillWanted: options.stillWanted ?? (() => true),
      dataRead: false,
      images: [],
      audios: [],
    };
    await this.loadFiles(files, dropPoint, true, run);
    if (run.tooLarge.length > 0) emitFilesTooLarge({ files: run.tooLarge });
    return { dataRead: run.dataRead, images: run.images, audios: run.audios };
  }

  private async loadFiles(
    files: File[] | FileList,
    dropPoint: { x: number; y: number } | undefined,
    placesDroppedImages: boolean,
    run: LoadRun
  ): Promise<void> {
    if (!files) return;
    const loadFiles: File[] = files instanceof FileList ? toArrayOfFileList(files) : files;

    let droppedImageCount = 0;
    for (const file of loadFiles) {
      const imageDropPoint = placesDroppedImages ? this.offsetDropPoint(dropPoint, droppedImageCount) : undefined;
      const isImageDropped = await this.handleImage(file, imageDropPoint, run, placesDroppedImages);
      if (isImageDropped) droppedImageCount++;
      await this.handleAudio(file, run);
      await this.handleText(file, dropPoint, run);
      await this.handleZip(file, dropPoint, run);
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
      if (image === 'oversized') oversized.push(file.name);
      else if (image) images.push(image);
    }
    if (images.length) emitFileLoaded();
    return { images, oversized };
  }

  private async handleImage(
    file: File,
    dropPoint: { x: number; y: number } | undefined,
    run: LoadRun,
    handsBackTooLarge: boolean
  ): Promise<boolean> {
    if (!file.type.startsWith('image/')) return false;
    // With no guard there is nothing to stop it.
    if (!(this.reloadCheck?.isLoadOk() ?? true)) return false;
    const image = await this.storeImage(file);
    if (image === 'oversized') {
      run.tooLarge.push({
        name: file.name,
        kind: 'image',
        limitBytes: MAX_LOADED_IMAGE_BYTES,
        ...(handsBackTooLarge ? { file, ...(dropPoint ? { dropPoint } : {}) } : {}),
      });
      return false;
    }
    if (!image) return false;
    run.images.push(image.identifier);
    if (dropPoint) emitImageDropped({ identifier: image.identifier, fileName: file.name, dropPoint });
    return dropPoint != null;
  }

  /** The picture as stored, `oversized` for one too large to take in, or null for one the room removed and keeps out. */
  private async storeImage(file: File): Promise<ImageFile | 'oversized' | null> {
    if (file.size > MAX_LOADED_IMAGE_BYTES) {
      Logger.warn(`[FileArchiver] ファイルサイズ制限超過: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return 'oversized';
    }
    return ImageStorage.instance.addAsync(file, { putBack: true });
  }

  private async handleAudio(file: File, run: LoadRun) {
    if (!file.type.startsWith('audio/')) return;
    if (file.size > MAX_LOADED_AUDIO_BYTES) {
      Logger.warn(`[FileArchiver] ファイルサイズ制限超過: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      run.tooLarge.push({ name: file.name, kind: 'audio', limitBytes: MAX_LOADED_AUDIO_BYTES });
      return;
    }
    const audio = await AudioStorage.instance.addAsync(file, { putBack: true });
    if (audio) run.audios.push(audio.identifier);
  }

  private async handleText(file: File, dropPoint: { x: number; y: number } | undefined, run: LoadRun): Promise<void> {
    if (!isXmlCandidateFile(file)) return;

    let isLoadOk = true;
    const name = baseNameOf(file.name);
    // room data passes here and is confirmed later, once its contents are known
    if (
      name === 'config.xml' ||
      name === 'imagetag.xml' ||
      name === 'imagelink.xml' ||
      name === 'audiotag.xml' ||
      name === 'playlist.xml' ||
      name === 'assetowner.xml' ||
      name === 'imagelock.xml' ||
      name === 'summary.xml' ||
      name === 'ailment.xml'
    ) {
      isLoadOk = this.reloadCheck?.isLoadOk() ?? true;
    }

    if (isLoadOk) {
      try {
        const xmlElement: Element | null = xml2element(await FileReaderUtil.readAsTextAsync(file));
        if (xmlElement) {
          if (name === 'data.xml') run.dataRead = true;
          emitXmlLoaded({ xmlElement, dropPoint });
        }
      } catch (reason) {
        Logger.warn('[FileArchiver] XML読み込みエラー', reason);
      }
    }
  }

  private async handleZip(file: File, dropPoint: { x: number; y: number } | undefined, run: LoadRun) {
    if (!file.type.includes('application/') && file.type.length > 0) return;
    let entries: ZipEntry[];
    try {
      entries = await readZipEntries(file);
    } catch (reason) {
      Logger.warn('[FileArchiver] ZIP読み込みエラー', reason);
      this.noticeCodeUnavailable(reason);
      return;
    }
    const ccfoliaFolder = ccfoliaRoomFolderOf(entries.map((entry) => entry.name));
    if (ccfoliaFolder !== null) {
      const inFolder = entries
        .filter((entry) => entry.name.startsWith(ccfoliaFolder))
        .map((entry) => ({ ...entry, name: entry.name.slice(ccfoliaFolder.length) }));
      emitCcfoliaRoomDropped({ entries: await toUnzipped(inFolder) });
      return;
    }

    if (!(await this.roomLoadAgreed(entries))) return;
    const isolated = isNetworkIsolated();

    // Pictures first, so the room data beside them can be read under the ids they were stored as.
    const renamed = new Map<string, string>();
    const rest: File[] = [];
    for (const entry of entries) {
      if (!run.stillWanted()) return;
      try {
        const type = entry.type || (await imageTypeOf(entry.blob));
        const name = baseNameOf(entry.name);
        const saved = type.startsWith('image/') && SAVED_IMAGE_NAME.test(name);
        const file = new File([entry.blob], name, { type });
        if (type.startsWith('image/') && !saved) {
          await this.loadArchivedImage(file, renamed, run);
        } else {
          rest.push(file);
        }
      } catch (reason) {
        Logger.warn('[FileArchiver] ZIP展開エラー', reason);
      }
    }
    for (const entry of rest) {
      if (isNetworkIsolated() !== isolated) {
        Logger.warn('[FileArchiver] 読み込みの途中で盤面と卓が入れ替わったので、残りを読みません');
        return;
      }
      if (!run.stillWanted()) return;
      try {
        const file = renamed.size > 0 && isXmlCandidateFile(entry) ? await withImagesRenamed(entry, renamed) : entry;
        await this.loadFiles([file], dropPoint, false, run);
      } catch (reason) {
        Logger.warn('[FileArchiver] ZIP展開エラー', reason);
      }
    }
  }

  /**
   * Whether the room data an archive carries may go in, asked before its pictures are taken in, which
   * would otherwise go up to the room for a load then declined. Asked as reading the room data asks:
   * first about a save withheld in part, then about overwriting the room in play; the answers hold
   * for the rest of the load.
   */
  private async roomLoadAgreed(entries: ZipEntry[]): Promise<boolean> {
    const guard = this.reloadCheck;
    const data = entries.find((entry) => baseNameOf(entry.name) === 'data.xml');
    if (!guard || !data) return true;
    const root = /<room\b[^>]*>/.exec(await data.blob.slice(0, ROOM_HEAD_BYTES).text())?.[0];
    if (!root) return true;
    if (/\swithheld="true"/.test(root) && !guard.answerWithheldCheck()) return false;
    return guard.answerCheck();
  }

  /**
   * Stores a picture an archive carries under a name of its own, as any picture is stored: turned
   * into a WebP where it can be, and known by the hash of what it is stored as. Room data made
   * elsewhere may name the picture by the hash of the bytes it came as instead; where the two
   * differ, the one is noted against the other in `renamed`, for that data to be read under the id
   * the picture is kept under.
   */
  private async loadArchivedImage(file: File, renamed: Map<string, string>, run: LoadRun): Promise<void> {
    if (!(this.reloadCheck?.isLoadOk() ?? true)) return;
    const original = await FileReaderUtil.calcSHA256Async(file);
    const image = await this.storeImage(file);
    if (image === 'oversized') {
      run.tooLarge.push({ name: file.name, kind: 'image', limitBytes: MAX_LOADED_IMAGE_BYTES });
    } else if (image) {
      run.images.push(image.identifier);
      if (image.identifier !== original) renamed.set(original, image.identifier);
    }
    emitFileLoaded();
  }

  /** Unpacks a zip into its entries, in a worker where one can be used. */
  async readZipEntriesAsync(file: File | Blob): Promise<ZipEntry[]> {
    try {
      return await readZipEntries(file);
    } catch (reason) {
      this.noticeCodeUnavailable(reason);
      throw reason;
    }
  }

  /**
   * Packs files into a zip, reporting 0% before and 100% after, since packing
   * reports no progress in between.
   */
  async createZipBlobAsync(files: File[] | FileList, updateCallback?: UpdateCallback): Promise<Blob> {
    const saveFiles: File[] = files instanceof FileList ? toArrayOfFileList(files) : files;

    updateCallback?.({ percent: 0, currentFile: '' });

    let blob: Blob;
    try {
      blob = await createZipBlob(saveFiles);
    } catch (reason) {
      this.noticeCodeUnavailable(reason);
      throw reason;
    }

    updateCallback?.({ percent: 100, currentFile: '' });
    return blob;
  }

  /** Packs files into a zip and hands it to the browser as a download named after `zipName`. */
  async saveAsync(files: File[] | FileList, zipName: string, updateCallback?: UpdateCallback): Promise<void> {
    if (!files) return;
    const blob = await this.createZipBlobAsync(files, updateCallback);
    downloadBlob(blob, `${zipName}.zip`);
  }

  private noticeCodeUnavailable(reason: unknown): void {
    if (reason instanceof ZipCodeUnavailableError) this.onCodeUnavailable();
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

/**
 * The name of a file within an archive, without the folders it sits in: a save unpacked and packed
 * again as a folder holds its files under that folder's name.
 */
function baseNameOf(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

/** How much of a room's data is read to find the room's own element, which opens it. */
const ROOM_HEAD_BYTES = 4096;

/** The name a picture is saved under in a room's archive: the hash it is known by, then its extension. */
const SAVED_IMAGE_NAME = /^[0-9a-f]{64}\./;

/** A picture's id, as a run of 64 hex digits standing on its own. */
const IMAGE_ID = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/g;

/** Room data with every picture id in `renamed` given the id the picture was stored under. */
async function withImagesRenamed(file: File, renamed: ReadonlyMap<string, string>): Promise<File> {
  const text = await FileReaderUtil.readAsTextAsync(file);
  const rewritten = text.replace(IMAGE_ID, (id) => renamed.get(id) ?? id);
  return rewritten === text ? file : new File([rewritten], file.name, { type: file.type });
}
