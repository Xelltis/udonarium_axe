import { inject, Injectable } from '@angular/core';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { Network } from '@axe/core/index';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { downscaleImageBlob } from '@axe/core/storage/image-downscale';
import { ImageFile, ImageState } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import * as MimeType from '@axe/core/storage/mime-type';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { downloadBlob } from '@axe/core/util/download-blob';
import { formatXml } from '@axe/core/util/format-xml';
import { PromiseQueue } from '@axe/core/util/promise-queue';
import { xml2element } from '@axe/core/util/xml-util';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { ChatLogImages, exportChatLog } from '@axe/domain/chat/chat-log-export';
import { ChatLogImageSrcResolver, ChatLogTab, ChatLogTextDecoder } from '@axe/domain/chat/chat-log-exporter';
import { ChatLogLabels, ChatLogScope } from '@axe/domain/chat/chat-log-rich';
import { ChatLogStyle } from '@axe/domain/chat/chat-log-style';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { AudioTagList } from '@axe/domain/media/audio-tag-list';
import { carriedImagesOf } from '@axe/domain/media/carried-images';
import { ImageTagList } from '@axe/domain/media/image-tag-list';
import { Config } from '@axe/domain/peer/config';
import { Room } from '@axe/domain/peer/room';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
type UpdateCallback = (percent: number) => void;

/**
 * What an attribute naming a picture is called, rather than a list of the ones thought of.
 *
 * A save carries the pictures the room points at and finds them by walking its own XML, so a
 * picture named by an attribute nobody looks for is left behind: the room comes back with the
 * thing it was hanging on gone. A list has to be added to whenever a picture is, and a list
 * that misses the four walls brings the room back with blank walls and every piece standing on
 * one with nowhere to be drawn. The name is the rule instead, as it already is for a replay.
 */
const IMAGE_ATTRIBUTE = /ImageIdentifier$|^imageIdentifier$/;

/** Several pictures under one name, which is its own spelling and read on its own terms. */
const ATTACHMENT_IMAGE_ATTRIBUTE = 'attachmentImageIdentifiers';

const CHAT_LOG_IMAGE_DECODE_LIMIT = 4;

@Injectable({
  providedIn: 'root',
})
export class SaveDataService {
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly chatTabList = inject(ChatTabList);
  private readonly appConfig = inject(Config);
  private readonly dataSummarySetting = inject(DataSummarySetting);
  private readonly statusAilmentCatalog = inject(StatusAilmentCatalog);
  private readonly translate = inject(TRANSLATE_FN);

  // The exporter would write a raw `@i18n:key:{params}` message, as system notices are,
  // so the translated text is substituted before it gets there.
  private readonly chatLogTextDecoder: ChatLogTextDecoder = (text) => decodeI18nMessage(text, this.translate);

  private static queue: PromiseQueue = new PromiseQueue('SaveDataServiceQueue');

  /**
   * Saves the whole room as a zip download, named with a timestamp and reporting progress as a
   * percentage.
   *
   * The archive holds the room, chat, config, summary setting and status catalogue as XML, with the
   * pictures they refer to and the audio list. Saves are queued, so one never overlaps another.
   */
  saveRoomAsync(fileName: string = '', updateCallback?: UpdateCallback): Promise<void> {
    return SaveDataService.queue.add(() => this._saveRoomAsync(fileName, updateCallback));
  }

  /**
   * Builds the same archive as `saveRoomAsync` as a blob, without downloading it. Used for room
   * snapshots; queued with the saves.
   */
  createRoomArchiveAsync(): Promise<Blob> {
    return SaveDataService.queue.add(() => this.fileArchiver.createZipBlobAsync(this.buildRoomFiles(false)));
  }

  /**
   * Archive files for the wanted pictures and audio: each loaded picture and each sound held here
   * as a file, with the picture and audio tag lists.
   *
   * Pictures still loading are left out, as is hidden audio and a sound whose bytes this browser
   * does not hold, such as one only linked to. A sound goes in under the name it was added with,
   * so it is read back under that name, with an extension for its kind where the name has none
   * and a number added where two share a name.
   */
  buildAssetFiles(wanted: { images: ReadonlySet<string>; audios: ReadonlySet<string> }): File[] {
    const files: File[] = [];
    const images = this.imageStorage.images.filter(
      (image) => image.state === ImageState.COMPLETE && wanted.images.has(image.identifier)
    );
    for (const image of images) {
      const file = this.createImageArchiveFile(image);
      if (file) files.push(file);
    }
    files.push(new File([this.convertToXml(ImageTagList.create(images))], 'imagetag.xml', { type: 'text/plain' }));

    const audios = this.audioStorage.audios.filter((audio) => !audio.isHidden && wanted.audios.has(audio.identifier));
    const taken = new Set(files.map((file) => file.name.toLowerCase()));
    for (const audio of audios) {
      const file = createAudioArchiveFile(audio, taken);
      if (file) files.push(file);
    }
    files.push(new File([this.convertToXml(AudioTagList.create(audios))], 'audiotag.xml', { type: 'text/plain' }));
    return files;
  }

