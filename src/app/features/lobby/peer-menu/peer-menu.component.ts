import { DatePipe } from '@angular/common';
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
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { leavingLoss, leavingLossText } from '@axe/application/lobby/leaving-loss';
import { roomDeletionMessageKey, RoomDeletionService } from '@axe/application/lobby/room-deletion.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { transportOf } from '@axe/core/network/transport';
import { loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { buildInviteLink } from '@axe/domain/peer/invite-link';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  ASSIGNABLE_PEER_ROLES,
  DEFAULT_PEER_ROLE,
  PeerRole,
  roleBadgeClass,
  roleShortLabelKey,
} from '@axe/domain/peer/peer-role';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { IdleSeatService } from '@axe/features/lobby/idle-seat.service';
import { dropInvitationFromAddress } from '@axe/features/lobby/leave-room';
import { LobbyComponent } from '@axe/features/lobby/lobby/lobby.component';
import { ReConnectComponent } from '@axe/features/lobby/re-connect/re-connect.component';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** Where an invitation is kept: one for each room and role. */
function inviteKey(roomKey: string | null, role: PeerRole): string {
  return `${roomKey ?? ''}:${role}`;
}

/** How long before it runs out an invitation from the room server is asked for afresh. */
const INVITE_RENEW_MARGIN_MS = 24 * 60 * 60 * 1000;

