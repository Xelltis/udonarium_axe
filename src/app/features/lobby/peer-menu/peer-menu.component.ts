import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { dropInvitationFromAddress } from '@axe/application/lobby/invitation-address';
import { leavingLoss, leavingLossText } from '@axe/application/lobby/leaving-loss';
import { LinkWatchService } from '@axe/application/lobby/link-watch.service';
import { PeerLinkService, PeerLinkView, SyncProgressState } from '@axe/application/lobby/peer-link.service';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ReportService } from '@axe/application/moderation/report.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { AuthorityEvent } from '@axe/core/network/server/server-protocol';
import { transportOf } from '@axe/core/network/transport';
import { forgetIconChosenByHand, noteIconChosenByHand } from '@axe/core/storage/icon-chosen-by-hand';
import { loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { observeSize } from '@axe/core/util/observe-size';
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
import { LobbyComponent } from '@axe/features/lobby/lobby/lobby.component';
import { InviteLinkService } from '@axe/features/lobby/peer-menu/invite-link.service';
import { ReConnectComponent } from '@axe/features/lobby/re-connect/re-connect.component';
import { roomDeletionMessageKey, RoomDeletionService } from '@axe/features/lobby/room-deletion.service';
import { ServerAccountComponent } from '@axe/features/lobby/server-account/server-account.component';
import { ServerWatchService } from '@axe/features/lobby/server-watch.service';
import { ReportDialogComponent } from '@axe/features/moderation/report-dialog/report-dialog.component';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** The width of the list of the others under which a row is laid out on two lines. */
export const NARROW_PEER_LIST_PX = 320;

/** How the link to one of the others is drawn on its row: its icon, its words and their colour. */
interface PeerLinkLook {
  readonly state: PeerLinkView;
  readonly icon: string;
  readonly labelKey: string;
  /** The colour of the icon and the word, from the theme; empty for the row's own. */
  readonly colorClass: string;
  /** Whether the word is shown beside the icon, as for every state but a plain direct link. */
  readonly showsWord: boolean;
  /** Whether the row explains under it that the room's data comes from the others. */
  readonly showsHint: boolean;
}

const PEER_LINK_LOOKS: Record<PeerLinkView, PeerLinkLook> = {
  direct: {
    state: 'direct',
    icon: 'link',
    labelKey: 'feature.lobby.peerMenu.linkDirect',
    colorClass: '',
    showsWord: false,
    showsHint: false,
  },
  turn: {
    state: 'turn',
    icon: 'alt_route',
    labelKey: 'feature.lobby.peerMenu.linkTurn',
    colorClass: '',
    showsWord: true,
    showsHint: false,
  },
  relayed: {
    state: 'relayed',
    icon: 'people',
    labelKey: 'feature.lobby.peerMenu.linkRelayedOnly',
    colorClass: 'text-ui-warning',
    showsWord: true,
    showsHint: true,
  },
  reconnecting: {
    state: 'reconnecting',
    icon: 'sync',
    labelKey: 'feature.lobby.peerMenu.linkReconnecting',
    colorClass: 'text-ui-accent',
    showsWord: true,
    showsHint: false,
  },
  failed: {
    state: 'failed',
    icon: 'link_off',
    labelKey: 'feature.lobby.peerMenu.linkFailed',
    colorClass: 'text-ui-danger',
    showsWord: true,
    showsHint: true,
  },
};

/**
 * One row of the list of the others: the peer, how its link is drawn where links are told of, and
 * what its cursor says of who it is, empty or the default role while the cursor has not arrived.
 */
interface PeerRow {
  readonly peerId: string;
  readonly link: PeerLinkLook | null;
  readonly userId: string;
  readonly name: string;
  readonly role: PeerRole;
}

/** This seat's connection as the menu shows it, as last read. */
interface ConnectionView {
  readonly isOpen: boolean;
  readonly userId: string;
  readonly peerId: string;
  readonly isRoom: boolean;
  readonly roomName: string;
  readonly roomId: string;
  readonly hasPassword: boolean;
  readonly password: string;
}

/** What the heartbeats say of one of the others, as last read on the menu's clock. */
interface PeerHeard {
  /** When the peer last answered; zero or less while that is not known. */
  readonly receivedAt: number;
  /** The round trip in seconds, or `--` while the peer's cursor has not arrived. */
  readonly latency: number | string;
}

const NOT_HEARD: PeerHeard = { receivedAt: 0, latency: '--' };

/** How the standing of this seat's sync is said above the button that asks for a fresh one. */
interface SyncLook {
  readonly state: SyncProgressState;
  readonly icon: string;
  readonly messageKey: string;
  readonly colorClass: string;
  readonly showsBar: boolean;
}

const SYNC_LOOKS: Record<Exclude<SyncProgressState, 'idle'>, SyncLook> = {
  receiving: {
    state: 'receiving',
    icon: 'sync',
    messageKey: 'feature.lobby.peerMenu.syncReceiving',
    colorClass: 'text-ui-muted',
    showsBar: true,
  },
  settled: {
    state: 'settled',
    icon: 'check_circle',
    messageKey: 'feature.lobby.peerMenu.syncSettled',
    colorClass: 'text-ui-muted',
    showsBar: false,
  },
  nobody: {
    state: 'nobody',
    icon: 'link_off',
    messageKey: 'feature.lobby.peerMenu.syncNobodyToAsk',
    colorClass: 'text-ui-danger',
    showsBar: false,
  },
  stalled: {
    state: 'stalled',
    icon: 'warning',
    messageKey: 'feature.lobby.peerMenu.syncStalled',
    colorClass: 'text-ui-warning',
    showsBar: false,
  },
};

/** How this browser takes part: with the others over the network, or alone. */
export const CONNECTION_MODES = ['online', 'offline'] as const;
export type ConnectionMode = (typeof CONNECTION_MODES)[number];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'peer-menu',
  templateUrl: './peer-menu.component.html',
  imports: [FormsModule, DatePipe, SafePipe, ServerAccountComponent, TranslocoModule],
  providers: [InviteLinkService],
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
  private readonly linkWatch = inject(LinkWatchService);
  private readonly peerLink = inject(PeerLinkService);
  private readonly peerList = viewChild<ElementRef<HTMLElement>>('peerList');
  /** Whether the list of the others is under NARROW_PEER_LIST_PX wide, where a row takes two lines. */
  protected readonly isNarrow = signal(false);
  /** How far this seat's sync of the room has come, as it is counted in the words that say so. */
  protected readonly syncProgress = this.peerLink.syncProgress;
  /**
   * How the standing of this seat's sync is said, among peers; null on a room server, which keeps the
   * room itself, and before there is anything to say.
   */
  protected readonly syncLook = computed<SyncLook | null>(() => {
    if (this.isServerTransport()) return null;
    const state = this.syncProgress().state;
    return state === 'idle' ? null : SYNC_LOOKS[state];
  });

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
    Network.instance.letPageGo();
    this.reload();
  }

  protected reload(): void {
    location.reload();
  }
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private get tableSelecter(): TableSelecter {
    return TableSelecter.instance;
  }
  private readonly objectChange = inject(ObjectChangeService);
  private readonly watching = inject(ServerWatchService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly destroyRef = inject(DestroyRef);
  readonly help = signal('');
  readonly isPasswordVisible = signal(false);
  readonly dispDetailFlag = signal(false);

  readonly assignableRoles = ASSIGNABLE_PEER_ROLES;
  /**
   * Whether a room server decides the roles, which nobody then takes for themselves. Followed from
   * the config, which may load after the panel opens at startup.
   */
  protected readonly isServerTransport = signal(Network.instance.transport === 'server');
  private readonly auth = inject(ServerAuthService);
  private readonly imageStorage = inject(ImageStorage);
  /**
   * Whether the login is offered here, to a guest on a room server: one who came in by a link never
   * sees the lobby, where it otherwise is.
   */
  protected readonly offersLogin = computed(
    () =>
      this.isServerTransport() && this.auth.isConfigured && !this.auth.account() && this.auth.offersLogin() !== false
  );
  /** Whether this seat may report the room to the room server's operator, as anyone in it may. */
  protected readonly canReport = inject(ReportService).canReport;
  private readonly objectSynchronizer = inject(ObjectSynchronizer);
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
  /** The link that invites into the room, and the invitations the room server has signed for it. */
  private readonly invites = inject(InviteLinkService);
  /**
   * Bumped when the room server keeps a role as it was, so that the role pickers are drawn again
   * from the roles as they stand rather than as last picked.
   */
  protected readonly roleSelectsDrawn = signal(0);
  /** Whether the room server turned down or did not answer the last request for an invitation. */
  protected readonly serverInviteFailed = this.invites.failed;
  /**
   * Whether the reader is the game master, followed as their cursor changes: the room server may
   * make them one, or no longer one, at any time.
   */
  protected readonly amGameMaster = computed(() => {
    this.objectChange.networkVersion();
    this.objectChange.versionOf(PeerCursor.myCursor?.identifier ?? '')();
    return PeerCursor.isMyselfGameMaster;
  });
  /**
   * On a room server, the roles the reader may switch between: the one the room keeps for them,
   * which they come back to, and watching. Empty where they have no choice of their own.
   */
  protected readonly ownRoleChoices = computed(() => {
    this.objectChange.networkVersion();
    this.objectChange.versionOf(PeerCursor.myCursor?.identifier ?? '')();
    const kept = this.watching.roleToChoose();
    if (!kept) return [];
    return [
      { role: kept, hintKey: 'feature.lobby.peerMenu.comeBackHint', testId: 'peer-menu-kept-role' },
      { role: PeerRole.Guest, hintKey: 'feature.lobby.peerMenu.watchHint', testId: 'peer-menu-watch' },
    ];
  });
  /** The invitation in the link, on a room server, while the reader is the game master. */
  private readonly serverInvite = computed(() => {
    this.objectChange.networkVersion();
    if (!this.isServerTransport() || !this.amGameMaster()) return null;
    return this.invites.held(this.inviteRole());
  });
  /** When the invitation in the link runs out, on a room server; null without one. */
  protected readonly serverInviteExpiresAt = computed(() => this.serverInvite()?.expiresAt ?? null);
  protected readonly includePasswordInInvite = signal(true);
  protected readonly inviteOverlay = signal(false);
  protected readonly isInviteCopied = transientSignal(false, 2000);

  protected readonly inviteLink = computed(() => {
    this.objectChange.networkVersion();
    return this.invites.link({
      includePassword: this.includePasswordInInvite(),
      role: this.isServerTransport() ? null : this.inviteRole(),
      overlay: this.inviteOverlay(),
      invite: this.serverInvite()?.invite ?? '',
    });
  });

  /**
   * This seat's connection as the menu shows it: whether it is open, and the ids, the room and the
   * password it holds. Nothing tells of a connection closing, so it is read again on every tick of
   * the menu's clock as well as when the network says it changed.
   */
  protected readonly connection = computed<ConnectionView>(() => {
    this.objectChange.networkVersion();
    this.myTime();
    const context = Network.instance.peerContext;
    return {
      isOpen: Network.instance.isOpen,
      userId: context.userId,
      peerId: context.peerId,
      isRoom: context.isRoom,
      roomName: context.roomName,
      roomId: context.roomId,
      hasPassword: context.hasPassword,
      password: context.password,
    };
  });

  /** This browser's own cursor, which carries the reader's name, icon, role and timeout. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  /** Takes the seat let out for the page left alone back into its room. */
  protected comeBackFromIdle(): void {
    this.idleSeat.comeBack();
  }

  /** Asks the reader why they report this room to the room server's operator, and sends it. */
  protected reportRoom(): void {
    if (!this.canReport()) return;
    void this.modalService.open(ReportDialogComponent, { target: 'room', name: Network.instance.peerContext.roomName });
  }

  /**
   * Deletes the room on the room server, once the reader has confirmed. The server then closes it
   * for everybody, which takes the reader back to waiting; only a refusal or a failure is said here.
   */
  async deleteRoom(): Promise<void> {
    const roomKey = Network.instance.roomKey;
    if (!roomKey || this.isDeletingRoom()) return;
    this.isDeletingRoom.set(true);
    this.roomDeletionFailure.set('');
    try {
      const { roomName, roomId } = Network.instance.peerContext;
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
    const peer = Network.instance.peerContext;
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
      roomKey: Network.instance.roomKey ?? '',
    });
  }

  /**
   * Asks the room server for an invitation in a role, for the game master's link, unless one for
   * that role is in hand with a day still to run. Anybody else's link carries none.
   */
  private async requestServerInvite(role: PeerRole): Promise<void> {
    if (!this.isServerTransport() || !Network.instance.peerContext.isRoom || !this.isMyselfGameMaster) return;
    await this.invites.request(role);
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
   * Switches the reader to one of the roles the room server lets them choose: watching, as a guest,
   * or the role it keeps for them, which they come back to.
   */
  protected chooseOwnRole(role: PeerRole): void {
    if (role === PeerRole.Guest) this.watching.watch();
    else this.watching.comeBack();
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
    const authority = Network.instance.authorityPeerId;
    if (authority) {
      networkSend(AuthorityEvent.ROLE_REQUEST, { peerId, role }, authority);
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
        this.invites.forgetFailure();
        if (!gameMaster) {
          this.invites.putAway();
          return;
        }
        void this.requestServerInvite(role);
      });
    });
    queueMicrotask(() => (this.panelService.title = this.t('common.panel.peerMenu')));
    const timer = setInterval(() => this.dispInfo(), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    effect((onCleanup) => {
      if (this.isServerTransport()) onCleanup(this.linkWatch.watch());
      else onCleanup(this.peerLink.watch());
    });
    effect((onCleanup) => {
      const list = this.peerList()?.nativeElement;
      if (!list) return;
      onCleanup(observeSize(list, (size) => this.isNarrow.set(size.width < NARROW_PEER_LIST_PX)));
    });
  }

  /**
   * The rows of the list of the others. Among peers, one for each link the network tells of, those
   * the room only lists among them, with how the link is drawn. On a room server, one for each
   * member the server gives, with nothing said of links, which every seat has to the server alone.
   * It follows the network, the cursors coming and going, and every cursor's own changes, as a
   * cursor is found by a peer id that is itself one of them.
   */
  protected readonly peerRows = computed<PeerRow[]>(() => {
    this.objectChange.networkVersion();
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      this.objectChange.versionOf(cursor.identifier)();
    }
    const rows = this.isServerTransport()
      ? Network.instance.peerContexts.map((context) => ({ peerId: context.peerId, link: null }))
      : this.peerLink.links().map((link) => ({ peerId: link.peerId, link: PEER_LINK_LOOKS[link.state] }));
    return rows.map((row) => {
      const cursor = PeerCursor.findByPeerId(row.peerId);
      return {
        ...row,
        userId: cursor?.userId ?? '',
        name: cursor?.name ?? '',
        role: cursor?.role ?? DEFAULT_PEER_ROLE,
      };
    });
  });

  /**
   * What the heartbeats say of each of the others, by peer id. Nothing tells of a heartbeat
   * arriving, so it is read again on every tick of the menu's clock.
   */
  protected readonly heard = computed<ReadonlyMap<string, PeerHeard>>(() => {
    this.myTime();
    return new Map(
      this.peerRows().map((row) => [
        row.peerId,
        { receivedAt: this.findPeerTimeReceive(row.peerId), latency: this.findPeerTimeLatency(row.peerId) },
      ])
    );
  });

  /** What the heartbeats say of one of the others, or that nothing was heard for a peer not on the list. */
  protected heardFrom(peerId: string): PeerHeard {
    return this.heard().get(peerId) ?? NOT_HEARD;
  }

  /**
   * Opens the image picker and makes the chosen image the reader's icon. Closing it without a
   * choice changes nothing. An icon chosen while logged in to a room server is noted as chosen by
   * hand, so that the account's avatar is no longer put on at login; the account's own avatar, which
   * the picker offers to the reader alone, goes back to being put on.
   */
  changeIcon() {
    const avatarUrl = this.auth.account()?.avatarUrl;
    const ownAvatar = avatarUrl ? this.imageStorage.add(avatarUrl).identifier : null;
    this.modalService.open<string>(FileSelecterComponent, { ownAvatar }).then((value) => {
      if (!this.myPeer || !value) return;
      this.myPeer.imageIdentifier = value;
      const account = this.auth.account();
      if (!account) return;
      if (value === ownAvatar) forgetIconChosenByHand(account.userId);
      else noteIconChosenByHand(account.userId);
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
    return Network.instance.peerIds.length > 0 || Network.instance.authorityPeerId !== null;
  }

  /** Whether there is a connection to ask for the whole room over: a peer, or the room server. */
  get canRequestFullSync(): boolean {
    return 0 < Network.instance.peerIds.length || Network.instance.authorityPeerId !== null;
  }

  /**
   * Asks the connected peers to send the whole room again, and says in the chat how many were
   * asked, and how many the room lists that could not be, having no open connection to this seat;
   * on a room server, which alone holds the room, that it was asked.
   */
  requestFullSync() {
    const peerCount = this.objectSynchronizer.requestFullSync();
    this.chatMessageService.sendSystemNotice('room', this.fullSyncNotice(peerCount));
  }

  private fullSyncNotice(peerCount: number): string {
    if (Network.instance.authorityPeerId !== null) {
      return encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequestedFromServer');
    }
    const unreachable = Network.instance.unreachablePeerIds.length;
    if (unreachable < 1) return encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequested', { count: peerCount });
    return encodeI18nMessage('feature.lobby.peerMenu.fullSyncRequestedPartly', { count: peerCount, unreachable });
  }

  /** Shows the room's password as plain text, or hides it again. */
  togglePasswordVisibility() {
    this.isPasswordVisible.update((v) => !v);
  }

  /**
   * When the peer last answered: its last heartbeat to arrive here, or in a room on a room server,
   * which sends none, when the server last heard from it. Zero or less while neither is known.
   */
  findPeerTimeReceive(peerId: string) {
    if (this.isServerTransport()) return Network.instance.heardAt(peerId) ?? 0;
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timestampReceive : 0;
  }

  /**
   * The round trip to the peer and back in seconds, the two ways added together; `--` while its
   * cursor has not arrived.
   */
  findPeerTimeLatency(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.timeLatency / 1000 : '--';
  }

  /** The time on the clock shown in the menu, which the heartbeat figures of the list are read on. */
  readonly myTime = signal(0);
  /** Moves on the clock shown in the menu, which the menu does every second while it is open. */
  dispInfo() {
    this.myTime.set(Date.now());
  }
}
