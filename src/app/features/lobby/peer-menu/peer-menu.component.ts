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

  connectionMode(): ConnectionMode {
    return this.isOffline() ? 'offline' : 'online';
  }

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

  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  get isMyselfGameMaster(): boolean {
    return PeerCursor.isMyselfGameMaster;
  }

  findPeerRole(peerId: string): PeerRole {
    return PeerCursor.findByPeerId(peerId)?.role ?? DEFAULT_PEER_ROLE;
  }

  shortId(peerId: string): string {
    return peerId.slice(0, 6);
  }

  isRoleSelfAssignable(role: PeerRole): boolean {
    if (role !== PeerRole.GameMaster) return true;
    return this.isMyselfGameMaster || !this.hasConnectedGameMaster();
  }

  private hasConnectedGameMaster(): boolean {
    return this.objectStore.getObjects<PeerCursor>(PeerCursor).some((cursor) => cursor.isGameMaster);
  }

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

  changeIcon() {
    this.modalService.open<string>(FileSelecterComponent).then((value) => {
      if (!this.myPeer || !value) return;
      this.myPeer.imageIdentifier = value;
    });
  }

  showLobby() {
    this.modalService.open(LobbyComponent, {
      title: this.t('feature.lobby.lobby.title'),
      width: 700,
      height: 400,
      left: 0,
      top: 400,
    });
  }

  showReConnect() {
    this.modalService.open(ReConnectComponent, {
      width: 700,
      height: 400,
      left: 0,
      top: 400,
    });
  }

  get shouldShowReconnectButton(): boolean {
    return this.networkService.peerIds.length > 1;
  }

  get canRequestFullSync(): boolean {
    return 0 < this.networkService.peerIds.length;
  }

  requestFullSync() {
    const peerCount = ObjectSynchronizer.instance.requestFullSync();
    this.chatMessageService.sendSystemMessage(
      encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequested', { count: peerCount })
    );
  }

  togglePasswordVisibility() {
    this.isPasswordVisible.update((v) => !v);
  }

  findUserId(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.userId : '';
  }

  findPeerName(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.name : '';
  }

  findPeerTimeSend(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timestampSend : 0;
  }

  findPeerTimeReceive(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timestampReceive : 0;
  }

  findPeerTimeDiffUp(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timeDiffUp : 0;
  }

  findPeerTimeDiffDown(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timeDiffDown : 0;
  }

  findPeerTimeLatency(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    if (!peerCursor) return '--';

    return peerCursor ? peerCursor.timeLatency / 1000 : 99999;
  }

  findPeerDegreeOfSuccess(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    if (!peerCursor) return '0/0';
    if (peerCursor.firstTimeSignNo < 0) return '0/0';
    const degree = peerCursor.totalTimeSignNum + '/' + (peerCursor.lastTimeSignNo - peerCursor.firstTimeSignNo + 1);
    return degree;
  }

  myTime = signal(0);
  dispInfo() {
    this.myTime.set(Date.now());
  }
}