/** How this browser takes part: with the others over the network, or alone. */
export const CONNECTION_MODES = ['online', 'offline'] as const;
export type ConnectionMode = (typeof CONNECTION_MODES)[number];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'peer-menu',
  templateUrl: './peer-menu.component.html',
  imports: [FormsModule, DatePipe, SafePipe, TranslocoModule],
})
export class PeerMenuComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly modalService = inject(ModalService);
  private readonly localModePreference = inject(LocalModePreferenceService);

  private readonly confirm = inject(ConfirmService);
  protected readonly idleSeat = inject(IdleSeatService);
  private readonly roomArchive = inject(RoomArchiveEventHandlerService);
  /** Whether the page is on its way to reloading into the mode chosen, which takes no second choice. */
  private switchingMode = false;
  private readonly roomDeletion = inject(RoomDeletionService);

  /** Whether the room is being deleted from here, which holds the button back. */
  protected readonly isDeletingRoom = signal(false);
  /** Why the room could not be deleted from here; empty while nothing went wrong. */
  protected readonly roomDeletionFailure = signal('');

  /**
   * Whether this browser plays on its own, with nobody else to reach, or over the network.
   *
   * The two are set up at the start, so moving from one to the other means starting again:
   * the choice is written down and the page reloads into it.
   */
  readonly isOffline = this.localModePreference.enabled;
  readonly connectionModes = CONNECTION_MODES;

  /** Whether this browser is set to play online or alone, for the switch between the two. */
  connectionMode(): ConnectionMode {
    return this.isOffline() ? 'offline' : 'online';
  }

  /**
   * Switches between playing online and playing alone, once the reader has confirmed.
   *
   * Going offline leaves the room, so the question also says what leaving a room server's room now
   * would lose, the room is kept in this browser's automatic save first, and the invitation is taken
   * off the address, which would wait for the room offline and go back into it online. The choice is
   * written down in this browser and the page reloads into it, without the browser asking again
   * whether to leave, which would keep the page in the mode left. Choosing the mode already in use,
   * or another while on the way to one, does nothing.
   */
  async chooseConnectionMode(mode: ConnectionMode): Promise<void> {
    if (mode === this.connectionMode() || this.switchingMode) return;
    const lost = mode === 'offline' ? leavingLossText(leavingLoss(), this.t) : '';
    const question = this.t(
      mode === 'offline' ? 'feature.lobby.peerMenu.confirmOffline' : 'feature.lobby.peerMenu.confirmOnline'
    );
    const asked = await this.confirm.ask(lost ? `${question}\n${lost}` : question);
    if (!asked) return;
    this.switchingMode = true;
    await this.roomArchive.flush();
    this.localModePreference.set(mode === 'offline');
    if (mode === 'offline') dropInvitationFromAddress();
    Network.letPageGo();
    this.reload();
  }

  protected reload(): void {
    location.reload();
  }
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly destroyRef = inject(DestroyRef);
  networkService = Network;
  gameRoomService = this.objectStore;
  readonly help = signal('');
  readonly isPasswordVisible = signal(false);
  readonly dispDetailFlag = signal(false);

  readonly assignableRoles = ASSIGNABLE_PEER_ROLES;
  /**
   * Whether a room server decides the roles, which nobody then takes for themselves. Followed from
   * the config, which may load after the panel opens at startup.
   */
  protected readonly isServerTransport = signal(Network.transport === 'server');
  protected readonly roleShortLabelKey = roleShortLabelKey;
  protected readonly roleBadgeClass = roleBadgeClass;

  /**
   * The roles a link may invite in. A room server signs an invitation, so its game master may
   * invite in any role, a fellow game master among them.
   */
  protected readonly inviteRoles = computed<readonly PeerRole[]>(() =>
    this.isServerTransport()
      ? [PeerRole.GameMaster, PeerRole.Player, PeerRole.Guest]
      : [PeerRole.Player, PeerRole.Guest]
  );
  protected readonly inviteRole = signal<PeerRole>(PeerRole.Player);
  /** The invitations the room server has signed this session, by room and role, while they last. */
  private readonly serverInvites = signal<ReadonlyMap<string, { invite: string; expiresAt: number }>>(new Map());
  /**
   * Bumped when the room server keeps a role as it was, so that the role pickers are drawn again
   * from the roles as they stand rather than as last picked.
   */
  protected readonly roleSelectsDrawn = signal(0);
  /** The invitations being asked for, so a request is not sent again while one is on its way. */
  private readonly askingInvites = new Set<string>();
  /** Whether the room server turned down or did not answer the last request for an invitation. */
  protected readonly serverInviteFailed = signal(false);
  /**
   * Whether the reader is the game master, followed as their cursor changes: the room server may
   * make them one, or no longer one, at any time.
   */
  protected readonly amGameMaster = computed(() => {
    this.objectChange.networkVersion();
    this.objectChange.versionOf(PeerCursor.myCursor?.identifier ?? '')();
    return PeerCursor.isMyselfGameMaster;
  });
  /** The invitation in the link, on a room server, while the reader is the game master. */
  private readonly serverInvite = computed(() => {
    this.objectChange.networkVersion();
    if (!this.isServerTransport() || !this.amGameMaster()) return null;
    return this.serverInvites().get(inviteKey(Network.roomKey, this.inviteRole())) ?? null;
  });
  /** When the invitation in the link runs out, on a room server; null without one. */
  protected readonly serverInviteExpiresAt = computed(() => this.serverInvite()?.expiresAt ?? null);
  protected readonly includePasswordInInvite = signal(true);
  protected readonly inviteOverlay = signal(false);
  protected readonly isInviteCopied = transientSignal(false, 2000);

  protected readonly inviteLink = computed(() => {
    this.objectChange.networkVersion();
    const peer = Network.peerContext;
    if (!peer?.isRoom) return '';

    return buildInviteLink(location.origin + location.pathname, {
      roomId: peer.roomId,
      roomName: peer.roomName,
      roomKey: Network.roomKey ?? '',
      password: this.includePasswordInInvite() ? peer.password : '',
      role: this.isServerTransport() ? null : this.inviteRole(),
      overlay: this.inviteOverlay(),
      invite: this.serverInvite()?.invite ?? '',
    });
  });

  /** This browser's own cursor, which carries the reader's name, icon, role and timeout. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  /** Takes the seat let out for the page left alone back into its room. */
  protected comeBackFromIdle(): void {
    this.idleSeat.comeBack();
  }

  /**
   * Deletes the room on the room server, once the reader has confirmed. The server then closes it
   * for everybody, which takes the reader back to waiting; only a refusal or a failure is said here.
   */
  async deleteRoom(): Promise<void> {
    const roomKey = Network.roomKey;
    if (!roomKey || this.isDeletingRoom()) return;
    this.isDeletingRoom.set(true);
    this.roomDeletionFailure.set('');
    try {
      const { roomName, roomId } = Network.peerContext;
      const outcome = await this.roomDeletion.delete({ roomKey, name: roomName, id: roomId });
      const key = outcome === 'deleted' ? null : roomDeletionMessageKey(outcome);
      if (key) this.roomDeletionFailure.set(this.t(key));
    } finally {
      this.isDeletingRoom.set(false);
    }
  }

  /** Whether the reader is the game master, who may give the other peers their roles. */
  get isMyselfGameMaster(): boolean {
    return PeerCursor.isMyselfGameMaster;
  }

  /** The role of the peer with this ID, or the default role while its cursor has not arrived. */
  findPeerRole(peerId: string): PeerRole {
    return PeerCursor.findByPeerId(peerId)?.role ?? DEFAULT_PEER_ROLE;
  }

  /** The first six characters of a peer ID, enough to tell the peers on the list apart. */
  shortId(peerId: string): string {
    return peerId.slice(0, 6);
  }

  /**
   * Whether the reader may take this role for themselves. Any role but game master may be taken;
   * that one only while no game master is connected, or by the game master themselves.
   */
  isRoleSelfAssignable(role: PeerRole): boolean {
    if (role !== PeerRole.GameMaster) return true;
    return this.isMyselfGameMaster || !this.hasConnectedGameMaster();
  }

  private hasConnectedGameMaster(): boolean {
    return this.objectStore.getObjects<PeerCursor>(PeerCursor).some((cursor) => cursor.isGameMaster);
  }

  /**
   * Takes a role for the reader, which the room sees.
   *
   * The role is written down in this browser along with the room, so reconnecting keeps it. Outside
   * a room only the role is written, beside the tab's user id and the room it was last in, which
   * waiting or playing offline knows nothing of; but a game master's role taken there forgets that
   * room where the seat was not one, as it would come back as one beside the room's own. Nothing is
   * written while a replay's board is on the table, cut off from the room, where the role is taken on
   * the recording's cursor and goes with it. Does nothing for a role the reader may not take.
   */
  setMyRole(role: PeerRole) {
    if (!this.isRoleSelfAssignable(role)) return;
    this.myPeer.role = role;
    this.myPeer.update();
    const peer = Network.peerContext;
    if (isNetworkIsolated()) return;
    if (!peer.isRoom) {
      const saved = loadIdentity();
      if (!saved) return;
      const promoted = role === PeerRole.GameMaster && saved.roomRole !== PeerRole.GameMaster;
      saveIdentity(
        promoted ? { ...saved, role, roomRole: '', roomId: '', roomName: '', roomKey: '' } : { ...saved, role }
      );
      return;
    }
    saveIdentity({
      userId: peer.userId,
      roomId: peer.roomId,
      roomName: peer.roomName,
      role,
      reConnectPass: this.myPeer.reConnectPass,
      roomKey: Network.roomKey ?? '',
    });
  }

  /**
   * Asks the room server for an invitation in a role, for the game master's link, unless one for
   * that role is in hand with a day still to run. Anybody else's link carries none.
   */
  private async requestServerInvite(role: PeerRole): Promise<void> {
    if (!this.isServerTransport() || !Network.peerContext.isRoom || !this.isMyselfGameMaster) return;
    const key = inviteKey(Network.roomKey, role);
    const held = this.serverInvites().get(key);
    if (held && held.expiresAt - Date.now() > INVITE_RENEW_MARGIN_MS) return;
    if (this.askingInvites.has(key)) return;
    this.askingInvites.add(key);
    try {
      const answer = await Network.requestInvite(role);
      if (!answer.invite || answer.expiresAt == null) {
        this.serverInviteFailed.set(true);
        return;
      }
      const invites = new Map(this.serverInvites());
      invites.set(key, { invite: answer.invite, expiresAt: answer.expiresAt });
      this.serverInvites.set(invites);
      this.serverInviteFailed.set(false);
    } catch {
      this.serverInviteFailed.set(true);
    } finally {
      this.askingInvites.delete(key);
    }
  }

  protected async copyInviteLink(): Promise<void> {
    const link = this.inviteLink();
    if (link.length < 1) return;

    try {
      await navigator.clipboard.writeText(link);
      this.isInviteCopied.show(true);
    } catch (reason) {
      Logger.warn('[PeerMenu] 招待リンクをクリップボードにコピーできませんでした', reason);
    }
  }

  protected selectInviteLink(event: Event): void {
    (event.target as HTMLInputElement | null)?.select();
  }

  /**
   * Gives another peer a role, as the game master; on a room server, asks the server to. Does
   * nothing for anybody else, for the reader's own cursor, or for a peer that has gone.
   */
  reassignRole(peerId: string, role: PeerRole) {
    if (!this.isMyselfGameMaster) return;
    const cursor = PeerCursor.findByPeerId(peerId);
    if (!cursor || cursor.isMine) return;
    // A room server keeps the roles, so the game master asks it, and it changes the cursor
    // for everybody or says why not.
    const authority = Network.authorityPeerId;
    if (authority) {
      networkSend('ROLE_REQUEST', { peerId, role }, authority);
      return;
    }
    cursor.role = role;
    cursor.update();
  }

  constructor() {
    this.objectChange.loadConfig$.subscribe((event) => {
      this.isServerTransport.set(transportOf(event.config as Record<string, unknown>) === 'server');
    }, this.destroyRef);
    networkMessage$.subscribe((message) => {
      if (message.eventName === 'ROLE_REJECTED') this.roleSelectsDrawn.update((drawn) => drawn + 1);
    }, this.destroyRef);
    effect(() => {
      const role = this.inviteRole();
      const gameMaster = this.amGameMaster();
      this.objectChange.networkVersion();
      untracked(() => {
        // What the last request came to says nothing of this one, nor of a reader who is no longer
        // the game master, whose invitations are put away.
        this.serverInviteFailed.set(false);
        if (!gameMaster) {
          this.serverInvites.set(new Map());
          return;
        }
        void this.requestServerInvite(role);
      });
    });
    queueMicrotask(() => (this.panelService.title = this.t('common.panel.peerMenu')));
    const timer = setInterval(() => this.dispInfo(), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /**
   * Opens the image picker and makes the chosen image the reader's icon. Closing it without a
   * choice changes nothing.
   */
  changeIcon() {
    this.modalService.open<string>(FileSelecterComponent).then((value) => {
      if (!this.myPeer || !value) return;
      this.myPeer.imageIdentifier = value;
    });
  }

  /**
   * Opens the lobby, to find a room to join; on a room server, at any time, since its top is where
   * the reader logs in or out.
   */
  showLobby() {
    this.modalService.open(LobbyComponent, {
      title: this.t('feature.lobby.lobby.title'),
      width: 700,
      height: 400,
      left: 0,
      top: 400,
    });
  }

  /** Opens the dialog for connecting to the room again. */
  showReConnect() {
    this.modalService.open(ReConnectComponent, {
      width: 700,
      height: 400,
      left: 0,
      top: 400,
    });
  }

  /**
   * Whether there is a room to connect to again: anybody else is connected, the peers listed being
   * the others, or, on a room server, the server is, which holds the room whoever else is in it.
   */
  get shouldShowReconnectButton(): boolean {
    return this.networkService.peerIds.length > 0 || this.networkService.authorityPeerId !== null;
  }

  /** Whether there is a connection to ask for the whole room over: a peer, or the room server. */
  get canRequestFullSync(): boolean {
    return 0 < this.networkService.peerIds.length || this.networkService.authorityPeerId !== null;
  }

  /**
   * Asks the connected peers to send the whole room again, and says in the chat how many were
   * asked; on a room server, which alone holds the room, that it was asked.
   */
  requestFullSync() {
    const peerCount = ObjectSynchronizer.instance.requestFullSync();
    const notice =
      this.networkService.authorityPeerId !== null
        ? encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequestedFromServer')
        : encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequested', { count: peerCount });
    this.chatMessageService.sendSystemMessage(notice);
  }

  /** Shows the room's password as plain text, or hides it again. */
  togglePasswordVisibility() {
    this.isPasswordVisible.update((v) => !v);
  }

  /** The user ID of the peer with this peer ID, or empty while its cursor has not arrived. */
  findUserId(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.userId : '';
  }

  /** The name of the peer with this ID, or empty while its cursor has not arrived. */
  findPeerName(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.name : '';
  }

  /**
   * When the peer's last heartbeat was sent, by its own clock; 0 while its cursor has not arrived
   * and -1 before any heartbeat.
   */
  findPeerTimeSend(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timestampSend : 0;
  }

  /** When the peer's last heartbeat arrived here; zero or less while none has. */
  findPeerTimeReceive(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timestampReceive : 0;
  }

  /**
   * How long this browser's heartbeat took to reach the peer, as the peer reported back, in
   * milliseconds; 0 while unknown.
   */
  findPeerTimeDiffUp(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timeDiffUp : 0;
  }

  /**
   * How long the peer's last heartbeat took to arrive here, in milliseconds, any difference between
   * the two clocks included; 0 while its cursor has not arrived.
   */
  findPeerTimeDiffDown(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timeDiffDown : 0;
  }

  /**
   * The round trip to the peer and back in seconds, the two ways added together; `--` while its
   * cursor has not arrived.
   */
  findPeerTimeLatency(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    if (!peerCursor) return '--';

    return peerCursor ? peerCursor.timeLatency / 1000 : 99999;
  }

  /**
   * How many of the peer's heartbeats have arrived against how many it has sent since the first one
   * did, as arrived/sent; `0/0` before any.
   */
  findPeerDegreeOfSuccess(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    if (!peerCursor) return '0/0';
    if (peerCursor.firstTimeSignNo < 0) return '0/0';
    const degree = peerCursor.totalTimeSignNum + '/' + (peerCursor.lastTimeSignNo - peerCursor.firstTimeSignNo + 1);
    return degree;
  }

  myTime = signal(0);
  /** Moves on the clock shown in the menu, which the menu does every second while it is open. */
  dispInfo() {
    this.myTime.set(Date.now());
  }
}
