import { Logger as AppLogger } from '@axe/core/logging/logger';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { SkyWayBackend } from '@axe/core/network/skyway/skyway-backend';
import { sha256Base64Url } from '@axe/core/util/crypto-util';
import {
  Channel,
  LocalDataStream,
  LocalPerson,
  Logger,
  Publication,
  SkyWayChannel,
  SkyWayContext,
  SkyWayError,
  SkyWayStreamFactory,
  Subscription,
} from '@skyway-sdk/core';

export class SkyWayFacade {
  url = '';
  context: SkyWayContext | null = null;
  private lobby: Channel | null = null;
  private lobbyPerson: LocalPerson | null = null;
  room: Channel | null = null;
  roomPerson: LocalPerson | null = null;

  publication: Publication<LocalDataStream> | null = null;

  peer: PeerContext = PeerContext.parse('???');
  /** Whether open has finished and the session has not been closed since. */
  get isOpen(): boolean {
    return this.peer.isOpen;
  }
  private isDestroyed = false;

  onOpen: ((peer: IPeerContext) => void) | null = null;
  onClose: ((peer: IPeerContext) => void) | null = null;
  onFatalError: ((peer: IPeerContext, errorType: string, errorMessage: string, errorObject: unknown) => void) | null =
    null;
  onSubscribed: ((peer: IPeerContext, subscription: Subscription) => void) | null = null;
  onRoomRestore: ((peer: IPeerContext) => void) | null = null;

  /**
   * Creates a SkyWay context with a backend token, then joins the room and a lobby as the peer.
   *
   * An open session is closed first. Failures are reported through onFatalError, not thrown, and
   * onOpen fires at the end. A peer that is not in a room gets a context but joins no channel.
   */
  async open(peer: IPeerContext) {
    if (this.isOpen) await this.close();
    try {
      this.peer = PeerContext.parse(peer.peerId);
      this.peer.userId = peer.userId;
      this.peer.roomName = peer.roomName;
      this.peer.password = peer.password;
      this.isDestroyed = false;

      await this.createContext();
      await this.joinRoom();
      await this.joinLobby();

      this.peer.isOpen = true;

      this.onOpen?.(this.peer);
    } catch (err) {
      AppLogger.error('[SkyWay] open失敗', err);
      this.onFatalError?.(this.peer, (err as Error).name, (err as Error).message, err as Error);
    }
  }

  /** Leaves the lobby and room and disposes the context; errors are logged, not thrown. */
  async close() {
    try {
      this.peer = PeerContext.parse('???');
      this.isDestroyed = true;

      await this.leaveLobby();
      await this.leaveRoom();
      await this.disposeContext();
    } catch (err) {
      AppLogger.error('[SkyWay] close失敗', err);
    }
  }

  /** Starts leaving the room and lobby without waiting, for a page that is unloading; never throws. */
  leaveImmediately() {
    try {
      if (this.roomPerson?.state !== 'left') {
        this.roomPerson?.leave().catch(() => {});
      }
      if (this.lobbyPerson?.state !== 'left') {
        this.lobbyPerson?.leave().catch(() => {});
      }
    } catch {
      /* unload-time errors swallowed */
    }
  }

  /**
   * Joins the room and lobby again as the same peer after leaveImmediately, with a new data stream.
   *
   * For when the page did not unload after all. Does nothing once closed or with the context disposed.
   */
  async rejoinAfterLeave() {
    if (this.isDestroyed || !this.context || this.context.disposed) return;
    try {
      if (this.roomPerson?.state === 'left') this.roomPerson = null;
      if (this.lobbyPerson?.state === 'left') this.lobbyPerson = null;
      if (this.publication) {
        this.publication.onSubscribed.removeAllListeners();
        this.publication = null;
      }
      await this.joinRoomPerson();
      await this.createRoomDataStream();
      await this.joinLobbyPerson();
      AppLogger.info('[SkyWay] beforeunloadキャンセル後の再参加完了');
    } catch (err) {
      AppLogger.error('[SkyWay] 再参加失敗', err);
    }
  }

