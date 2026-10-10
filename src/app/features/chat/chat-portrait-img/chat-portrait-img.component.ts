import { NgStyle } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

const PORTRAIT_COUNT = 12;
const PORTRAIT_OPACITY_BACKGROUND = 0.66;
const PORTRAIT_ZINDEX_FRONT = 11;
const PORTRAIT_ZINDEX_OFFSET = 10;

export interface PortraitSlot {
  readonly pos: number;
  readonly imageFileUrl: string;
  readonly zIndex: number;
  readonly opacity: number;
  readonly height: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-portrait-img',
  templateUrl: './chat-portrait-img.component.html',
  imports: [NgStyle, SafePipe],
})
export class ChatPortraitImageComponent {
  chatMessageService = inject(ChatMessageService);
  readonly vnMode = inject(VisualNovelModeService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectChange = inject(ObjectChangeService);

  readonly chatTabidentifier = input('');
  readonly isTilteTop = input(false);
  readonly dispByMouse = input(false);

  private readonly portraitAreaEl = viewChild.required<ElementRef>('portraitArea');

  readonly portraitAreaWidth = signal(0);

  constructor() {
    afterNextRender(() => {
      this.portraitAreaWidth.set(this.portraitAreaEl().nativeElement.offsetWidth);
    });
    afterEveryRender(() => {
      const w: number = this.portraitAreaEl().nativeElement.offsetWidth;
      if (w !== this.portraitAreaWidth()) this.portraitAreaWidth.set(w);
    });
  }

  private readonly version = computed(() => this.objectChange.versionOf(this.chatTabidentifier())());

  private readonly chatTabListVersion = computed(() => this.objectChange.versionOf('ChatTabList')());

  private readonly fileVer = computed(() => this.objectChange.fileVersion());

  /** The chat tab whose portraits are shown, looked up from the bound identifier. */
  get chatTab(): ChatTab {
    this.version();
    return this.objectStore.get<ChatTab>(this.chatTabidentifier())!;
  }

  /** The room's chat tab list, which holds the portrait settings every tab shares. */
  get chatTabList(): ChatTabList {
    return this.objectStore.get<ChatTabList>('ChatTabList')!;
  }

  readonly isPortraitInWindow = computed<boolean>(() => {
    this.chatTabListVersion();
    return this.chatTabList?.isPortraitInWindow === true;
  });

  readonly portraitYPos = computed<number>(() => {
    this.chatTabListVersion();
    const h = this.chatTabList?.portraitHeight ?? 0;
    if (!this.isPortraitInWindow()) return -h - 28;
    return 0;
  });

  readonly isPortraitDispMode = computed<boolean>(() => {
    this.chatTabListVersion();
    const chatTabList = this.chatTabList;
    if (!chatTabList) return false;
    const isTilteTop = this.isTilteTop();
    const dispFlag = (isTilteTop && !chatTabList.isPortraitInWindow) || (!isTilteTop && chatTabList.isPortraitInWindow);
    if (chatTabList.isKeepPortraitOutWindow) return dispFlag;
    return dispFlag && this.dispByMouse();
  });

  readonly portraitSlots = computed<PortraitSlot[]>(() => {
    this.version();
    this.chatTabListVersion();
    this.fileVer();
    const chatTab = this.chatTab;
    const chatTabList = this.chatTabList;
    const slots: PortraitSlot[] = [];

    for (let pos = 0; pos < PORTRAIT_COUNT; pos++) {
      const imageIdentifier = chatTab?.imageIdentifier?.[pos] ?? '';
      const imageFile = imageIdentifier ? this.imageStorage.get(imageIdentifier) : null;
      const imageFileUrl = imageFile ? imageFile.url : '';

      const rawZIndex = chatTab?.portraitZIndex(pos) ?? 0;
      const zIndex = rawZIndex + PORTRAIT_ZINDEX_OFFSET;
      const opacity = rawZIndex === PORTRAIT_ZINDEX_FRONT ? 1 : PORTRAIT_OPACITY_BACKGROUND;

      let height = 0;
      if (chatTab?.portraitDisplayFlag && chatTab.isPortraitPosVisible(pos)) {
        height = chatTabList?.portraitHeight ?? 0;
      }

      slots.push({ pos, imageFileUrl, zIndex, opacity, height });
    }
    return slots;
  });

  readonly bandHeight = computed<number>(() => {
    if (!this.isPortraitInWindow() || this.vnMode.active()) return 0;
    if (!this.chatTab?.portraitDisplayFlag || !this.isPortraitDispMode()) return 0;
    return this.portraitSlots().some((slot) => slot.imageFileUrl && 0 < slot.height)
      ? (this.chatTabList?.portraitHeight ?? 0)
      : 0;
  });

  /**
   * Hides the portrait standing at this position when the user presses on it; the flag is kept on
   * the chat tab itself.
   */
  portraitClick(pos: number): void {
    this.chatTab.hidePortraitPos(pos);
  }
}
