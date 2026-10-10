import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { saveIdentity } from '@axe/core/storage/identity-storage';
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
import { LobbyComponent } from '@axe/features/lobby/lobby/lobby.component';
import { ReConnectComponent } from '@axe/features/lobby/re-connect/re-connect.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

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
   * The choice is written down in this browser and the page reloads into it. Choosing the mode
   * already in use does nothing.
   */
  async chooseConnectionMode(mode: ConnectionMode): Promise<void> {
    if (mode === this.connectionMode()) return;
    const asked = await this.confirm.ask(
      this.t(mode === 'offline' ? 'feature.lobby.peerMenu.confirmOffline' : 'feature.lobby.peerMenu.confirmOnline')
    );
    if (!asked) return;
    this.localModePreference.set(mode === 'offline');
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
  protected readonly roleShortLabelKey = roleShortLabelKey;
  protected readonly roleBadgeClass = roleBadgeClass;

  protected readonly inviteRoles: readonly PeerRole[] = [PeerRole.Player, PeerRole.Guest];
  protected readonly inviteRole = signal<PeerRole>(PeerRole.Player);
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
      password: this.includePasswordInInvite() ? peer.password : '',
      role: this.inviteRole(),
      overlay: this.inviteOverlay(),
    });
  });

  /** This browser's own cursor, which carries the reader's name, icon, role and timeout. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
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
   * The role is written down in this browser along with the room, so reconnecting keeps it. Does
   * nothing for a role the reader may not take.
   */
  setMyRole(role: PeerRole) {
    if (!this.isRoleSelfAssignable(role)) return;
    this.myPeer.role = role;
    this.myPeer.update();
    const peer = Network.peerContext;
    saveIdentity({
      userId: peer.userId,
      roomId: peer.roomId,
      roomName: peer.roomName,
      role,
      reConnectPass: this.myPeer.reConnectPass,
    });
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
   * Gives another peer a role, as the game master. Does nothing for anybody else, for the reader's
   * own cursor, or for a peer that has gone.
   */
  reassignRole(peerId: string, role: PeerRole) {
    if (!this.isMyselfGameMaster) return;
    const cursor = PeerCursor.findByPeerId(peerId);
    if (!cursor || cursor.isMine) return;
    cursor.role = role;
    cursor.update();
  }

  constructor() {
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

  /** Opens the lobby, to find a room to join. */
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

  /** Whether anybody else is connected, which is when there is a room to connect to again. */
  get shouldShowReconnectButton(): boolean {
    return this.networkService.peerIds.length > 1;
  }

  /** Whether there is a connection to ask for the whole room over. */
  get canRequestFullSync(): boolean {
    return 0 < this.networkService.peerIds.length;
  }

  /**
   * Asks the connected peers to send the whole room again, and says in the chat how many were
   * asked.
   */
  requestFullSync() {
    const peerCount = ObjectSynchronizer.instance.requestFullSync();
    this.chatMessageService.sendSystemMessage(
      encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequested', { count: peerCount })
    );
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
