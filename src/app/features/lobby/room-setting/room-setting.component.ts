import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { saveIdentity } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { carriesWithheldInto } from '@axe/domain/peer/withheld-table';
import { LeaveRoomService } from '@axe/features/lobby/leave-room';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
import { WithheldEntryService } from '@axe/features/lobby/withheld-entry';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-setting',
  templateUrl: './room-setting.component.html',
  host: { class: 'block' },
  imports: [FormsModule, TranslocoModule],
})
export class RoomSettingComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly leaveRoomService = inject(LeaveRoomService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly reach = inject(NetworkReachService);
  private readonly withheldEntry = inject(WithheldEntryService);

  readonly roomName = signal<string>(this.t('feature.lobby.roomSetting.defaultRoomName'));
  readonly password = signal<string>('');
  readonly roomNameTooLong = computed(() => this.roomName().length > 255);
  /** Why the room server would not create the room, shown in the dialog; empty until it refuses. */
  readonly createError = signal('');
  readonly isCreating = signal(false);
  /**
   * Whether a SkyWay room cannot be made yet, the connection it would be opened through not being
   * open: a room opened then fails on its token and is gone with nothing said.
   */
  protected readonly waitingForConnection = computed(() => {
    this.objectChange.networkVersion();
    return Network.transport !== 'server' && !Network.isOpen;
  });
  /** Whether that wait is over without a connection, every try to connect having failed, which only a reload mends. */
  protected readonly unreachable = computed(() => this.waitingForConnection() && this.reach.unreachable());

  /** This browser's peer ID on the network. */
  get peerId(): string {
    return Network.peerId;
  }
  /**
   * Whether this seat is in a room it would have to leave before making one: among peers, joined
   * with anyone else, the peers listed being the others; on a room server, in any room, since
   * going straight into the new one would carry this table into it.
   */
  readonly isConnected = computed(() => {
    this.objectChange.networkVersion();
    return Network.transport === 'server' ? Network.peerContext.isRoom : Network.peerIds.length > 0;
  });
  /** Whether rooms are kept by a room server, which outlasts the last one to leave for a while. */
  protected readonly onRoomServer = Network.transport === 'server';

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
  }

  /**
   * Opens a new room under the name and password typed in, and closes the dialog.
   *
   * Whoever creates a room becomes its game master, a guest as well as a player. The room and the role are written down in
   * this browser so it can find its way back after a reload. A table holding parts only in the
   * shape a room server withholds goes into the new room only once the reader says to.
   */
  createRoom() {
    if (Network.transport !== 'server' && !Network.isOpen) return;
    if (!carriesWithheldInto(null)) {
      this.openNewRoom();
      return;
    }
    void this.withheldEntry.mayEnter(null).then((sure) => {
      if (sure && !this.isConnected() && (Network.transport === 'server' || Network.isOpen)) this.openNewRoom();
    });
  }

  private openNewRoom(): void {
    if (Network.transport === 'server') {
      void this.createServerRoom();
      return;
    }
    const userId = Network.peerContext ? Network.peerContext.userId : PeerContext.generateUserId();
    const roomId = PeerContext.generateId('***');
    Network.open(userId, roomId, this.roomName(), this.password());
    PeerCursor.myCursor.peerId = Network.peerId;
    if (PeerCursor.myCursor.role !== PeerRole.GameMaster) PeerCursor.myCursor.role = PeerRole.GameMaster;
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
   * Creates the room on the room server, which gives it its key and id and makes its creator the
   * game master, then opens it as the SkyWay one is opened. A refusal, such as too many rooms
   * created at once, leaves the dialog open and says why.
   */
  private async createServerRoom(): Promise<void> {
    // A room this seat came into while the form was open would go along into the new one.
    if (this.isCreating() || Network.peerContext.isRoom) return;
    this.isCreating.set(true);
    this.createError.set('');
    try {
      const { roomKey, roomId } = await Network.createRoom(this.roomName(), this.password());
      // Come into a room meanwhile, the seat stays there, the new room keeping for another time.
      if (Network.peerContext.isRoom) return;
      const userId = Network.peerContext ? Network.peerContext.userId : PeerContext.generateUserId();
      Network.open(userId, roomId, this.roomName(), this.password(), roomKey);
      PeerCursor.myCursor.peerId = Network.peerId;
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
      this.createError.set(
        reason === 'login-required'
          ? this.t('feature.lobby.roomSetting.loginRequired')
          : this.t('feature.lobby.roomSetting.createFailed', { reason })
      );
    } finally {
      this.isCreating.set(false);
    }
  }

  /**
   * Leaves this room for the lobby, by loading the page afresh without its invitation, once the
   * reader has said they are sure when leaving would lose something.
   */
  protected leaveRoom(): void {
    void this.leaveRoomService.leave();
  }
}