  private _saveRoomAsync(fileName: string = '', updateCallback?: UpdateCallback): Promise<void> {
    return this.saveAsync(this.buildRoomFiles(), this.appendTimestamp(fileName), updateCallback);
  }

  private buildRoomXmlParts(pretty: boolean): { roomXml: string; chatXml: string; files: File[] } {
    const roomXml = this.convertToXml(new Room(), pretty);
    const chatXml = this.convertToXml(this.chatTabList, pretty);
    const configXml = this.convertToXml(this.appConfig, pretty);
    const summarySetting = this.convertToXml(this.dataSummarySetting, pretty);
    const ailmentCatalog = this.convertToXml(this.statusAilmentCatalog, pretty);
    const files: File[] = [
      new File([roomXml], 'data.xml', { type: 'text/plain' }),
      new File([chatXml], 'chat.xml', { type: 'text/plain' }),
      new File([configXml], 'config.xml', { type: 'text/plain' }),
      new File([summarySetting], 'summary.xml', { type: 'text/plain' }),
      new File([ailmentCatalog], 'ailment.xml', { type: 'text/plain' }),
    ];
    return { roomXml, chatXml, files };
  }

  private buildRoomFiles(pretty = true): File[] {
    const { roomXml, chatXml, files } = this.buildRoomXmlParts(pretty);

    const images: ImageFile[] = this.withCarried(
      [...this.searchImageFiles(roomXml), ...this.searchImageFiles(chatXml)],
      ObjectStore.instance.getObjects(WhiteBoard)
    );
    for (const image of images) {
      const file = this.createImageArchiveFile(image);
      if (file) files.push(file);
    }

    const imageTagXml = this.convertToXml(ImageTagList.create(images), pretty);
    files.push(new File([imageTagXml], 'imagetag.xml', { type: 'text/plain' }));

    const audios: AudioFile[] = this.audioStorage.audios.filter((a) => !a.isHidden);
    const audioTagXml = this.convertToXml(AudioTagList.create(audios), pretty);
    files.push(new File([audioTagXml], 'audiotag.xml', { type: 'text/plain' }));

    return files;
  }

  /**
   * Saves one object, such as a character, table or chat tab, as a zip download with the pictures
   * it refers to.
   *
   * The file is named with a timestamp and progress is reported as a percentage. Queued with the
   * other saves.
   */
  saveGameObjectAsync(
    gameObject: GameObject,
    fileName: string = 'xml_data',
    updateCallback?: UpdateCallback
  ): Promise<void> {
    return SaveDataService.queue.add(() => this._saveGameObjectAsync(gameObject, fileName, updateCallback));
  }

  private _saveGameObjectAsync(
    gameObject: GameObject,
    fileName: string = 'xml_data',
    updateCallback?: UpdateCallback
  ): Promise<void> {
    const files: File[] = [];
    const xml: string = this.convertToXml(gameObject);

    files.push(new File([xml], 'data.xml', { type: 'text/plain' }));
    const images: ImageFile[] = this.withCarried(this.searchImageFiles(xml), [gameObject]);
    for (const image of images) {
      const file = this.createImageArchiveFile(image);
      if (file) files.push(file);
    }

    const imageTagXml = this.convertToXml(ImageTagList.create(images));
    files.push(new File([imageTagXml], 'imagetag.xml', { type: 'text/plain' }));

    return this.saveAsync(files, this.appendTimestamp(fileName), updateCallback);
  }

  private saveAsync(files: File[], zipName: string, updateCallback?: UpdateCallback): Promise<void> {
    let progressPercent = -1;
    return this.fileArchiver.saveAsync(files, zipName, (meta) => {
      const percent = meta.percent | 0;
      if (percent <= progressPercent) return;
      progressPercent = percent;
      updateCallback?.(progressPercent);
    });
  }

  private createImageArchiveFile(image: ImageFile): File | null {
    if (image.state !== ImageState.COMPLETE) return null;

    const blob = image.blob;
    if (!blob) return null;

    return new File([blob], image.identifier + '.' + MimeType.extension(blob.type), {
      type: blob.type,
    });
  }

