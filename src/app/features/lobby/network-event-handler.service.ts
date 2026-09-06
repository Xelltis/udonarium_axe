import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PeerReconnectState } from '@axe/core/network/connection';
import { Network } from '@axe/core/network/network';
import { loadIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

@Injectable({ providedIn: 'root' })
export class NetworkEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);

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
  private serverErrorReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private localMode = false;

  constructor() {
    this.objectChange.loadConfig$.subscribe((event) => {
      const config = event.config as Record<string, unknown>;
      this.localMode = config.localMode === true;
      Network.configure(config);
      if (this.localMode) return;
      Network.openStandby(loadIdentity()?.userId);
    }, this.destroyRef);
    this.objectChange.networkOpen$.subscribe(() => {
      this.resetServerErrorReconnect();
      const peer = Network.peerContext;
      PeerCursor.myCursor.peerId = peer.peerId;
      PeerCursor.myCursor.userId = peer.userId;
      saveIdentity({
        userId: peer.userId,
        roomId: peer.roomId,
        roomName: peer.roomName,
        role: PeerCursor.myCursor.role,
        reConnectPass: PeerCursor.myCursor.reConnectPass,
      });
    }, this.destroyRef);
    this.objectChange.networkError$.subscribe((event) => {
      if (this.localMode) return;
      const { errorType, errorMessage } = event;
      const quietErrorTypes = ['peer-unavailable'];
      if (quietErrorTypes.includes(errorType)) return;

      // A server error may be a slow cold start, so it backs off and tries again a few times.
      // Past the limit it treats the failure as permanent, says so and stops rather than looping.
      if (errorType === 'server-error') {
        this.handleServerErrorReconnect();
        return;
      }

      // Any error can repeat without end - a token the cloud will not accept fails again the
      // moment it is retried - so the same limit that bounds a server error bounds these too.
      // Without it the chat fills with the same pair of lines and the reconnects become traffic.
      if (this.serverErrorReconnectAttempts >= NetworkEventHandlerService.MAX_SERVER_ERROR_RECONNECTS) return;
      this.serverErrorReconnectAttempts++;

      this.chatMessageService.sendSystemMessage(this.resolveNetworkErrorMessage(errorType, errorMessage));
      this.chatMessageService.sendSystemMessage(encodeI18nMessage('feature.lobby.errors.reconnecting'));
      Network.openStandby(loadIdentity()?.userId);
    }, this.destroyRef);
    this.objectChange.peerConnect$.subscribe(() => {
      this.chatMessageService.calibrateTimeOffset();
    }, this.destroyRef);
    this.objectChange.peerReconnect$.subscribe((event) => {
      if (this.localMode) return;
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
        });
      },
      this.destroyRef
    );
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
      Network.openStandby(loadIdentity()?.userId);
    }, delayMs);
  }

  private resetServerErrorReconnect(): void {
    this.serverErrorReconnectAttempts = 0;
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