  private async createContext() {
    await this.disposeContext();
    if (this.isDestroyed) return;

    const backend = new SkyWayBackend(this.url);
    const channelName = this.peer.isRoom
      ? await sha256Base64Url(`${this.peer.roomId}${this.peer.roomName}${this.peer.password}`)
      : this.peer.peerId;

    const authToken = await backend.createSkyWayAuthToken(channelName, this.peer.peerId);
    if (authToken.length < 1) {
      const message = `APIバックエンド< ${backend.url} >にアクセスできませんでした。SkyWayの認証トークンを発行するサーバが必要です。`;
      this.onFatalError?.(this.peer, 'server-error', message, new Error(message));
      return;
    }

    const context = await SkyWayContext.Create(authToken);
    context.onTokenUpdateReminder.add(async () => {
      AppLogger.debug('[SkyWay] トークン更新リマインダー');
      const authToken = await backend.createSkyWayAuthToken(channelName, this.peer.peerId);
      if (authToken.length < 1) {
        const message = `APIバックエンド< ${backend.url} >にアクセスできませんでした。`;
        this.onFatalError?.(this.peer, 'server-error', message, new Error(message));
        return;
      }
      context.updateAuthToken(authToken);
    });

    context.onTokenExpired.add(() => {
      AppLogger.error('[SkyWay] トークン有効期限切れ');
      if (this.isOpen) {
        this.close();
        this.onClose?.(this.peer);
      }
      const message = 'SkyWayの認証トークンの有効期限が切れました。';
      this.onFatalError?.(this.peer, 'token-expired', message, new Error(message));
    });

    context.onFatalError.add((err) => {
      AppLogger.error('[SkyWay] 致命的エラー', err);
      if (this.isOpen) {
        this.close();
        this.onClose?.(this.peer);
      }
      this.onFatalError?.(this.peer, err.name, err.message, err);
    });

    this.context = context;
  }

  private async joinLobby() {
    await this.joinLobbyChannel();
    await this.joinLobbyPerson();
  }

  private async joinLobbyChannel() {
    await this.leaveLobbyChannel();
    if (this.isDestroyed || !this.peer.isRoom || !this.context || this.context?.disposed) return;

    const lobbys: Channel[] = [];
    for (const lobbyName of this.getLobbyNames()) {
      const lobby = await SkyWayChannel.FindOrCreate(this.context, {
        name: lobbyName,
      });
      lobbys.push(lobby);
      if (lobby.members.length < 300) break;
    }

    const joinLobby = lobbys.reduce<Channel | null>(
      (best, lobby) => (best === null || lobby.members.length < best.members.length ? lobby : best),
      null
    );

    lobbys.forEach((lobby) => {
      if (lobby !== joinLobby) lobby.dispose();
    });

    if (!joinLobby) return;
    joinLobby.onClosed.add(() => {
      AppLogger.warn('[SkyWay] ロビーチャンネルが閉じられました');
      this.joinLobby();
    });

    this.lobby = joinLobby;
  }

  private async joinLobbyPerson() {
    await this.leaveLobbyPerson();
    if (this.isDestroyed || !this.peer.isRoom || !this.context || this.context?.disposed || this.lobby == null) return;

    const lobbyPerson = await this.lobby.join({
      name: this.peer.peerId,
      metadata: JSON.stringify({ roomName: this.peer.roomName }),
      preventAutoLeaveOnBeforeUnload: true,
    });

    lobbyPerson.onLeft.add(() => {});

    lobbyPerson.onFatalError.add((err) => {
      AppLogger.error('[SkyWay] ロビー致命的エラー', err);
    });

    this.lobbyPerson = lobbyPerson;
  }

  private async joinRoom() {
    await this.joinRoomChannel();
    await this.joinRoomPerson();
    await this.createRoomDataStream();
  }

