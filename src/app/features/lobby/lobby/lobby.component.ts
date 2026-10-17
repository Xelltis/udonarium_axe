import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { roomDeletionMessageKey, RoomDeletionService } from '@axe/application/lobby/room-deletion.service';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { LeaveRoomService } from '@axe/features/lobby/leave-room';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
import {
  PasswordCheckComponent,
  type PasswordCheckOptions,
} from '@axe/features/lobby/password-check/password-check.component';
import { RoomSettingComponent } from '@axe/features/lobby/room-setting/room-setting.component';
import { ServerAccountComponent } from '@axe/features/lobby/server-account/server-account.component';
import { WithheldEntryService } from '@axe/features/lobby/withheld-entry';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

/** One row of the room list: the room as the transport reports it, and the peers SkyWay found in it. */
interface LobbyRoom {
  alias: string;
  roomName: string;
  info: IRoomInfo;
  peerContexts: PeerContext[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'lobby',
  templateUrl: './lobby.component.html',
  host: { class: 'block' },
  imports: [ServerAccountComponent, TextTooltipDirective, TranslocoModule],
})
export class LobbyComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly leaveRoomService = inject(LeaveRoomService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly roomJoin = inject(RoomJoinService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(ServerAuthService);
  private readonly roomDeletion = inject(RoomDeletionService);
  private readonly reach = inject(NetworkReachService);
  private readonly withheldEntry = inject(WithheldEntryService);

  /** Whether rooms are on a room server, where creating one takes a login. */
  protected readonly isServerTransport = Network.transport === 'server';
  /** Whether the reader would have to log in before creating a room. */
  protected readonly mustLogInToCreate = computed(() => this.isServerTransport && !this.auth.isLoggedIn());
  /** Whether rooms can be created here at all: a room server without a login keeps none. */
  protected readonly canCreateRoom = computed(() => !this.isServerTransport || this.auth.offersLogin() !== false);

  rooms = signal<LobbyRoom[]>([]);

  isReloading = signal(false);

  /** Whether a join from the list is under way, which holds the other join buttons back. */
  readonly isJoining = signal(false);

  /** Whether a room is being deleted from the list, which holds the other delete buttons back. */
  readonly isDeleting = signal(false);

  /** What became of the last room deleted from the list; empty until one is. */
  protected readonly deletionNotice = signal('');

  /** Whether the join under way is waiting for this seat's previous connection to drop. */
  protected readonly waitingForPreviousConnection = this.roomJoin.waitingForPreviousConnection;

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
  /**
   * Whether this seat is in a room it would have to leave before going to another: among peers,
   * joined with anyone else, the peers listed being the others; on a room server, in any room,
   * since going straight into another would carry this table into it. A reload leaves the room,
   * which the server keeps.
   */
  readonly isConnected = computed(() => {
    this.objectChange.networkVersion();
    if (Network.transport === 'server') return Network.peerContext.isRoom;
    return Network.peerIds.length > 0;
  });

  /** The reader's own cursor, which keeps the password of a joined room for reconnecting. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  constructor() {
    queueMicrotask(() => this.changeTitle());
    // Coming into a room closes the lobby, but not going into the same room again, as on a login or
    // a logout made here, which would take away what the account section has to say about it.
    // Only a room the seat is in already counts, not one it is still getting into.
    let roomIn = Network.isOpen && Network.peerContext?.isRoom ? Network.peerContext.roomId : '';
    this.objectChange.networkOpen$.subscribe(() => {
      this.changeTitle();
      const peer = Network.peerContext;
      const cameBack = peer.isRoom && peer.roomId === roomIn;
      roomIn = peer.isRoom ? peer.roomId : '';
      if (peer.isRoom) {
        if (!cameBack) queueMicrotask(() => this.modalService.resolve());
        return;
      }
      if (!this.isReloading()) this.reload();
    }, this.destroyRef);
    this.objectChange.peerConnect$.subscribe(() => {
      this.changeTitle();
    }, this.destroyRef);
    if (Network.isOpen) {
      this.reload();
    } else if (Network.transport !== 'server') {
      this.help.set(this.t('feature.lobby.lobby.hintConnecting'));
    }
    effect(() => {
      if (this.reach.unreachable()) untracked(() => this.sayUnreachable());
    });
  }

  /** Empties the list and says the server cannot be reached, and to reload the page, which is the way back. */
  private sayUnreachable(): void {
    this.rooms.set([]);
    this.help.set(this.t('feature.lobby.lobby.hintUnreachable'));
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
   * as the hint. Once reaching the network has been given up on, nothing is fetched, and the hint says
   * so and to reload the page, which is the way back. Nor is anything fetched while the SkyWay
   * connection the list comes through is still opening, which the hint says rather than that there
   * are no rooms; the list is fetched again as it opens.
   */
  async reload() {
    if (this.reach.unreachable()) {
      this.sayUnreachable();
      return;
    }
    if (Network.transport !== 'server' && !Network.isOpen) {
      this.rooms.set([]);
      this.help.set(this.t('feature.lobby.lobby.hintConnecting'));
      return;
    }
    this.isReloading.set(true);
    if (this.isServerTransport) void this.auth.refreshProviders();
    this.help.set(this.t('feature.lobby.lobby.hintSearching'));
    this.rooms.set([]);
    try {
      const roomInfos = await Promise.race([
        Network.listAllRooms(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      const roomsList: LobbyRoom[] = roomInfos.map((room) => ({
        alias: room.id + room.name,
        roomName: room.name,
        info: room,
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
      const noBackend = e instanceof ServerRoomApiError && e.code === 'no-backend';
      this.help.set(this.t(noBackend ? 'feature.lobby.lobby.hintNoBackend' : 'feature.lobby.lobby.hintListFailed'));
    } finally {
      this.isReloading.set(false);
    }
  }

  /**
   * Joins the room a list entry stands for, asking for its password first when it has one.
   *
   * The password is kept on the reader's cursor for reconnecting. A wrong password leaves the lobby
   * open; a successful join closes it. One join goes at a time: a second press while one is under
   * way, which can take up to a minute after a reload, does nothing.
   */
  async connect(peerContexts: PeerContext[]) {
    if (this.isJoining()) return;
    this.isJoining.set(true);
    let isJoinStarted = false;
    try {
      const context = peerContexts[0];
      let password = '';
      if (!(await this.withheldEntry.mayEnter(null))) return;

      if (context.hasPassword) {
        const options: PasswordCheckOptions = {
          peerContext: context,
          title: `${context.roomName}/${context.roomId}`,
        };
        password = await this.modalService.open<string>(PasswordCheckComponent, options);
        if (password == null) password = '';
      }

      if (!(await context.verifyPassword(password))) return;
      // Joined by somebody while the password was asked for, the seat stays in that room, its own
      // password kept for reconnecting, rather than carry the table off into this one.
      if (Network.peerIds.length > 0) return;
      if (context.hasPassword) this.myPeer.reConnectPass = password;

      isJoinStarted = true;
      void this.roomJoin
        .join(peerContexts, password)
        .then((isJoined) => {
          if (isJoined) this.modalService.resolve();
        })
        .finally(() => this.isJoining.set(false));
    } finally {
      if (!isJoinStarted) this.isJoining.set(false);
    }
  }

  /** Joins the room a row stands for, through the room server or among the SkyWay peers in it. */
  connectRoom(row: LobbyRoom): Promise<void> {
    return Network.transport === 'server' ? this.connectServer(row.info) : this.connect(row.peerContexts);
  }

  /**
   * Joins a room on a room server, asking for its password first when it has one. The server
   * checks the password as the room is joined, so a wrong one ends the join rather than the dialog.
   */
  async connectServer(room: IRoomInfo) {
    if (this.isJoining()) return;
    this.isJoining.set(true);
    let isJoinStarted = false;
    try {
      if (!(await this.withheldEntry.mayEnter(room.roomKey ?? null))) return;
      let password = '';
      if (room.hasPassword) {
        const options: PasswordCheckOptions = { checkedByServer: true, title: `${room.name}/${room.id}` };
        const typed = await this.modalService.open<string>(PasswordCheckComponent, options);
        if (typed == null) return;
        password = typed;
      }
      // A room this seat came into while the password was asked for would go along into this one.
      if (Network.peerContext.isRoom) return;
      // Kept for reconnecting, a room without a key keeping none, so another room's is not carried in.
      this.myPeer.reConnectPass = password;

      isJoinStarted = true;
      void this.roomJoin
        .joinServerRoom(room, password)
        .then((isJoined) => {
          if (isJoined) this.modalService.resolve();
        })
        .finally(() => this.isJoining.set(false));
    } finally {
      if (!isJoinStarted) this.isJoining.set(false);
    }
  }

  /**
   * Deletes a room the reader is a GM of, once they have confirmed, and lists the rooms again
   * when it is gone. What became of it is said above the list.
   */
  async deleteRoom(row: LobbyRoom): Promise<void> {
    const roomKey = row.info.roomKey;
    if (!roomKey || this.isDeleting()) return;
    this.isDeleting.set(true);
    this.deletionNotice.set('');
    try {
      const outcome = await this.roomDeletion.delete({ roomKey, name: row.roomName, id: row.info.id });
      if (outcome === 'deleted' || outcome === 'gone') await this.reload();
      const key = roomDeletionMessageKey(outcome);
      if (key) this.deletionNotice.set(this.t(key));
    } finally {
      this.isDeleting.set(false);
    }
  }

  /**
   * Opens the dialog for creating a room, and refreshes the room list when it closes without
   * creating one. On a room server, somebody not logged in is sent to log in first.
   */
  async showRoomSetting() {
    if (this.mustLogInToCreate()) {
      void this.auth.startLogin();
      return;
    }
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

  /**
   * Leaves this room for the lobby, by loading the page afresh without its invitation, once the
   * reader has said they are sure when leaving would lose something.
   */
  protected leaveRoom(): void {
    void this.leaveRoomService.leave();
  }
}
