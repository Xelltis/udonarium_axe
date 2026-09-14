import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { PeerContext } from '@axe/core/network/peer-context';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  PasswordCheckComponent,
  type PasswordCheckOptions,
} from '@axe/features/lobby/password-check/password-check.component';
import { RoomSettingComponent } from '@axe/features/lobby/room-setting/room-setting.component';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'lobby',
  templateUrl: './lobby.component.html',
  host: { class: 'block' },
  imports: [TextTooltipDirective, TranslocoModule],
})
export class LobbyComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly roomJoin = inject(RoomJoinService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);

  rooms = signal<{ alias: string; roomName: string; peerContexts: PeerContext[] }[]>([]);

  isReloading = signal(false);

  help = signal(this.t('feature.lobby.lobby.hintInitial'));

  /**
   * The id of the room this peer is in, which disables joining that same room from the list; empty
   * outside a room.
   */
  get currentRoom(): string {
    return Network.peerContext.roomId;
  }
  /** This peer's id on the network. */
  get peerId(): string {
    return Network.peerId;
  }
  readonly isConnected = computed(() => {
    this.objectChange.networkVersion();
    return Network.peerIds.length > 1;
  });

  /** The reader's own cursor, which keeps the password of a joined room for reconnecting. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  constructor() {
    queueMicrotask(() => this.changeTitle());
    this.objectChange.networkOpen$.subscribe(() => {
      this.changeTitle();
      if (Network.peerContext.isRoom) {
        queueMicrotask(() => this.modalService.resolve());
        return;
      }
      if (!this.isReloading()) this.reload();
    }, this.destroyRef);
    this.objectChange.peerConnect$.subscribe(() => {
      this.changeTitle();
    }, this.destroyRef);
    if (Network.isOpen) {
      this.reload();
    }
  }

  private changeTitle() {
    this.modalService.title = this.panelService.title = this.t('feature.lobby.lobby.title');
    this.modalService.titleTooltip = this.panelService.titleTooltip = '';
    if (Network.peerContext.roomName.length) {
      const name = Network.peerContext.roomName;
      const roomId = Network.peerContext.roomId;
      const truncated = name.length > 16 ? name.slice(0, 16) + '…' : name;
      this.modalService.title = this.panelService.title = '＜' + truncated + '/' + roomId + '＞';
      this.modalService.titleTooltip = this.panelService.titleTooltip = name + '/' + roomId;
    }
  }

  /**
   * Fetches the open rooms and lists them sorted, with a hint underneath.
   *
   * The list is emptied while it loads. The fetch gives up after 15 seconds, and a failure is shown
   * as the hint.
   */
  async reload() {
    this.isReloading.set(true);
    this.help.set(this.t('feature.lobby.lobby.hintSearching'));
    this.rooms.set([]);
    try {
      const roomInfos = await Promise.race([
        Network.listAllRooms(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      const roomsList: { alias: string; roomName: string; peerContexts: PeerContext[] }[] = roomInfos.map((room) => ({
        alias: room.id + room.name,
        roomName: room.name,
        peerContexts: room.peers as PeerContext[],
      }));
      roomsList.sort((a, b) => {
        if (a.alias < b.alias) return -1;
        if (a.alias > b.alias) return 1;
        return 0;
      });
      this.rooms.set(roomsList);
      this.help.set(this.t('feature.lobby.lobby.hintNoRooms'));
    } catch (e) {
      Logger.error('[Lobby] failed to fetch room list', e);
      this.help.set(this.t('feature.lobby.lobby.hintListFailed'));
    } finally {
      this.isReloading.set(false);
    }
  }

  /**
   * Joins the room a list entry stands for, asking for its password first when it has one.
   *
   * The password is kept on the reader's cursor for reconnecting. A wrong password leaves the lobby
   * open; a successful join closes it.
   */
  async connect(peerContexts: PeerContext[]) {
    const context = peerContexts[0];
    let password = '';

    if (context.hasPassword) {
      const options: PasswordCheckOptions = {
        peerContext: context,
        title: `${context.roomName}/${context.roomId}`,
      };
      password = await this.modalService.open<string>(PasswordCheckComponent, options);
      if (password == null) password = '';
      this.myPeer.reConnectPass = password;
    }

    if (!(await context.verifyPassword(password))) return;

    void this.roomJoin.join(peerContexts, password).then((isJoined) => {
      if (isJoined) this.modalService.resolve();
    });
  }

  /**
   * Opens the dialog for creating a room, and refreshes the room list when it closes without
   * creating one.
   */
  async showRoomSetting() {
    const created = await this.modalService.open<boolean>(RoomSettingComponent, {
      width: 700,
      height: 400,
      left: 0,
      top: 400,
    });
    if (!created) {
      this.reload();
    }
  }
}