  private async joinRoomChannel() {
    await this.leaveRoomChannel();
    if (this.isDestroyed || !this.peer.isRoom || !this.context || this.context?.disposed) return;

    const roomName = await sha256Base64Url(`${this.peer.roomId}${this.peer.roomName}${this.peer.password}`);

    const room = await SkyWayChannel.FindOrCreate(this.context, {
      name: roomName,
    });

    room.onClosed.add(async () => {
      AppLogger.warn('[SkyWay] ルームチャンネルが閉じられました');
      await this.joinRoom();
      AppLogger.info('[SkyWay] ルーム復旧完了');
      this.onRoomRestore?.(this.peer);
    });

    this.room = room;
  }

  private async joinRoomPerson() {
    await this.leaveRoomPerson();
    if (this.isDestroyed || !this.peer.isRoom || !this.context || this.context?.disposed || this.room == null) return;

    const roomPerson = await this.room.join({
      name: this.peer.peerId,
      metadata: JSON.stringify({ roomName: this.peer.roomName }),
      preventAutoLeaveOnBeforeUnload: true,
    });

    roomPerson.onFatalError.add((err) => {
      AppLogger.error('[SkyWay] ルーム致命的エラー', err);
      if (this.isOpen) {
        this.close();
        this.onClose?.(this.peer);
      }
      this.onFatalError?.(this.peer, err.name, err.message, err);
    });

    this.roomPerson = roomPerson;
  }

  private async createRoomDataStream() {
    if (this.isDestroyed || !this.peer.isRoom || !this.context || this.context?.disposed || this.roomPerson == null)
      return;
    const dataStream = await SkyWayStreamFactory.createDataStream();
    const publication = await this.roomPerson.publish(dataStream, {
      metadata: 'udonarium-data-stream',
    });

    publication.onSubscribed.add((event) => {
      const peerId = event.subscription.subscriber.name;
      if (peerId === null || peerId === undefined) {
        this.roomPerson?.unsubscribe(event.subscription).catch((error) => {
          AppLogger.warn('[SkyWay] サブスクリプション解除失敗', error);
        });
        return;
      }

      const peer = PeerContext.parse(peerId);
      this.onSubscribed?.(peer, event.subscription);
    });

    this.publication = publication;
  }

  private async disposeContext() {
    const context = this.context;
    this.context = null;
    if (!context) return;
    context.dispose();
  }

  private async leaveLobby() {
    await this.leaveLobbyPerson();
    await this.leaveLobbyChannel();
  }

  private async leaveLobbyChannel() {
    const lobby = this.lobby;
    this.lobby = null;

    if (!lobby) return;
    lobby.onClosed.removeAllListeners();
    lobby.dispose();
  }

  private async leaveLobbyPerson() {
    const lobbyPerson = this.lobbyPerson;
    this.lobbyPerson = null;

    if (!lobbyPerson || lobbyPerson.state === 'left') return;
    lobbyPerson.onLeft.removeAllListeners();
    lobbyPerson.onFatalError.removeAllListeners();
    await lobbyPerson.leave();
  }

  private async leaveRoom() {
    await this.closeRoomDataStream();
    await this.leaveRoomPerson();
    await this.leaveRoomChannel();
  }

  private async leaveRoomChannel() {
    const room = this.room;
    this.room = null;

    if (!room) return;
    room.onMemberJoined.removeAllListeners();
    room.onMemberLeft.removeAllListeners();
    room.onMemberListChanged.removeAllListeners();
    room.onStreamPublished.removeAllListeners();
    room.onClosed.removeAllListeners();
    room.dispose();
  }

  private async leaveRoomPerson() {
    const roomPerson = this.roomPerson;
    this.roomPerson = null;

    if (!roomPerson || roomPerson.state === 'left') return;
    roomPerson.onLeft.removeAllListeners();
    roomPerson.onFatalError.removeAllListeners();
    await roomPerson.leave();
  }

  private async closeRoomDataStream() {
    const publication = this.publication;
    this.publication = null;

    if (!publication) return;
    publication.onSubscribed.removeAllListeners();
    await this.roomPerson?.unpublish(publication);
  }

