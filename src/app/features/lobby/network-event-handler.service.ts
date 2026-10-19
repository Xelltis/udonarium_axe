import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { PeerReconnectState } from '@axe/core/network/connection';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { NO_BACKEND, SERVER_UNREACHABLE } from '@axe/core/network/server/server-errors';
import { AuthorityEvent, MAX_MEMBERS } from '@axe/core/network/server/server-protocol';
import { ACCOUNT_USER_ID_PREFIX } from '@axe/core/network/server/server-protocol';
import { SAME_NAME_MEMBER_ERROR } from '@axe/core/network/skyway/same-name-member';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { guestUserIdAfter, guestUserIdOf, loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { handOverOwnership } from '@axe/domain/peer/ownership';
import { DEFAULT_CURSOR_IMAGE_IDENTIFIER, DEFAULT_CURSOR_NAME, PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit, DEFAULT_PEER_ROLE } from '@axe/domain/peer/peer-role';
import { markSeatWithheld } from '@axe/domain/peer/withheld-table';
import { IdleSeatService } from '@axe/features/lobby/idle-seat.service';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';

/** What to say for each reason the room server gives for keeping a role as it was. */
const ROLE_REJECTED_KEYS: Readonly<Record<string, string>> = {
  'not-game-master': 'feature.lobby.roleRejected.notGameMaster',
  'unknown-peer': 'feature.lobby.roleRejected.unknownPeer',
  'not-logged-in': 'feature.lobby.roleRejected.notLoggedIn',
  'last-game-master': 'feature.lobby.roleRejected.lastGameMaster',
};

/** How long after somebody leaves the room's list of pictures and sounds is read again. */
const ROOM_ASSET_RELIST_MS = 30_000;
/** How long the word that the seat is about to be let out stays: until it would be. */
const IDLE_NOTICE_MS = 5 * 60_000;
/** How long the word that the seat was let out stays, offering to go back in: as good as for good. */
const LEFT_ALONE_NOTICE_MS = 24 * 60 * 60_000;

@Injectable({ providedIn: 'root' })
export class NetworkEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly reach = inject(NetworkReachService);
  private readonly auth = inject(ServerAuthService);
  private readonly snackbar = inject(SnackbarService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly idleSeat = inject(IdleSeatService);

  /**
   * How often and how slowly it reconnects after a server error, meaning the token backend is out of reach.
   * It covers a cold start too long for the retries on the token itself to absorb, while
   * the limit keeps a permanent failure from looping forever and filling the chat.
   */
  private static readonly MAX_SERVER_ERROR_RECONNECTS = 3;
  private static readonly SERVER_ERROR_RECONNECT_BACKOFF_MS = [3000, 8000, 15000];
  private static readonly RECONNECT_MESSAGE_KEYS: Record<PeerReconnectState, string> = {
    retrying: 'feature.lobby.peerReconnect.retrying',
    recovered: 'feature.lobby.peerReconnect.recovered',
    failed: 'feature.lobby.peerReconnect.failed',
    resumed: '',
  };
  /** The same for the link to a room server, which reports it under this seat's own peer id. */
  private static readonly SERVER_RECONNECT_MESSAGE_KEYS: Record<PeerReconnectState, string> = {
    retrying: 'feature.lobby.peerReconnect.serverRetrying',
    recovered: 'feature.lobby.peerReconnect.serverRecovered',
    failed: 'feature.lobby.peerReconnect.serverFailed',
    resumed: '',
  };
  private serverErrorReconnectAttempts = 0;
  private otherErrorReconnectAttempts = 0;
  private serverErrorReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** The room's list of pictures and sounds, when the server could not give it just then. */
  private readonly roomAssetListRetries = new AssetRetries();
  private roomAssetRelistTimer: ReturnType<typeof setTimeout> | null = null;
  private localMode = false;
  /** The notice saying the seat is about to be let out, to take away once the page is used again. */
  private idleNotice: number | null = null;
  /** The account last followed; undefined until the first look, which changes nothing. */
  private followedAccountUserId: string | null | undefined = undefined;
  /** The last account followed, kept after a logout so its user id is never taken for the tab's own. */
  private lastAccountUserId = '';
  /** The account's name and avatar lent to the cursor, empty for what was not lent, to give back on logout. */
  private lentLook = { name: '', imageIdentifier: '' };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.roomAssetListRetries.clear();
      if (this.roomAssetRelistTimer) clearTimeout(this.roomAssetRelistTimer);
      ImageStorage.instance.receivedUploadTurn = () => 0;
      AudioStorage.instance.receivedUploadTurn = () => 0;
    });
    ImageStorage.instance.receivedUploadTurn = () => this.turnToPutUpReceived();
    AudioStorage.instance.receivedUploadTurn = () => this.turnToPutUpReceived();
    networkMessage$.subscribe((message) => {
      if (message.eventName !== AuthorityEvent.ROLE_REJECTED || message.sendFrom !== Network.authorityPeerId) return;
      this.tellRoleRejected(message.data as { peerId?: unknown; reason?: unknown } | null);
    }, this.destroyRef);
    networkMessage$.subscribe((message) => {
      if (message.eventName !== 'SEAT_IDLE' || !message.isSendFromSelf) return;
      this.tellIdle((message.data as { state?: unknown } | null)?.state);
    }, this.destroyRef);
    // The room server gave this seat another role: a guest made a player brings its pictures up.
    networkMessage$.subscribe((message) => {
      if (message.eventName !== 'SERVER_ROLE_CHANGED' || !message.isSendFromSelf) return;
      this.takeServerRole();
      this.bringAssetsIntoRoom();
    }, this.destroyRef);
    effect(() => {
      const account = this.auth.account();
      untracked(() => this.followAccount(account?.userId ?? null));
    });
    this.objectChange.loadConfig$.subscribe((event) => {
      const config = event.config as Record<string, unknown>;
      this.localMode = config.localMode === true;
      Network.configure(config);
      if (this.localMode) {
        this.playAlone();
        return;
      }
      Network.openStandby(this.standbyUserId());
    }, this.destroyRef);
    this.objectChange.networkOpen$.subscribe(() => {
      this.resetServerErrorReconnect();
      const peer = Network.peerContext;
      if (this.seatMissesLogin(peer)) {
        const next = this.standbyUserId() ?? PeerContext.generateUserId();
        Network.open(next, peer.roomId, peer.roomName, peer.password, Network.roomKey ?? undefined);
        return;
      }
      PeerCursor.myCursor.peerId = peer.peerId;
      PeerCursor.myCursor.userId = peer.userId;
      this.takeServerRole();
      this.bringAssetsIntoRoom();
      this.fetchRoomAssets();
      // Outside a room nobody hands out roles, and a role a room gave must not keep the solo table
      // read-only; on a room server, waiting outside a room is playing as a player.
      if (Network.transport === 'server' && !peer.isRoom) PeerCursor.myCursor.role = DEFAULT_PEER_ROLE;
      this.rememberIdentity(peer);
      // A room server's clock sets the chat's as the seat comes in, though nobody else may be there.
      if (peer.isRoom && Network.serverClockOffset !== null) this.chatMessageService.calibrateTimeOffset();
      const account = Network.transport === 'server' ? this.auth.account() : null;
      if (account) this.lendAccountLook(account.name, account.avatarUrl);
    }, this.destroyRef);
    this.objectChange.networkError$.subscribe((event) => {
      if (this.localMode) return;
      const { errorType, errorMessage } = event;
      const quietErrorTypes = ['peer-unavailable'];
      if (quietErrorTypes.includes(errorType)) return;

      // A room server says why it closed. The seat goes back to waiting outside the room with the
      // reason in the chat, which no retry would change.
      const roomServerMessage = Network.transport === 'server' ? this.roomServerErrorMessage(errorType) : null;
      if (roomServerMessage) {
        this.chatMessageService.sendSystemMessage(roomServerMessage);
        Network.openStandby(this.standbyUserId());
        return;
      }

      // A server error may be a slow cold start, so it backs off and tries again a few times.
      // Past the limit it treats the failure as permanent, says so and stops rather than looping.
      if (errorType === 'server-error') {
        this.handleServerErrorReconnect();
        return;
      }

      // This seat is still in the room under its own name, from another tab or from before a
      // reload that has not dropped yet. Trying again at once would meet it again, so it goes back
      // to waiting and says why, without spending one of the tries the other errors are allowed.
      if (errorType === SAME_NAME_MEMBER_ERROR) {
        this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.sameNameMember'));
        Network.openStandby(this.standbyUserId());
        return;
      }

      // Any error can repeat without end - a token the cloud will not accept fails again the
      // moment it is retried - so a limit of the same size bounds these too. Counted apart from
      // the server's: sharing the one count would make a server error take its wait from wherever
      // the other errors left off, turning three tries of three, eight and fifteen seconds into a
      // single wait of fifteen.
      if (this.otherErrorReconnectAttempts >= NetworkEventHandlerService.MAX_SERVER_ERROR_RECONNECTS) {
        this.reach.giveUp();
        return;
      }
      this.otherErrorReconnectAttempts++;

      this.chatMessageService.sendSystemMessage(this.resolveNetworkErrorMessage(errorType, errorMessage));
      if (this.otherErrorReconnectAttempts >= NetworkEventHandlerService.MAX_SERVER_ERROR_RECONNECTS) {
        // The last try. Said now rather than on the next error, which may never come.
        this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.lastReconnect'));
      } else {
        this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.reconnecting'));
      }
      Network.openStandby(this.standbyUserId());
    }, this.destroyRef);
    this.objectChange.peerConnect$.subscribe(() => {
      this.chatMessageService.calibrateTimeOffset();
    }, this.destroyRef);
    // Somebody who left may still be putting up what it added, and can name it to nobody once it is
    // there; the room's list is read again a little later for it.
    this.objectChange.peerDisconnect$.subscribe(() => {
      if (Network.transport !== 'server' || !Network.peerContext.isRoom || this.roomAssetRelistTimer) return;
      const peerId = Network.peerId;
      this.roomAssetRelistTimer = setTimeout(() => {
        this.roomAssetRelistTimer = null;
        if (Network.peerId === peerId && Network.peerContext.isRoom) this.fetchRoomAssetList(peerId);
      }, ROOM_ASSET_RELIST_MS);
    }, this.destroyRef);
    this.objectChange.peerReconnect$.subscribe((event) => {
      if (this.localMode) return;
      if (event.state === 'recovered' && event.peerId === Network.peerId) {
        this.takeServerRole();
        this.bringAssetsIntoRoom();
        this.fetchRoomAssets();
      }
      if (event.state === 'resumed' && event.peerId === Network.peerId) this.catchUpAfterResume();
      // The link to a room server is this reader's own, so the word of it is shown here alone,
      // rather than written for the whole room, which a guest may not write to anyway. A screen
      // made for streaming shows none of it.
      if (event.peerId === Network.peerId && Network.authorityPeerId !== null) {
        const serverKey = NetworkEventHandlerService.SERVER_RECONNECT_MESSAGE_KEYS[event.state];
        if (serverKey && !this.overlayMode.active()) this.snackbar.show(this.t(serverKey));
        return;
      }
      const key = NetworkEventHandlerService.RECONNECT_MESSAGE_KEYS[event.state];
      if (!key) return;
      this.chatMessageService.sendSystemMessage(encodeI18nMessage(key, { name: this.resolvePeerName(event.peerId) }));
    }, this.destroyRef);
    this.objectChange.onObjectChangedForAlias(
      ['PeerCursor'],
      (event) => {
        const myCursor = PeerCursor.myCursor;
        if (myCursor && event.identifier === myCursor.identifier) this.rememberSeat(myCursor);
      },
      this.destroyRef
    );
  }

  /**
   * Writes down this seat as it stands in the room, its role with it, so a reload comes back as it.
   * Nothing is written outside a room, nor while a replay's board is on the table, cut off from the
   * room, where the seat's cursor wears what it had in the recording.
   */
  private rememberSeat(myCursor: PeerCursor): void {
    const peer = Network.peerContext;
    if (!peer?.isRoom || isNetworkIsolated()) return;
    saveIdentity({
      userId: peer.userId,
      roomId: peer.roomId,
      roomName: peer.roomName,
      role: myCursor.role,
      reConnectPass: myCursor.reConnectPass,
      roomKey: Network.roomKey ?? '',
      guestUserId: guestUserIdAfter(peer.userId, loadIdentity(), this.accountUserId()),
      accountUserId: this.accountUserId(),
    });
  }

  /**
   * Writes down who this tab is, so a reload can pick up where it left off.
   *
   * A reload opens the waiting connection before any room, and that connection belongs to no
   * room. Written down as it stands, it would wipe out the room the tab had just been in, and a
   * game master coming back to their own table could no longer be told from one walking into
   * somebody else's. Outside a room, the room last written down is kept, with the role held in it.
   * While a replay's board is on the table, cut off from the room, the roles written down are kept,
   * as the seat's cursor there wears what it had in the recording.
   */
  private rememberIdentity(peer: { userId: string; roomId: string; roomName: string; isRoom: boolean }): void {
    const saved = loadIdentity();
    const last = peer.isRoom ? null : saved;
    const kept = isNetworkIsolated() ? saved : null;
    saveIdentity({
      userId: peer.userId,
      roomId: last?.roomId ?? peer.roomId,
      roomName: last?.roomName ?? peer.roomName,
      role: kept ? kept.role : PeerCursor.myCursor.role,
      roomRole: kept ? kept.roomRole : last ? last.roomRole : PeerCursor.myCursor.role,
      reConnectPass: PeerCursor.myCursor.reConnectPass,
      roomKey: last ? (last.roomKey ?? '') : (Network.roomKey ?? ''),
      guestUserId: guestUserIdAfter(peer.userId, saved, this.accountUserId()),
      accountUserId: this.accountUserId(),
    });
  }

  /**
   * The user id of the account logged in to the room server, or of the last one this page saw after
   * a logout; empty with SkyWay, or before any login.
   */
  private accountUserId(): string {
    if (Network.transport !== 'server') return '';
    return this.auth.account()?.userId ?? this.lastAccountUserId;
  }

  /**
   * Takes on the role the room server gave this seat on letting it in; SkyWay gives none. Anyone but
   * the GM is handed part of the table only in the shape the server withholds, which a save of it
   * is then marked as holding; the GM is handed all of that room.
   */
  private takeServerRole(): void {
    const role = Network.serverRole;
    const cursor = PeerCursor.myCursor;
    if (role && cursor && cursor.role !== role) cursor.role = role;
    if (role) markSeatWithheld(role !== 'gm', Network.roomKey ?? '');
  }

  /**
   * Plays alone in this browser, where nobody is kept from the table: a seat a room made a guest
   * before going offline plays as a player, rather than find its own table read-only.
   */
  private playAlone(): void {
    const cursor = PeerCursor.myCursor;
    if (cursor && !canRoleEdit(cursor.role)) cursor.role = DEFAULT_PEER_ROLE;
  }

  /**
   * How many turns this seat waits to put up a picture or sound a guest named, which every GM and PL
   * in the room received at once: one for each linked GM or PL whose peer id comes before this
   * seat's, so that the first has put it up before the next finds the store lacking it.
   */
  private turnToPutUpReceived(): number {
    const mine = Network.peerId;
    const ahead = PeerCursor.linkedCursors().filter(
      (cursor) => cursor !== PeerCursor.myCursor && canRoleEdit(cursor.role) && cursor.peerId < mine
    );
    return ahead.length;
  }

  /**
   * Puts the pictures and sounds this seat holds up to the room server's room it is in, as a GM or a
   * PL may: those added outside the room, brought from another, or added while the line was down. A
   * guest, who may put nothing up, names them to the others instead, for them to take from it.
   */
  private bringAssetsIntoRoom(): void {
    const role = Network.serverRole;
    if (!Network.peerContext.isRoom) return;
    if (role !== 'gm' && role !== 'pl') {
      if (role === 'guest') {
        ImageStorage.instance.synchronize();
        AudioStorage.instance.synchronize();
      }
      return;
    }
    ImageStorage.instance.uploadAllToAssetStore();
    AudioStorage.instance.uploadAllToAssetStore();
    // What the room is playing goes up ahead of the rest, for everyone to hear it soonest.
    AudioSharingSystem.instance.preferWaiting();
  }

  /**
   * Catches up after coming back on a new link the room server asked for, which some servers do
   * every few minutes: what was added here while the link was down goes up, and the room's list is
   * read again for what it gained meanwhile. The rest is the same room as before, so neither every
   * picture and sound held nor what the store was found to lack is asked about again.
   */
  private catchUpAfterResume(): void {
    this.takeServerRole();
    if (Network.transport !== 'server' || !Network.peerContext.isRoom) return;
    const role = Network.serverRole;
    if (role === 'gm' || role === 'pl') {
      ImageStorage.instance.uploadMissedToAssetStore();
      AudioStorage.instance.uploadMissedToAssetStore();
    }
    this.fetchRoomAssetList(Network.peerId);
  }

  /**
   * Fetches what the room server's room holds that this seat lacks: the pictures and sounds left in
   * a room everybody had gone from, which no member's catalog names any more. Each room starts with
   * a clean slate of what the store was found to lack. A list the server could not give just then is
   * asked for again a few times, while the seat is still in the room.
   */
  private fetchRoomAssets(): void {
    this.roomAssetListRetries.clear();
    if (Network.transport !== 'server' || !Network.peerContext.isRoom) return;
    ImageSharingSystem.instance.forgetMisses();
    AudioSharingSystem.instance.forgetMisses();
    this.fetchRoomAssetList(Network.peerId);
  }

  private fetchRoomAssetList(peerId: string): void {
    void AssetHttpStore.instance.listRoomAssets().then((assets) => {
      if (Network.peerId !== peerId || !Network.peerContext.isRoom) return;
      if (!assets) {
        this.roomAssetListRetries.schedule('list', () => this.fetchRoomAssetList(peerId));
        return;
      }
      this.roomAssetListRetries.forget('list');
      const pictures = assets.filter((asset) => asset.type.startsWith('image/'));
      const sounds = assets.filter((asset) => asset.type.startsWith('audio/'));
      ImageStorage.instance.forgetUploaded(pictures.map((asset) => asset.id));
      AudioStorage.instance.forgetUploaded(sounds.map((asset) => asset.id));
      ImageSharingSystem.instance.fetchListed(pictures);
      AudioSharingSystem.instance.fetchListed(sounds);
    });
  }

  /** Says why the room server would not change somebody's role. */
  private tellRoleRejected(data: { peerId?: unknown; reason?: unknown } | null): void {
    const reason = typeof data?.reason === 'string' ? data.reason : '';
    const key = ROLE_REJECTED_KEYS[reason] ?? 'feature.lobby.roleRejected.other';
    const name = typeof data?.peerId === 'string' ? this.resolvePeerName(data.peerId) : '';
    this.chatMessageService.sendSystemMessage(encodeI18nMessage(key, { name, reason }));
  }

  /**
   * Tells the reader the seat is about to be let out for the page left alone, takes that back once
   * the page is used again, or says it was let out, offering to go back in. The offer stays until
   * taken, here and in the peer menu, as nothing takes the seat back in by itself.
   */
  private tellIdle(state: unknown): void {
    if (state === 'soon') {
      if (!this.overlayMode.active()) this.snackbar.show(this.t('feature.lobby.idle.soon'), { ms: IDLE_NOTICE_MS });
      this.idleNotice = this.snackbar.current()?.id ?? null;
      return;
    }
    if (state === 'back') {
      if (this.idleNotice !== null && this.snackbar.current()?.id === this.idleNotice) this.snackbar.dismiss();
      this.idleNotice = null;
      return;
    }
    if (state !== 'left') return;
    this.idleSeat.markLeft();
    this.idleNotice = null;
    if (this.overlayMode.active()) return;
    this.snackbar.show(this.t('feature.lobby.idle.left'), {
      action: { label: this.t('feature.lobby.idle.comeBack'), run: () => this.idleSeat.comeBack() },
      ms: LEFT_ALONE_NOTICE_MS,
    });
  }

  /**
   * The user id to wait outside a room as: on a room server, the account's while somebody is logged
   * in, and the tab's own otherwise, never an account's; with SkyWay, the one saved before a reload.
   */
  private standbyUserId(): string | undefined {
    const account = Network.transport === 'server' ? this.auth.account() : null;
    if (account) return account.userId;
    return guestUserIdOf(loadIdentity(), this.accountUserId()) || undefined;
  }

  /**
   * Follows a login or logout, in this tab or another, on a room server. In a room, the seat goes in
   * again as whoever is logged in now; outside one, it waits as them, taking what the old id held
   * along. A login also lends the cursor the account's name and avatar while it has the defaults,
   * and a logout takes back what is still as lent, so the guest seat does not go on as the account.
   * A login gone in a room, as when the server no longer takes it, says the seat is a guest now.
   */
  private followAccount(userId: string | null): void {
    const previous = this.followedAccountUserId;
    this.followedAccountUserId = userId;
    if (userId) this.lastAccountUserId = userId;
    if (this.localMode || Network.transport !== 'server') return;
    const account = this.auth.account();
    if (account) this.lendAccountLook(account.name, account.avatarUrl);
    else this.takeBackAccountLook();
    if (previous === undefined || previous === userId || !Network.isOpen) return;

    const peer = Network.peerContext;
    const next = this.standbyUserId() ?? PeerContext.generateUserId();
    if (peer.isRoom) {
      Network.open(next, peer.roomId, peer.roomName, peer.password, Network.roomKey ?? undefined);
      if (previous && !userId && !this.overlayMode.active())
        this.snackbar.show(this.t('feature.lobby.signedOutInRoom'));
      return;
    }
    handOverOwnership(peer.userId, next);
    Network.openStandby(next);
  }

  /**
   * Whether the seat a room server just let in is not the one the login asks for now: a login or a
   * logout came while the join was under way, before there was a room to go into again.
   */
  private seatMissesLogin(peer: IPeerContext): boolean {
    if (this.localMode || Network.transport !== 'server' || !peer.isRoom) return false;
    const account = this.auth.account();
    if (account) return peer.userId !== account.userId;
    return peer.userId.startsWith(ACCOUNT_USER_ID_PREFIX) || peer.userId === this.lastAccountUserId;
  }

  /** Puts the account's name and avatar on the cursor where it still has the defaults. */
  private lendAccountLook(name: string, avatarUrl: string | null): void {
    const cursor = PeerCursor.myCursor;
    if (!cursor) return;
    if (cursor.name === DEFAULT_CURSOR_NAME && name) {
      cursor.name = name;
      this.lentLook.name = name;
    }
    if (cursor.imageIdentifier === DEFAULT_CURSOR_IMAGE_IDENTIFIER && avatarUrl) {
      cursor.imageIdentifier = ImageStorage.instance.add(avatarUrl).identifier;
      this.lentLook.imageIdentifier = cursor.imageIdentifier;
    }
  }

  /** Puts the defaults back on the cursor where it still has the account's name or avatar as lent. */
  private takeBackAccountLook(): void {
    const cursor = PeerCursor.myCursor;
    const lent = this.lentLook;
    this.lentLook = { name: '', imageIdentifier: '' };
    if (!cursor) return;
    if (lent.name && cursor.name === lent.name) cursor.name = DEFAULT_CURSOR_NAME;
    if (lent.imageIdentifier && cursor.imageIdentifier === lent.imageIdentifier) {
      cursor.imageIdentifier = DEFAULT_CURSOR_IMAGE_IDENTIFIER;
    }
  }

  /**
   * Goes back to waiting after a server error once its backoff is up, unless the seat was sent
   * somewhere meanwhile, as a join or a room made then, which waiting would cut off.
   */
  private handleServerErrorReconnect(): void {
    if (this.serverErrorReconnectAttempts >= NetworkEventHandlerService.MAX_SERVER_ERROR_RECONNECTS) {
      this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.skywayServer'));
      this.reach.giveUp();
      return;
    }

    const backoff = NetworkEventHandlerService.SERVER_ERROR_RECONNECT_BACKOFF_MS;
    const delayMs = backoff[this.serverErrorReconnectAttempts] ?? backoff[backoff.length - 1];
    this.serverErrorReconnectAttempts++;

    this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.reconnecting'));

    if (this.serverErrorReconnectTimer != null) clearTimeout(this.serverErrorReconnectTimer);
    const asked = Network.openRequests;
    this.serverErrorReconnectTimer = setTimeout(() => {
      this.serverErrorReconnectTimer = null;
      if (Network.openRequests !== asked) return;
      Network.openStandby(this.standbyUserId());
    }, delayMs);
  }

  private resetServerErrorReconnect(): void {
    this.reach.reached();
    this.serverErrorReconnectAttempts = 0;
    this.otherErrorReconnectAttempts = 0;
    if (this.serverErrorReconnectTimer != null) {
      clearTimeout(this.serverErrorReconnectTimer);
      this.serverErrorReconnectTimer = null;
    }
  }

  private resolvePeerName(peerId: string): string {
    const cursor = PeerCursor.findByPeerId(peerId);
    if (cursor?.name) return cursor.name;
    if (cursor?.userId) return cursor.userId.slice(0, 6);
    return peerId.slice(0, 6);
  }

  /** What to tell the reader about a code a room server closed with, or null for any other error. */
  private roomServerErrorMessage(code: string): string | null {
    switch (code) {
      case 'protocol-mismatch':
        return encodeI18nMessage('feature.lobby.errors.roomServerProtocolMismatch');
      case 'wrong-password':
        return encodeI18nMessage('feature.lobby.errors.roomServerWrongPassword');
      case 'room-not-found':
        return encodeI18nMessage('feature.lobby.errors.roomServerNotFound');
      case 'room-full':
        return encodeI18nMessage('feature.lobby.errors.roomServerFull', { max: MAX_MEMBERS });
      case 'replaced':
        return encodeI18nMessage('feature.lobby.errors.roomServerReplaced');
      case SERVER_UNREACHABLE:
        return encodeI18nMessage('feature.lobby.errors.roomServerUnreachable');
      case NO_BACKEND:
        return encodeI18nMessage('feature.lobby.errors.roomServerNoBackend');
      case 'unauthorized':
        return encodeI18nMessage('feature.lobby.errors.roomServerUnauthorized');
      case 'room-deleted':
        return encodeI18nMessage('feature.lobby.errors.roomServerDeleted');
      case 'hello-required':
      case 'bad-message':
      case 'too-many-messages':
        return encodeI18nMessage('feature.lobby.errors.roomServerRefused', { code });
      default:
        return null;
    }
  }

  private resolveNetworkErrorMessage(errorType: string, _errorMessage: string): string {
    switch (errorType) {
      case 'server-error':
        return encodeI18nMessage('feature.lobby.errors.skywayServer');
      case 'token-expired':
        return encodeI18nMessage('feature.lobby.errors.tokenExpired');
      default:
        return encodeI18nMessage('feature.lobby.errors.generic', { errorType });
    }
  }
}
