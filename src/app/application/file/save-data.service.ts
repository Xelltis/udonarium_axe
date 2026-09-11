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

  saveRoomAsync(fileName: string = '', updateCallback?: UpdateCallback): Promise<void> {
    return SaveDataService.queue.add(() => this._saveRoomAsync(fileName, updateCallback));
  }

  createRoomArchiveAsync(): Promise<Blob> {
    return SaveDataService.queue.add(() => this.fileArchiver.createZipBlobAsync(this.buildRoomFiles(false)));
  }

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
    let imageElements = xmlElement.ownerDocument.querySelectorAll('*[type="image"]');

    for (let i = 0; i < imageElements.length; i++) {
      const identifier = imageElements[i].innerHTML;
      images[identifier] = this.imageStorage.get(identifier);
    }

    imageElements = xmlElement.ownerDocument.querySelectorAll(
      '*[imageIdentifier], *[backgroundImageIdentifier], *[attachmentImageIdentifiers]'
    );

    for (let i = 0; i < imageElements.length; i++) {
      const identifier = imageElements[i].getAttribute('imageIdentifier');
      if (identifier) images[identifier] = this.imageStorage.get(identifier);
      const backgroundImageIdentifier = imageElements[i].getAttribute('backgroundImageIdentifier');
      if (backgroundImageIdentifier)
        images[backgroundImageIdentifier] = this.imageStorage.get(backgroundImageIdentifier);
      const attachmentImageIdentifiers = imageElements[i].getAttribute('attachmentImageIdentifiers') ?? '';
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