  /** Peer ids of every member of the lobbies the token covers; empty while the session is closed. */
  async listAllPeers(): Promise<string[]> {
    if (this.isDestroyed || !this.isOpen) return [];

    if (!this.context) return [];
    const context = this.context;
    const lobbys: Channel[] = [];
    for (const lobbyName of this.getLobbyNames()) {
      const level = Logger.level;
      Logger.level = 'disable';
      try {
        const lobby =
          this.lobby?.name === lobbyName ? this.lobby : await SkyWayChannel.Find(context, { name: lobbyName });
        lobbys.push(lobby);
      } catch (error) {
        if (error instanceof SkyWayError) {
          if (error.name !== 'channelNotFound') AppLogger.error('[SkyWay] ピア一覧取得エラー', error);
        } else {
          AppLogger.error('[SkyWay] ピア一覧取得エラー', error);
        }
      }
      Logger.level = level;
    }

    const allPeerIds = lobbys.flatMap((lobby) => lobby.members.map((member) => member.name ?? '???'));

    lobbys.forEach((lobby) => {
      if (lobby.name !== this.lobby?.name) lobby.dispose();
    });
    return allPeerIds;
  }

  /**
   * Every lobby member with the room name from its metadata, for the room list; empty while closed.
   *
   * A member whose metadata does not parse is listed with an empty room name.
   */
  async listAllLobbyMembers(): Promise<{ peerId: string; roomName: string }[]> {
    if (this.isDestroyed || !this.isOpen) return [];
    if (!this.context) return [];

    const context = this.context;
    const lobbys: Channel[] = [];
    for (const lobbyName of this.getLobbyNames()) {
      const level = Logger.level;
      Logger.level = 'disable';
      try {
        const lobby =
          this.lobby?.name === lobbyName ? this.lobby : await SkyWayChannel.Find(context, { name: lobbyName });
        lobbys.push(lobby);
      } catch (error) {
        if (error instanceof SkyWayError) {
          if (error.name !== 'channelNotFound') AppLogger.error('[SkyWay] ロビーメンバー取得エラー', error);
        } else {
          AppLogger.error('[SkyWay] ロビーメンバー取得エラー', error);
        }
      }
      Logger.level = level;
    }

    const members = lobbys.flatMap((lobby) =>
      lobby.members
        .filter((member) => member.name != null)
        .map((member) => {
          const peerId = member.name ?? '';
          let roomName = '';
          try {
            const meta = member.metadata ? (JSON.parse(member.metadata) as { roomName?: string }) : null;
            if (meta?.roomName) roomName = meta.roomName;
          } catch {
            /* malformed metadata ignored */
          }
          return { peerId, roomName };
        })
    );

    lobbys.forEach((lobby) => {
      if (lobby.name !== this.lobby?.name) lobby.dispose();
    });
    return members;
  }

  private getLobbyNames(): string[] {
    const names: Set<string> = new Set();
    const wildcards: Set<string> = new Set();
    let maxLobbySize = 0;

    for (const channel of ((
      this.context?.authToken as unknown as { scope?: { app?: { channels?: { name?: string }[] } } }
    )?.scope?.app?.channels ?? []) as { name?: string }[]) {
      const name = channel.name ?? '';
      if (name.startsWith('udonarium-lobby-')) {
        if (name.includes('*')) {
          wildcards.add(name);
        } else {
          names.add(name);
        }
        try {
          const regArray = /-(\d+)$/.exec(name);
          let lobbySize = regArray && 1 < regArray.length ? Number(regArray[1]) : 0;
          if (isNaN(lobbySize)) lobbySize = 0;
          if (maxLobbySize < lobbySize) maxLobbySize = lobbySize;
        } catch (e) {
          AppLogger.warn('[SkyWay] ロビー名パースエラー', e);
        }
      }
    }

    for (const wildcard of wildcards) {
      for (let i = 1; i <= maxLobbySize; i++) {
        names.add(wildcard.replace('*', `${i}`));
      }
    }

    const sorted = Array.from(names)
      .map((n) => [n, n.replace(/\d+/g, (m) => m.padStart(10, '0'))] as const)
      .sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([n]) => n);

    return sorted;
  }
}
