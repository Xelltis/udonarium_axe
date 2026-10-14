import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { saveIdentity } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-setting',
  templateUrl: './room-setting.component.html',
  host: { class: 'block' },
  imports: [FormsModule, TranslocoModule],
})
export class RoomSettingComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);

  readonly roomName = signal<string>(this.t('feature.lobby.roomSetting.defaultRoomName'));
  readonly password = signal<string>('');
  readonly roomNameTooLong = computed(() => this.roomName().length > 255);
  /** Why the room server would not create the room, shown in the dialog; empty until it refuses. */
  readonly createError = signal('');
  readonly isCreating = signal(false);

  /** This browser's peer ID on the network. */
  get peerId(): string {
    return Network.peerId;
  }
  readonly isConnected = computed(() => Network.peerIds.length > 1);

  /**
   * This browser's own cursor, which carries the reader's role and the password kept for
   * reconnecting.
   */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  constructor() {
    queueMicrotask(
      () => (this.modalService.title = this.panelService.title = this.t('feature.lobby.roomSetting.title'))
    );
    effect(() => {
      this.myPeer.reConnectPass = this.password();
    });
  }

  /**
   * Opens a new room under the name and password typed in, and closes the dialog.
   *
   * A player who creates a room becomes its game master. The room and the role are written down in
   * this browser so it can find its way back after a reload.
   */
  createRoom() {
    if (Network.transport === 'server') {
      void this.createServerRoom();
      return;
    }
    const userId = Network.peerContext ? Network.peerContext.userId : PeerContext.generateUserId();
    const roomId = PeerContext.generateId('***');
    Network.open(userId, roomId, this.roomName(), this.password());
    PeerCursor.myCursor.peerId = Network.peerId;
    if (PeerCursor.myCursor.role === PeerRole.Player) PeerCursor.myCursor.role = PeerRole.GameMaster;
    this.myPeer.reConnectPass = this.password();
    saveIdentity({
      userId,
      roomId,
      roomName: this.roomName(),
      role: PeerCursor.myCursor.role,
      reConnectPass: this.password(),
    });
    this.modalService.resolve(true);
  }

  /**
   * Creates the room on the room server, which gives it its key and id, then opens it as the
   * SkyWay one is opened. A refusal, such as too many rooms created at once, leaves the dialog open
   * and says why.
   */
  private async createServerRoom(): Promise<void> {
    if (this.isCreating()) return;
    this.isCreating.set(true);
    this.createError.set('');
    try {
      const { roomKey, roomId } = await Network.createRoom(this.roomName(), this.password());
      const userId = Network.peerContext ? Network.peerContext.userId : PeerContext.generateUserId();
      Network.open(userId, roomId, this.roomName(), this.password(), roomKey);
      PeerCursor.myCursor.peerId = Network.peerId;
      if (PeerCursor.myCursor.role === PeerRole.Player) PeerCursor.myCursor.role = PeerRole.GameMaster;
      this.myPeer.reConnectPass = this.password();
      saveIdentity({
        userId,
        roomId,
        roomName: this.roomName(),
        role: PeerCursor.myCursor.role,
        reConnectPass: this.password(),
        roomKey,
      });
      this.modalService.resolve(true);
    } catch (e) {
      const reason = e instanceof ServerRoomApiError ? e.code : String(e);
      this.createError.set(this.t('feature.lobby.roomSetting.createFailed', { reason }));
    } finally {
      this.isCreating.set(false);
    }
  }
}