  private convertToXml(gameObject: GameObject, pretty = true): string {
    const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';
    const xml = xmlDeclaration + gameObject.toXml();
    return pretty ? formatXml(xml, { indentation: '  ', lineSeparator: '\n' }) : xml;
  }
  /** Adds the pictures an object names for itself, which no walk of its XML could find. */
  private withCarried(found: ImageFile[], carriers: readonly unknown[]): ImageFile[] {
    const kept = new Map(found.map((image) => [image.identifier, image]));
    for (const carrier of carriers) {
      for (const identifier of carriedImagesOf(carrier)) {
        if (kept.has(identifier)) continue;
        const image = this.imageStorage.get(identifier);
        if (image) kept.set(identifier, image);
      }
    }
    return [...kept.values()];
  }

  private searchImageFiles(xml: string): ImageFile[] {
    const xmlElement: Element | null = xml2element(xml);

    const files: ImageFile[] = [];
    if (!xmlElement) return files;

    const images: { [identifier: string]: ImageFile | null } = {};
    const imageElements = xmlElement.ownerDocument.querySelectorAll('*[type="image"]');

    for (let i = 0; i < imageElements.length; i++) {
      const identifier = imageElements[i].innerHTML;
      images[identifier] = this.imageStorage.get(identifier);
    }

    for (const element of Array.from(xmlElement.ownerDocument.querySelectorAll('*'))) {
      for (const { name, value } of Array.from(element.attributes)) {
        if (!value || !IMAGE_ATTRIBUTE.test(name)) continue;
        images[value] = this.imageStorage.get(value);
      }
      const attachmentImageIdentifiers = element.getAttribute(ATTACHMENT_IMAGE_ATTRIBUTE) ?? '';
      for (const attachmentImageIdentifier of this.parseAttachmentImageIdentifiers(attachmentImageIdentifiers)) {
        if (attachmentImageIdentifier) {
          images[attachmentImageIdentifier] = this.imageStorage.get(attachmentImageIdentifier);
        }
      }
    }
    for (const image of Object.values(images)) {
      if (image) {
        files.push(image);
      }
    }
    return files;
  }

  private parseAttachmentImageIdentifiers(value: string): string[] {
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

  /** Downloads chat tabs as an HTML log named after the room, with portraits and attachments shrunk and embedded. */
  async saveChatLog(
    style: ChatLogStyle,
    scope: ChatLogScope,
    tabs: readonly ChatLogTab[],
    label: string
  ): Promise<void> {
    const images = await this.prepareChatLogImages(tabs);
    const text = this.renderChatLog(style, scope, tabs, images);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, this.appendTimestamp(`${this.chatLogRoomName()}_log_${label}`) + '.html');
  }

  /**
   * Renders chat tabs as HTML log text, using images already prepared by `prepareChatLogImages`,
   * without downloading anything.
   */
  renderChatLog(style: ChatLogStyle, scope: ChatLogScope, tabs: readonly ChatLogTab[], images: ChatLogImages): string {
    const body = exportChatLog(style, scope, tabs, {
      imageSrcResolver: images.resolver,
      textDecoder: this.chatLogTextDecoder,
      showTime: this.chatTabList.simpleDispFlagTime,
      roomName: Network.peerContext?.roomName || undefined,
      labels: this.chatLogLabels(),
      lang: document.documentElement.lang || undefined,
      exportedAt: Date.now(),
    });
    return SaveDataService.injectImageRegistry(body, images.registryScript);
  }

  private chatLogRoomName(): string {
    return Network.peerContext?.roomName || this.translate('app.roomDataDefault');
  }

  private chatLogLabels(): ChatLogLabels {
    const label = (key: string, params?: Record<string, unknown>) =>
      this.translate(`feature.chat.log.labels.${key}`, params);
    return {
      secret: label('secret'),
      edited: label('edited'),
      quote: label('quote'),
      reply: label('reply'),
      critical: label('critical'),
      fumble: label('fumble'),
      success: label('success'),
      failure: label('failure'),
      allTabs: label('allTabs'),
      everyTab: label('everyTab'),
      messages: (count) => label('messages', { count }),
      exportedWith: label('exportedWith'),
    };
  }

  private static readonly PORTRAIT_MAX_DIMENSION = 96;
  private static readonly ATTACHMENT_MAX_DIMENSION = 360;

