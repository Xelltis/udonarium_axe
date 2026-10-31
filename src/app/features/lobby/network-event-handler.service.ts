import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ChatClockService } from '@axe/application/chat/chat-clock.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
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
import { operatorContactText } from '@axe/core/network/server/operator-contact';
import { NO_BACKEND, SERVER_UNREACHABLE } from '@axe/core/network/server/server-errors';
import { AuthorityEvent, MAX_MEMBERS } from '@axe/core/network/server/server-protocol';
import { ACCOUNT_USER_ID_PREFIX } from '@axe/core/network/server/server-protocol';
import { SAME_NAME_MEMBER_ERROR } from '@axe/core/network/skyway/same-name-member';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { hasChosenIconByHand, noteIconChosenByHand } from '@axe/core/storage/icon-chosen-by-hand';
import { guestUserIdAfter, guestUserIdOf, loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { handOverOwnership } from '@axe/domain/peer/ownership';
import { DEFAULT_CURSOR_IMAGE_IDENTIFIER, DEFAULT_CURSOR_NAME, PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit, DEFAULT_PEER_ROLE } from '@axe/domain/peer/peer-role';
import { markSeatWithheld } from '@axe/domain/peer/withheld-table';
import { IdleSeatService } from '@axe/features/lobby/idle-seat.service';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';
import { ServerWatchService } from '@axe/features/lobby/server-watch.service';

/** What to say for each reason the room server gives for keeping a role as it was. */
const ROLE_REJECTED_KEYS: Readonly<Record<string, string>> = {
  'not-game-master': 'feature.lobby.roleRejected.notGameMaster',
  'unknown-peer': 'feature.lobby.roleRejected.unknownPeer',
  'not-logged-in': 'feature.lobby.roleRejected.notLoggedIn',
  'last-game-master': 'feature.lobby.roleRejected.lastGameMaster',
};

/** Opens the operator's contact apart from the app, giving the page it opens no hold on this one. */
function openApart(contact: string): void {
  window.open(contact, '_blank', 'noopener,noreferrer');
}

/** How long after somebody leaves the room's list of pictures and sounds is read again. */
const ROOM_ASSET_RELIST_MS = 30_000;
/** How long the word that the seat is about to be let out stays: until it would be. */
const IDLE_NOTICE_MS = 5 * 60_000;
/** How long the word that the seat was let out stays, offering to go back in: as good as for good. */
const LEFT_ALONE_NOTICE_MS = 24 * 60 * 60_000;
/** How long the word of uploads the room server's operator held back stays: long enough to read twice. */
const UPLOAD_NOTICE_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class NetworkEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetRemoval = inject(AssetRemovalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly chatClock = inject(ChatClockService);
  private readonly reach = inject(NetworkReachService);
  private readonly auth = inject(ServerAuthService);
  private readonly snackbar = inject(SnackbarService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly idleSeat = inject(IdleSeatService);
  private readonly serverWatch = inject(ServerWatchService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly assetHttpStore = inject(AssetHttpStore);
  private readonly imageSharingSystem = inject(ImageSharingSystem);
  private readonly audioSharingSystem = inject(AudioSharingSystem);

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
      this.imageStorage.receivedUploadTurn = () => 0;
      this.audioStorage.receivedUploadTurn = () => 0;
      this.assetHttpStore.onUploadsPaused = () => {};
      this.assetHttpStore.onUploadBlocked = () => {};
      this.assetHttpStore.onRoomStorageFull = () => {};
    });
    this.imageStorage.receivedUploadTurn = () => this.turnToPutUpReceived();
    this.audioStorage.receivedUploadTurn = () => this.turnToPutUpReceived();
    this.assetHttpStore.onUploadsPaused = (paused) => {
      if (!paused) {
        this.imageStorage.resumePaused();
        this.audioStorage.resumePaused();
      }
      this.tellUploadsPaused(paused);
    };
    this.assetHttpStore.onUploadBlocked = () => this.tellUploadBlocked();
    this.assetHttpStore.onRoomStorageFull = () => this.tellRoomStorageFull();
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
      this.serverWatch.noteRoleTold();
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
      if (peer.isRoom && Network.serverClockOffset !== null) this.chatClock.calibrate();
      const account = Network.transport === 'server' ? this.auth.account() : null;
      if (account) this.lendAccountLook(account);
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
        if (errorType === 'banned') void this.tellOperatorContact();
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
      this.chatClock.calibrate();
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
      this.chatMessageService.sendSystemNotice(
        'room',
        encodeI18nMessage(key, { name: this.resolvePeerName(event.peerId) })
      );
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
   * before going offline plays as a player, rather than find its own table read-only. With no
   * connection to hand the seat a user id, it takes the one it would wait outside a room as, or a new
   * one, so what it holds, as a mask it scratches, is told from what nobody holds.
   */
  private playAlone(): void {
    const cursor = PeerCursor.myCursor;
    if (!cursor) return;
    if (!canRoleEdit(cursor.role)) cursor.role = DEFAULT_PEER_ROLE;
    if (cursor.userId.length < 1) cursor.userId = this.standbyUserId() ?? PeerContext.generateUserId();
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
        this.imageStorage.synchronize();
        this.audioStorage.synchronize();
      }
      return;
    }
    this.imageStorage.uploadAllToAssetStore();
    this.audioStorage.uploadAllToAssetStore();
    // What the room is playing goes up ahead of the rest, for everyone to hear it soonest.
    this.audioSharingSystem.preferWaiting();
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
      this.imageStorage.uploadMissedToAssetStore();
      this.audioStorage.uploadMissedToAssetStore();
    }
    this.fetchRoomAssetList(Network.peerId);
  }

  /**
   * Fetches what the room server's room holds that this seat lacks: the pictures and sounds left in
   * a room everybody had gone from, which no member's catalog names any more. Each room starts with
   * a clean slate of what the store was found to lack. A list the server could not give just then is
   * asked for again a few times, while the seat is still in the room. What the list holds that the
   * room removed is taken out of the store again, when this seat may remove it.
   */
  private fetchRoomAssets(): void {
    this.roomAssetListRetries.clear();
    if (Network.transport !== 'server' || !Network.peerContext.isRoom) return;
    this.imageSharingSystem.forgetMisses();
    this.audioSharingSystem.forgetMisses();
    this.fetchRoomAssetList(Network.peerId);
  }

  private fetchRoomAssetList(peerId: string): void {
    void this.assetHttpStore.listRoomAssets().then((assets) => {
      if (Network.peerId !== peerId || !Network.peerContext.isRoom) return;
      if (!assets) {
        this.roomAssetListRetries.schedule('list', () => this.fetchRoomAssetList(peerId));
        return;
      }
      this.roomAssetListRetries.forget('list');
      const pictures = assets.filter((asset) => asset.type.startsWith('image/'));
      const sounds = assets.filter((asset) => asset.type.startsWith('audio/'));
      this.imageStorage.forgetUploaded(pictures.map((asset) => asset.id));
      this.audioStorage.forgetUploaded(sounds.map((asset) => asset.id));
      this.assetRemoval.takeOut(assets.map((asset) => asset.id));
      this.imageSharingSystem.fetchListed(pictures);
      this.audioSharingSystem.fetchListed(sounds);
    });
  }

  /**
   * Says why the room server would not change somebody's role. A request of the seat's own, to watch
   * or to come back, is told apart, as the reasons are written for changing somebody else's.
   */
  private tellRoleRejected(data: { peerId?: unknown; reason?: unknown } | null): void {
    if (data?.peerId === Network.peerId) {
      this.chatMessageService.sendSystemNotice('room', encodeI18nMessage('feature.lobby.roleRejected.own'));
      return;
    }
    const reason = typeof data?.reason === 'string' ? data.reason : '';
    const key = ROLE_REJECTED_KEYS[reason] ?? 'feature.lobby.roleRejected.other';
    const name = typeof data?.peerId === 'string' ? this.resolvePeerName(data.peerId) : '';
    this.chatMessageService.sendSystemNotice('room', encodeI18nMessage(key, { name, reason }));
  }

  /**
   * Tells the reader that the room server's operator has stopped pictures and sounds from going up
   * for a while, so that what they add reaches nobody else till the stop is over, and then that it
   * is over and what was held has gone up. A screen made for streaming shows none of it.
   */
  private tellUploadsPaused(paused: boolean): void {
    if (this.overlayMode.active()) return;
    if (!paused) {
      this.snackbar.show(this.t('feature.lobby.uploads.resumed'));
      return;
    }
    const contact = this.assetHttpStore.operatorContact;
    const action = contact
      ? { label: this.t('feature.lobby.operatorContact.open'), run: () => openApart(contact) }
      : undefined;
    this.snackbar.show(this.t('feature.lobby.uploads.paused'), { ms: UPLOAD_NOTICE_MS, action });
  }

  /**
   * Writes under the word of a ban the contact the room server's operator gives, for the reader to ask
   * of it, where the operator gives one. The seat's link has closed, so the server is asked for it.
   */
  private async tellOperatorContact(): Promise<void> {
    const contact = await Network.instance.operatorContact();
    if (contact) {
      this.chatMessageService.sendSystemMessage(
        encodeI18nMessage('feature.lobby.operatorContact.chat', { contact: operatorContactText(contact) })
      );
    }
  }

  /** Tells the reader that the operator barred a picture or sound this seat holds, so it reaches nobody else. */
  private tellUploadBlocked(): void {
    if (!this.overlayMode.active()) {
      this.snackbar.show(this.t('feature.lobby.uploads.blocked'), { ms: UPLOAD_NOTICE_MS });
    }
  }

  /**
   * Tells the reader that the room's store is full, so what they add is kept by nobody: those in the
   * room now get it from this seat, and nobody who comes in later.
   */
  private tellRoomStorageFull(): void {
    if (!this.overlayMode.active()) {
      this.snackbar.show(this.t('feature.lobby.uploads.roomFull'), { ms: UPLOAD_NOTICE_MS });
    }
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
   * the avatar only where the account never chose its icon by hand, and a logout takes back what is
   * still as lent, so the guest seat does not go on as the account.
   * A login gone in a room, as when the server no longer takes it, says the seat is a guest now.
   */
  private followAccount(userId: string | null): void {
    const previous = this.followedAccountUserId;
    this.followedAccountUserId = userId;
    if (userId) this.lastAccountUserId = userId;
    if (this.localMode || Network.transport !== 'server') return;
    const account = this.auth.account();
    if (account) this.lendAccountLook(account);
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

  /**
   * Puts the account's name on the cursor where it still has the default, and its avatar where the
   * icon is still the default and the account has never chosen one by hand in this browser. What is
   * still as lent before, as when the login moves straight on to another account or to a new
   * avatar, counts as the default, and the account's own avatar, chosen again, as lent. An icon found chosen already, as one picked before the login,
   * counts as chosen by hand from then on, so the avatar does not come over it once a reload has
   * taken it back to the default.
   */
  private lendAccountLook(account: { userId: string; name: string; avatarUrl: string | null }): void {
    const cursor = PeerCursor.myCursor;
    if (!cursor) return;
    const lent = this.lentLook;
    const nameFree = cursor.name === DEFAULT_CURSOR_NAME || (lent.name !== '' && cursor.name === lent.name);
    if (nameFree && account.name) {
      cursor.name = account.name;
      lent.name = account.name;
    }
    const icon = cursor.imageIdentifier;
    if (account.avatarUrl && icon === account.avatarUrl) {
      lent.imageIdentifier = icon;
      return;
    }
    const iconLent = lent.imageIdentifier !== '' && icon === lent.imageIdentifier;
    if (icon !== DEFAULT_CURSOR_IMAGE_IDENTIFIER && !iconLent) {
      noteIconChosenByHand(account.userId);
      return;
    }
    if (!account.avatarUrl || hasChosenIconByHand(account.userId)) {
      if (iconLent) cursor.imageIdentifier = DEFAULT_CURSOR_IMAGE_IDENTIFIER;
      lent.imageIdentifier = '';
      return;
    }
    cursor.imageIdentifier = this.imageStorage.add(account.avatarUrl).identifier;
    lent.imageIdentifier = cursor.imageIdentifier;
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
      case 'banned':
        return encodeI18nMessage('feature.lobby.errors.roomServerBanned');
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
