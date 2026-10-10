import { NgClass } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { callCursorMove, callHeartBeat } from '@axe/core/event/domain-events';
import { getPeerContexts, getPeerIds } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole, roleBadgeClass, roleShortLabelKey } from '@axe/domain/peer/peer-role';
import { toTransformCss } from '@axe/ui/directives/movable-helpers';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'peer-cursor, [peer-cursor]',
  templateUrl: './peer-cursor.component.html',
  host: { class: 'block' },
  imports: [NgClass, SafePipe],
})
export class PeerCursorComponent {
  private static readonly _sentLogoutIdentifiers = new Set<string>();

  private readonly batchService = inject(BatchService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly t = inject(TRANSLATE_FN);

  readonly cursorElementRef = viewChild<ElementRef>('cursor');
  readonly opacityElementRef = viewChild<ElementRef>('opacity');
  readonly cursor = input(PeerCursor.myCursor);

  readonly iconUrl = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor().image?.url ?? '';
  });
  readonly showRoleBadge = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor().role !== PeerRole.Player;
  });
  readonly roleBadgeText = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.t(roleShortLabelKey(this.cursor().role));
  });
  readonly roleBadgeClass = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return roleBadgeClass(this.cursor().role);
  });

  readonly name = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor().name;
  });
  readonly isMine = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor()?.isMine ?? false;
  });
  /**
   * The room's chat tab list, which holds the system tab that connection notices about this peer
   * are posted to.
   */
  get chatTabList(): ChatTabList {
    return this.objectStore.get<ChatTabList>('ChatTabList')!;
  }

  private cursorElement: HTMLElement | null = null;
  private opacityElement: HTMLElement | null = null;
  private fadeOutTimer: ResettableTimeout | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private timestampTimer: ReturnType<typeof setTimeout> | null = null;
  private timestampTimerEnabled = false;

  private callcack: (e: Event) => void = (e) => this.onMouseMove(e);

  private _x = 0;
  private _y = 0;
  private _target!: HTMLElement;

  /**
   * How long cursor movement is held back before being sent or animated, in milliseconds: 16.6 per
   * connected peer, never under 100, so a crowded room sends less often.
   */
  get delayMs(): number {
    const maxDelay = getPeerIds().length * 16.6;
    return maxDelay < 100 ? 100 : maxDelay;
  }

  /**
   * How often a heartbeat is sent, or a peer's silence checked, in milliseconds: 166 per connected
   * peer, never under 1000.
   */
  get delayMsHb(): number {
    const maxDelay = getPeerIds().length * 166;
    return maxDelay < 1000 ? 1000 : maxDelay;
  }

  constructor() {
    this.objectChange.cursorMove$.subscribe((event) => {
      if (event.sendFrom !== this.cursor().peerId) return;
      if (!this.cursorElement) return;
      this.batchService.add(() => {
        this.stopTransition();
        this.setAnimatedTransition();
        this.setPosition(event.x, event.y, event.z);
        this.resetFadeOut();
      }, this);
    }, this.destroyRef);

    this.objectChange.heartBeat$.subscribe((event) => {
      if (event.sendFrom !== this.cursor().peerId) return;

      this.batchService.add(() => {
        this.cursor().timestampSend = event.timestamp;
        this.cursor().timestampReceive = Date.now();
        this.cursor().timeDiffDown =
          this.cursor().timestampReceive - this.cursor().timestampSend + PeerCursor.myCursor.debugReceiveDelay;

        const messId = event.id;
        const diffUp = event.diffDown;
        this.cursor().lastTimeSignNo = event.secdCounter;
        if (this.cursor().firstTimeSignNo < 0) {
          this.cursor().firstTimeSignNo = event.secdCounter;
        }
        this.cursor().totalTimeSignNum++;

        if (messId == PeerCursor.myCursor.peerId) {
          if (diffUp != null) {
            this.cursor().timeDiffUp = diffUp;
            this.cursor().timeLatency = diffUp + this.cursor().timeDiffDown;
          }
        }
      }, this);
    }, this.destroyRef);

    afterNextRender(() => {
      if (this.isMine()) {
        document.body.addEventListener('mousemove', this.callcack);
        document.body.addEventListener('touchmove', this.callcack);
      } else {
        this.cursorElement = this.cursorElementRef()?.nativeElement;
        this.opacityElement = this.opacityElementRef()?.nativeElement;
        this.setAnimatedTransition();
        this.setPosition(0, 0, 0);
        this.resetFadeOut();
      }

      this.timestampTimerEnabled = true;
      this.timestampLoop();
    });

    this.destroyRef.onDestroy(() => {
      this.logoutMessage();

      document.body.removeEventListener('mousemove', this.callcack);
      document.body.removeEventListener('touchmove', this.callcack);
      this.batchService.remove(this);
      if (this.fadeOutTimer) this.fadeOutTimer.clear();

      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
      }
      if (this.timestampTimer) {
        clearTimeout(this.timestampTimer);
        this.timestampTimer = null;
      }
      this.timestampTimerEnabled = false;
    });
  }

  private chkDisConnect() {
    const timeout = PeerCursor.myCursor.timeout * 1000;
    const elapsedTime = Date.now() - this.cursor().timestampReceive;

    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    const sysTab = chatTabList!.systemMessageTab;

    if (timeout <= elapsedTime) {
      if (!this.cursor().isDisConnect) {
        this.cursor().isDisConnect = true;
        if (sysTab) {
          const text = encodeI18nMessage('feature.lobby.peerCursor.noSignal', {
            name: this.cursor().name || this.cursor().userId.slice(0, 6),
            seconds: PeerCursor.myCursor.timeout,
          });
          this.chatMessageService.sendSystemMessageOnePlayer(sysTab, text, PeerCursor.myCursor.identifier, '#006633');
        }
      }
    } else {
      if (this.cursor().isDisConnect) {
        setTimeout(() => {
          this.timestampTimer = null;
          const text = encodeI18nMessage('feature.lobby.peerCursor.reconnected', {
            name: this.cursor().name || this.cursor().userId.slice(0, 6),
          });
          if (sysTab) {
            this.chatMessageService.sendSystemMessageOnePlayer(sysTab, text, PeerCursor.myCursor.identifier, '#006633');
          }
        }, 1000);
      }
      this.cursor().isDisConnect = false;
    }
  }

  private logoutMessage() {
    if (!this.cursor() || this.cursor().isMine) return;
    const identifier = this.cursor().identifier;
    if (PeerCursorComponent._sentLogoutIdentifiers.has(identifier)) return;
    PeerCursorComponent._sentLogoutIdentifiers.add(identifier);
    setTimeout(() => PeerCursorComponent._sentLogoutIdentifiers.delete(identifier), 60_000);
    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    if (!chatTabList) return;
    const sysTab = chatTabList.systemMessageTab;
    if (sysTab) {
      const text = encodeI18nMessage('feature.lobby.peerCursor.loggedOut', {
        name: this.cursor().name || this.cursor().userId.slice(0, 6),
      });
      this.chatMessageService.sendSystemMessageOnePlayer(sysTab, text, PeerCursor.myCursor.identifier, '#006633');
    }
  }

  private secdCounter = 0;
  private indexCounter = 0;

  private timestampLoop() {
    if (!this.timestampTimerEnabled) return;
    if (!this.timestampTimer) {
      this.timestampTimer = setTimeout(() => {
        this.timestampTimer = null;

        if (PeerCursor.myCursor.peerId == this.cursor().peerId) {
          const peerlength = getPeerContexts().length;
          if (peerlength) {
            if (peerlength <= this.indexCounter) this.indexCounter = 0;
            const timestanmp = Date.now() + PeerCursor.myCursor.debugTimeShift;
            const peerContext = getPeerContexts()[this.indexCounter] || null;
            let id = '';
            if (peerContext) {
              if (getPeerContexts()[this.indexCounter].isOpen) {
                id = getPeerContexts()[this.indexCounter].peerId;
              }
            }

            const peerCursor = PeerCursor.findByPeerId(id);
            const diffDown = peerCursor ? peerCursor.timeDiffDown : null;

            callHeartBeat([timestanmp, id, diffDown, this.secdCounter]);
            this.indexCounter++;
            this.secdCounter++;
          }
        } else {
          this.chkDisConnect();
        }

        this.timestampLoop();
      }, this.delayMsHb);
    }
  }

  private onMouseMove(e: Event) {
    const x = (e as TouchEvent).touches ? (e as TouchEvent).changedTouches[0].pageX : (e as MouseEvent).pageX;
    const y = (e as TouchEvent).touches ? (e as TouchEvent).changedTouches[0].pageY : (e as MouseEvent).pageY;
    if (x === this._x && y === this._y) return;
    this._x = x;
    this._y = y;
    this._target = e.target as HTMLElement;
    if (!this.updateTimer) {
      this.updateTimer = setTimeout(() => {
        this.updateTimer = null;
        this.calcLocalCoordinate(this._x, this._y, this._target);
      }, this.delayMs);
    }
  }

  private calcLocalCoordinate(x: number, y: number, target: HTMLElement) {
    if (!target.closest('#app-table-layer')) return;

    let coordinate: PointerCoordinate = { x, y, z: 0 };
    coordinate = this.coordinateService.calcTabletopLocalCoordinate(coordinate, target);

    callCursorMove([coordinate.x, coordinate.y, coordinate.z]);
  }

  private resetFadeOut() {
    this.opacityElement!.style.opacity = '1.0';
    if (this.fadeOutTimer == null) {
      this.fadeOutTimer = new ResettableTimeout(() => {
        this.opacityElement!.style.opacity = '0.0';
      }, 3000);
    }
    this.fadeOutTimer.reset();
  }

  private stopTransition() {
    this.cursorElement!.style.transform = window.getComputedStyle(this.cursorElement!).transform;
  }

  private setAnimatedTransition() {
    this.cursorElement!.style.transition = `transform ${this.delayMs + 33}ms linear, opacity 0.5s ease-out`;
  }

  private setPosition(x: number, y: number, z: number) {
    this.cursorElement!.style.transform = toTransformCss(x, y, z, '');
  }
}