  /**
   * In case an image appears more than once, a registry maps a short key to each data url and
   * each image carries only that key. A script fills in the sources on load, which removes the
   * duplicated base64 and shrinks the html enormously.
   */
  async prepareChatLogImages(chatTabs: readonly ChatLogTab[]): Promise<ChatLogImages> {
    const portraitIds = new Set<string>();
    const seen = new Map<string, ImageFile>();
    for (const chatTab of chatTabs) {
      for (const message of chatTab.chatMessages) {
        const portrait = message.image;
        if (portrait) {
          seen.set(portrait.identifier, portrait);
          portraitIds.add(portrait.identifier);
        }
        for (const image of message.attachmentImages) {
          if (!seen.has(image.identifier)) seen.set(image.identifier, image);
        }
      }
    }

    const keyByIdentifier = new Map<string, string>();
    const srcByKey: Record<string, string> = {};
    let nextIndex = 0;
    const images = [...seen.values()];
    for (let from = 0; from < images.length; from += CHAT_LOG_IMAGE_DECODE_LIMIT) {
      await Promise.all(
        images.slice(from, from + CHAT_LOG_IMAGE_DECODE_LIMIT).map(async (image) => {
          const isPortrait = portraitIds.has(image.identifier);
          const maxDimension = isPortrait
            ? SaveDataService.PORTRAIT_MAX_DIMENSION
            : SaveDataService.ATTACHMENT_MAX_DIMENSION;
          const src = await this.createChatLogImageSrc(image, maxDimension, isPortrait);
          if (!src) return;
          const key = `i${nextIndex++}`;
          keyByIdentifier.set(image.identifier, key);
          srcByKey[key] = src;
        })
      );
    }

    const resolver: ChatLogImageSrcResolver = (image) => keyByIdentifier.get(image.identifier) ?? '';
    const registryScript = SaveDataService.buildImageRegistryScript(srcByKey);
    return { resolver, registryScript };
  }

  private async createChatLogImageSrc(image: ImageFile, maxDimension: number, square = false): Promise<string> {
    let blob = image.blob;
    if (blob) {
      if (maxDimension > 0) {
        blob = (await downscaleImageBlob(blob, maxDimension, { square })) ?? blob;
      }
      return FileReaderUtil.readAsDataURLAsync(blob);
    }

    const url = image.url;
    if (!url || url.startsWith('data:')) return url;
    return (await this.createChatLogImageSrcFromUrl(url, maxDimension, square)) ?? url;
  }

  private async createChatLogImageSrcFromUrl(
    url: string,
    maxDimension: number,
    square: boolean
  ): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      let blob = await response.blob();
      if (maxDimension > 0) {
        blob = (await downscaleImageBlob(blob, maxDimension, { square })) ?? blob;
      }
      return FileReaderUtil.readAsDataURLAsync(blob);
    } catch {
      return null;
    }
  }

  private static buildImageRegistryScript(srcByKey: Record<string, string>): string {
    if (Object.keys(srcByKey).length === 0) return '';
    // neither base64 nor a fetched url can carry a closing script tag, but escape it anyway
    const json = JSON.stringify(srcByKey).replace(/<\/(script)/gi, '<\\/$1');
    return (
      `<script>(function(){var m=${json};` +
      `document.querySelectorAll('img[data-img-key]').forEach(function(el){` +
      `var k=el.getAttribute('data-img-key');` +
      `if(k&&Object.prototype.hasOwnProperty.call(m,k))el.setAttribute('src',m[k]);` +
      `});})();</script>`
    );
  }

  private static injectImageRegistry(html: string, registryScript: string): string {
    if (!registryScript) return html;
    const lastBodyClose = html.lastIndexOf('</body>');
    if (lastBodyClose < 0) return html + '\n' + registryScript;
    return html.slice(0, lastBodyClose) + registryScript + '\n' + html.slice(lastBodyClose);
  }

  private appendTimestamp(fileName: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = ('00' + (date.getMonth() + 1)).slice(-2);
    const day = ('00' + date.getDate()).slice(-2);
    const hours = ('00' + date.getHours()).slice(-2);
    const minutes = ('00' + date.getMinutes()).slice(-2);

    return fileName + `_${year}-${month}-${day}_${hours}${minutes}`;
  }
}

const AUDIO_EXTENSION_OF_TYPE: Readonly<Record<string, string>> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'm4a',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
};

/**
 * A sound as a file of its own, under the name it was added with and an extension that is read
 * back as a sound, numbered where the name is `taken` already. Null when its bytes are not held
 * here or its kind has no such extension.
 */
function createAudioArchiveFile(audio: AudioFile, taken: Set<string>): File | null {
  const blob = audio.blob;
  if (!blob) return null;
  const dot = audio.name.lastIndexOf('.');
  const named = dot > 0 ? audio.name.slice(dot + 1).toLowerCase() : '';
  const isSoundName = MimeType.type(`sound.${named}`).startsWith('audio/');
  const extension = isSoundName ? named : AUDIO_EXTENSION_OF_TYPE[blob.type];
  if (!extension) return null;
  const stem = (isSoundName ? audio.name.slice(0, dot) : audio.name).trim() || audio.identifier;
  let name = `${stem}.${extension}`;
  for (let copy = 2; taken.has(name.toLowerCase()); copy++) name = `${stem} (${copy}).${extension}`;
  taken.add(name.toLowerCase());
  return new File([blob], name, { type: MimeType.type(`sound.${extension}`) });
}
