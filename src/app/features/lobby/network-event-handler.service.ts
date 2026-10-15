import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PeerReconnectState } from '@axe/core/network/connection';
import { Network } from '@axe/core/network/network';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { PeerContext } from '@axe/core/network/peer-context';
import { NO_BACKEND, SERVER_UNREACHABLE } from '@axe/core/network/server/server-errors';
import { MAX_MEMBERS } from '@axe/core/network/server/server-protocol';
import { SAME_NAME_MEMBER_ERROR } from '@axe/core/network/skyway/same-name-member';
import { guestUserIdAfter, guestUserIdOf, loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { handOverOwnership } from '@axe/domain/peer/ownership';
import { DEFAULT_CURSOR_IMAGE_IDENTIFIER, DEFAULT_CURSOR_NAME, PeerCursor } from '@axe/domain/peer/peer-cursor';
import { DEFAULT_PEER_ROLE } from '@axe/domain/peer/peer-role';

/** What to say for each reason the room server gives for keeping a role as it was. */
const ROLE_REJECTED_KEYS: Readonly<Record<string, string>> = {
  'not-game-master': 'feature.lobby.roleRejected.notGameMaster',
  'unknown-peer': 'feature.lobby.roleRejected.unknownPeer',
  'not-logged-in': 'feature.lobby.roleRejected.notLoggedIn',
  'last-game-master': 'feature.lobby.roleRejected.lastGameMaster',
};

@Injectable({ providedIn: 'root' })
export class NetworkEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly auth = inject(ServerAuthService);

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
  };
  private serverErrorReconnectAttempts = 0;
  private otherErrorReconnectAttempts = 0;
  private serverErrorReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private localMode = false;
  /** The account last followed; undefined until the first look, which changes nothing. */
  private followedAccountUserId: string | null | undefined = undefined;

  constructor() {
    networkMessage$.subscribe((message) => {
      if (message.eventName !== 'ROLE_REJECTED' || message.sendFrom !== Network.authorityPeerId) return;
      this.tellRoleRejected(message.data as { peerId?: unknown; reason?: unknown } | null);
    }, this.destroyRef);
    effect(() => {
      const account = this.auth.account();
      untracked(() => this.followAccount(account?.userId ?? null));
    });
    this.objectChange.loadConfig$.subscribe((event) => {
      const config = event.config as Record<string, unknown>;
      this.localMode = config.localMode === true;
      Network.configure(config);
      if (this.localMode) return;
      Network.openStandby(this.standbyUserId());
    }, this.destroyRef);
    this.objectChange.networkOpen$.subscribe(() => {
      this.resetServerErrorReconnect();
      const peer = Network.peerContext;
      PeerCursor.myCursor.peerId = peer.peerId;
      PeerCursor.myCursor.userId = peer.userId;
      this.takeServerRole();
      // Outside a room nobody hands out roles, and a role a room gave must not keep the solo table
      // read-only; on a room server, waiting outside a room is playing as a player.
      if (Network.transport === 'server' && !peer.isRoom) PeerCursor.myCursor.role = DEFAULT_PEER_ROLE;
      this.rememberIdentity(peer);
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
      if (this.otherErrorReconnectAttempts >= NetworkEventHandlerService.MAX_SERVER_ERROR_RECONNECTS) return;
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
    this.objectChange.peerReconnect$.subscribe((event) => {
      if (this.localMode) return;
      if (event.state === 'recovered' && event.peerId === Network.peerId) this.takeServerRole();
      const key = NetworkEventHandlerService.RECONNECT_MESSAGE_KEYS[event.state];
      if (!key) return;
      this.chatMessageService.sendSystemMessage(encodeI18nMessage(key, { name: this.resolvePeerName(event.peerId) }));
    }, this.destroyRef);
    this.objectChange.onObjectChangedForAlias(
      ['PeerCursor'],
      (event) => {
        const myCursor = PeerCursor.myCursor;
        if (!myCursor || event.identifier !== myCursor.identifier) return;
        const peer = Network.peerContext;
        if (!peer?.isRoom) return;
        saveIdentity({
          userId: peer.userId,
          roomId: peer.roomId,
          roomName: peer.roomName,
          role: myCursor.role,
          reConnectPass: myCursor.reConnectPass,
          roomKey: Network.roomKey ?? '',
          guestUserId: guestUserIdAfter(peer.userId, loadIdentity()),
        });
      },
      this.destroyRef
    );
  }

  /**
   * Writes down who this tab is, so a reload can pick up where it left off.
   *
   * A reload opens the waiting connection before any room, and that connection belongs to no
   * room. Written down as it stands, it would wipe out the room the tab had just been in, and a
   * game master coming back to their own table could no longer be told from one walking into
   * somebody else's. Outside a room, the room last written down is kept.
   */
  private rememberIdentity(peer: { userId: string; roomId: string; roomName: string; isRoom: boolean }): void {
    const saved = loadIdentity();
    const last = peer.isRoom ? null : saved;
    saveIdentity({
      userId: peer.userId,
      roomId: last?.roomId ?? peer.roomId,
      roomName: last?.roomName ?? peer.roomName,
      role: PeerCursor.myCursor.role,
      reConnectPass: PeerCursor.myCursor.reConnectPass,
      roomKey: last ? (last.roomKey ?? '') : (Network.roomKey ?? ''),
      guestUserId: guestUserIdAfter(peer.userId, saved),
    });
  }

  /** Takes on the role the room server gave this seat on letting it in; SkyWay gives none. */
  private takeServerRole(): void {
    const role = Network.serverRole;
    const cursor = PeerCursor.myCursor;
    if (role && cursor && cursor.role !== role) cursor.role = role;
  }

  /** Says why the room server would not change somebody's role. */
  private tellRoleRejected(data: { peerId?: unknown; reason?: unknown } | null): void {
    const reason = typeof data?.reason === 'string' ? data.reason : '';
    const key = ROLE_REJECTED_KEYS[reason] ?? 'feature.lobby.roleRejected.other';
    const name = typeof data?.peerId === 'string' ? this.resolvePeerName(data.peerId) : '';
    this.chatMessageService.sendSystemMessage(encodeI18nMessage(key, { name, reason }));
  }

  /**
   * The user id to wait outside a room as: on a room server, the account's while somebody is logged
   * in, and the tab's own otherwise, never an account's; with SkyWay, the one saved before a reload.
   */
  private standbyUserId(): string | undefined {
    const account = Network.transport === 'server' ? this.auth.account() : null;
    if (account) return account.userId;
    return guestUserIdOf(loadIdentity()) || undefined;
  }

  /**
   * Follows a login or logout, in this tab or another, on a room server. In a room, the seat goes in
   * again as whoever is logged in now; outside one, it waits as them, taking what the old id held
   * along. A login also lends the cursor the account's name and avatar while it has the defaults.
   */
  private followAccount(userId: string | null): void {
    const previous = this.followedAccountUserId;
    this.followedAccountUserId = userId;
    if (this.localMode || Network.transport !== 'server') return;
    const account = this.auth.account();
    if (account) this.lendAccountLook(account.name, account.avatarUrl);
    if (previous === undefined || previous === userId || !Network.isOpen) return;

    const peer = Network.peerContext;
    const next = this.standbyUserId() ?? PeerContext.generateUserId();
    if (peer.isRoom) {
      Network.open(next, peer.roomId, peer.roomName, peer.password, Network.roomKey ?? undefined);
      return;
    }
    handOverOwnership(peer.userId, next);
    Network.openStandby(next);
  }

  /** Puts the account's name and avatar on the cursor where it still has the defaults. */
  private lendAccountLook(name: string, avatarUrl: string | null): void {
    const cursor = PeerCursor.myCursor;
    if (!cursor) return;
    if (cursor.name === DEFAULT_CURSOR_NAME && name) cursor.name = name;
    if (cursor.imageIdentifier === DEFAULT_CURSOR_IMAGE_IDENTIFIER && avatarUrl) {
      cursor.imageIdentifier = ImageStorage.instance.add(avatarUrl).identifier;
    }
  }

  private handleServerErrorReconnect(): void {
    if (this.serverErrorReconnectAttempts >= NetworkEventHandlerService.MAX_SERVER_ERROR_RECONNECTS) {
      this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.skywayServer'));
      return;
    }

    const backoff = NetworkEventHandlerService.SERVER_ERROR_RECONNECT_BACKOFF_MS;
    const delayMs = backoff[this.serverErrorReconnectAttempts] ?? backoff[backoff.length - 1];
    this.serverErrorReconnectAttempts++;

    this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.reconnecting'));

    if (this.serverErrorReconnectTimer != null) clearTimeout(this.serverErrorReconnectTimer);
    this.serverErrorReconnectTimer = setTimeout(() => {
      this.serverErrorReconnectTimer = null;
      Network.openStandby(this.standbyUserId());
    }, delayMs);
  }

  private resetServerErrorReconnect(): void {
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
