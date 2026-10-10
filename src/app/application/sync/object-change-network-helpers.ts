import { EventChannel, ReadableChannel } from '@axe/core/event/event-channel';
import { PeerReconnectState } from '@axe/core/network/connection';
import { NetworkMessage } from '@axe/core/network/network-messaging';

export interface ObjectDeleteEvent {
  identifier: string;
  aliasName: string;
  isSendFromSelf: boolean;
}

export interface FileSyncEvent {
  isSendFromSelf: boolean;
}

export interface NetworkPeerEvent {
  peerId: string;
}

export interface PeerReconnectEvent {
  peerId: string;
  state: PeerReconnectState;
}

export interface WritingMessageEvent {
  tabIdentifier: string;
  sendFrom: string;
  isSendFromSelf: boolean;
  speakerIdentifier?: string;
}

export interface IdentifierEvent {
  identifier: string;
}

export interface CoinFlipEvent {
  identifier: string;
  face: string;
}

export interface CursorMoveEvent {
  x: number;
  y: number;
  z: number;
  sendFrom: string;
}

export interface HeartBeatEvent {
  timestamp: number;
  id: string;
  diffDown: number | null;
  secdCounter: number;
  sendFrom: string;
}

export interface NetworkErrorEvent {
  errorType: string;
  errorMessage: string;
  /** The connection that failed, by this end's peer id on it; empty where it is not known. */
  peerId?: string;
}

export interface ObjectChangeNetworkTargets {
  objectDeleted$: EventChannel<ObjectDeleteEvent>;
  fileSyncList$: EventChannel<FileSyncEvent>;
  fileResourceUpdated$: EventChannel<FileSyncEvent>;
  peerConnect$: EventChannel<NetworkPeerEvent>;
  peerDisconnect$: EventChannel<NetworkPeerEvent>;
  peerReconnect$: EventChannel<PeerReconnectEvent>;
  networkOpen$: EventChannel<NetworkPeerEvent>;
  writingMessage$: EventChannel<WritingMessageEvent>;
  shuffleCardStack$: EventChannel<IdentifierEvent>;
  rollDiceSymbol$: EventChannel<IdentifierEvent>;
  flipCoin$: EventChannel<CoinFlipEvent>;
  cursorMove$: EventChannel<CursorMoveEvent>;
  heartBeat$: EventChannel<HeartBeatEvent>;
  localObjectUpdated$: EventChannel<void>;
  audioSyncList$: EventChannel<FileSyncEvent>;
  networkError$: EventChannel<NetworkErrorEvent>;
  eventActivity$: EventChannel<void>;
}

/**
 * Subscribes to 'source$' with a single listener that dispatches each message
 * to the appropriate EventChannel in 'targets'. Returns an unsubscribe function.
 */
export function subscribeNetworkBindings(
  source$: ReadableChannel<NetworkMessage>,
  targets: ObjectChangeNetworkTargets
): () => void {
  return source$.subscribe((msg) => {
    targets.eventActivity$.emit();
    switch (msg.eventName) {
      case 'DELETE_GAME_OBJECT': {
        const data = msg.data as { identifier: string; aliasName: string };
        targets.objectDeleted$.emit({
          identifier: data.identifier,
          aliasName: data.aliasName,
          isSendFromSelf: msg.isSendFromSelf,
        });
        break;
      }
      case 'SYNCHRONIZE_FILE_LIST':
        targets.fileSyncList$.emit({ isSendFromSelf: msg.isSendFromSelf });
        break;
      case 'UPDATE_FILE_RESOURE':
        targets.fileResourceUpdated$.emit({ isSendFromSelf: msg.isSendFromSelf });
        break;
      case 'CONNECT_PEER':
        targets.peerConnect$.emit({ peerId: (msg.data as { peerId: string }).peerId });
        break;
      case 'DISCONNECT_PEER':
        targets.peerDisconnect$.emit({ peerId: (msg.data as { peerId: string }).peerId });
        break;
      case 'PEER_RECONNECT': {
        const data = msg.data as { peerId: string; state: PeerReconnectState };
        targets.peerReconnect$.emit({ peerId: data.peerId, state: data.state });
        break;
      }
      case 'OPEN_NETWORK':
        targets.networkOpen$.emit({ peerId: (msg.data as { peerId: string }).peerId });
        break;
      case 'WRITING_A_MESSAGE':
        targets.writingMessage$.emit({
          tabIdentifier: msg.data as string,
          sendFrom: msg.sendFrom,
          isSendFromSelf: msg.isSendFromSelf,
        });
        break;
      case 'WRITING_A_MESSAGE_DETAIL': {
        const data = msg.data as { tabIdentifier?: string; speakerIdentifier?: string };
        if (!data.tabIdentifier) break;
        targets.writingMessage$.emit({
          tabIdentifier: data.tabIdentifier,
          sendFrom: msg.sendFrom,
          isSendFromSelf: msg.isSendFromSelf,
          speakerIdentifier: data.speakerIdentifier,
        });
        break;
      }
      case 'SHUFFLE_CARD_STACK':
        targets.shuffleCardStack$.emit({ identifier: (msg.data as { identifier: string }).identifier });
        break;
      case 'ROLL_DICE_SYMBOL':
        targets.rollDiceSymbol$.emit({ identifier: (msg.data as { identifier: string }).identifier });
        break;
      case 'FLIP_COIN': {
        const data = msg.data as { identifier: string; face: string };
        targets.flipCoin$.emit({ identifier: data.identifier, face: data.face });
        break;
      }
      case 'CURSOR_MOVE': {
        const data = msg.data as [number, number, number];
        targets.cursorMove$.emit({ x: data[0], y: data[1], z: data[2], sendFrom: msg.sendFrom });
        break;
      }
      case 'HEART_BEAT': {
        const data = msg.data as [number, string, number | null, number];
        targets.heartBeat$.emit({
          timestamp: data[0],
          id: data[1],
          diffDown: data[2],
          secdCounter: data[3],
          sendFrom: msg.sendFrom,
        });
        break;
      }
      case 'LOCAL_OBJECT_UPDATED':
        targets.localObjectUpdated$.emit();
        break;
      case 'SYNCHRONIZE_AUDIO_LIST':
        targets.audioSyncList$.emit({ isSendFromSelf: msg.isSendFromSelf });
        break;
      case 'NETWORK_ERROR': {
        const data = msg.data as { errorType: string; errorMessage: string; peerId?: string };
        targets.networkError$.emit({
          errorType: data.errorType,
          errorMessage: data.errorMessage,
          ...(data.peerId ? { peerId: data.peerId } : {}),
        });
        break;
      }
    }
  });
}
