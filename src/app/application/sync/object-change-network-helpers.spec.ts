import {
  type CoinFlipEvent,
  type CursorMoveEvent,
  type FileSyncEvent,
  type HeartBeatEvent,
  type IdentifierEvent,
  type NetworkErrorEvent,
  type NetworkPeerEvent,
  type ObjectChangeNetworkTargets,
  type ObjectDeleteEvent,
  type PeerReconnectEvent,
  subscribeNetworkBindings,
  type WritingMessageEvent,
} from '@axe/application/sync/object-change-network-helpers';
import { EventChannel } from '@axe/core/event/event-channel';
import { localDispatch, networkMessage$ } from '@axe/core/network/network-messaging';

function makeTargets(): ObjectChangeNetworkTargets {
  return {
    objectDeleted$: new EventChannel<ObjectDeleteEvent>(),
    fileSyncList$: new EventChannel<FileSyncEvent>(),
    fileResourceUpdated$: new EventChannel<FileSyncEvent>(),
    peerConnect$: new EventChannel<NetworkPeerEvent>(),
    peerDisconnect$: new EventChannel<NetworkPeerEvent>(),
    peerReconnect$: new EventChannel<PeerReconnectEvent>(),
    networkOpen$: new EventChannel<NetworkPeerEvent>(),
    writingMessage$: new EventChannel<WritingMessageEvent>(),
    shuffleCardStack$: new EventChannel<IdentifierEvent>(),
    rollDiceSymbol$: new EventChannel<IdentifierEvent>(),
    flipCoin$: new EventChannel<CoinFlipEvent>(),
    cursorMove$: new EventChannel<CursorMoveEvent>(),
    heartBeat$: new EventChannel<HeartBeatEvent>(),
    localObjectUpdated$: new EventChannel<void>(),
    audioSyncList$: new EventChannel<FileSyncEvent>(),
    networkError$: new EventChannel<NetworkErrorEvent>(),
    eventActivity$: new EventChannel<void>(),
  };
}

describe('object-change-network-helpers', () => {
  it('turns each network event into the payload its channel expects', async () => {
    const targets = makeTargets();
    const offBindings = subscribeNetworkBindings(networkMessage$, targets);

    const results: {
      delete?: ObjectDeleteEvent;
      peer?: NetworkPeerEvent;
      writing?: WritingMessageEvent;
      cursor?: CursorMoveEvent;
      error?: NetworkErrorEvent;
    } = {};

    const deleteOff = targets.objectDeleted$.subscribe((e) => (results.delete = e));
    const peerOff = targets.peerConnect$.subscribe((e) => (results.peer = e));
    const writingOff = targets.writingMessage$.subscribe((e) => (results.writing = e));
    const cursorOff = targets.cursorMove$.subscribe((e) => (results.cursor = e));
    const errorOff = targets.networkError$.subscribe((e) => (results.error = e));

    try {
      localDispatch('DELETE_GAME_OBJECT', { identifier: 'del-1', aliasName: 'character' }, 'remote-peer');
      localDispatch('CONNECT_PEER', { peerId: 'peer-1' }, 'remote-peer');
      localDispatch('WRITING_A_MESSAGE', 'tab-1', 'remote-peer');
      localDispatch('CURSOR_MOVE', [1, 2, 3], 'remote-peer');
      localDispatch('NETWORK_ERROR', { errorType: 'disconnect', errorMessage: 'failed' }, 'remote-peer');

      expect(results.delete).toEqual({ identifier: 'del-1', aliasName: 'character', isSendFromSelf: false });
      expect(results.peer).toEqual({ peerId: 'peer-1' });
      expect(results.writing).toEqual({ tabIdentifier: 'tab-1', sendFrom: 'remote-peer', isSendFromSelf: false });
      expect(results.cursor).toEqual({ x: 1, y: 2, z: 3, sendFrom: 'remote-peer' });
      expect(results.error).toEqual({ errorType: 'disconnect', errorMessage: 'failed' });
    } finally {
      deleteOff();
      peerOff();
      writingOff();
      cursorOff();
      errorOff();
      offBindings();
    }
  });

  it('carries the speaker identifier through on a writing notice', () => {
    const targets = makeTargets();
    const offBindings = subscribeNetworkBindings(networkMessage$, targets);

    let received: WritingMessageEvent | undefined;
    const writingOff = targets.writingMessage$.subscribe((e) => (received = e));

    try {
      localDispatch(
        'WRITING_A_MESSAGE_DETAIL',
        { tabIdentifier: 'tab-1', speakerIdentifier: 'speaker-1' },
        'remote-peer'
      );

      expect(received).toEqual({
        tabIdentifier: 'tab-1',
        sendFrom: 'remote-peer',
        isSendFromSelf: false,
        speakerIdentifier: 'speaker-1',
      });
    } finally {
      writingOff();
      offBindings();
    }
  });

  it('turns a heartbeat into its own event', () => {
    const targets = makeTargets();
    const offBindings = subscribeNetworkBindings(networkMessage$, targets);

    let received: HeartBeatEvent | undefined;
    const offHeart = targets.heartBeat$.subscribe((e) => (received = e));

    try {
      const now = Date.now();
      localDispatch('HEART_BEAT', [now, 'target-peer', 42, 5], 'sender-peer');

      expect(received).toEqual({
        timestamp: now,
        id: 'target-peer',
        diffDown: 42,
        secdCounter: 5,
        sendFrom: 'sender-peer',
      });
    } finally {
      offHeart();
      offBindings();
    }
  });

  it('carries a heartbeat with no downstream figure through unchanged', () => {
    const targets = makeTargets();
    const offBindings = subscribeNetworkBindings(networkMessage$, targets);

    let received: HeartBeatEvent | undefined;
    const offHeart = targets.heartBeat$.subscribe((e) => (received = e));

    try {
      localDispatch('HEART_BEAT', [1000, 'peer-1', null, 0], 'peer-2');

      expect(received).toBeDefined();
      expect(received!.diffDown).toBeNull();
      expect(received!.sendFrom).toBe('peer-2');
    } finally {
      offHeart();
      offBindings();
    }
  });

  it('closes what shows an object the room server took away, as for one deleted', () => {
    const targets = makeTargets();
    const offBindings = subscribeNetworkBindings(networkMessage$, targets);
    const received: ObjectDeleteEvent[] = [];
    const offReceive = targets.objectDeleted$.subscribe((e) => received.push(e));

    localDispatch('WITHDRAW_GAME_OBJECT', { identifier: 'hidden-card' }, '@authority');

    expect(received).toEqual([{ identifier: 'hidden-card', aliasName: '', isSendFromSelf: false }]);
    offReceive();
    offBindings();
  });

  it('unsubscribes when the cleanup is called', () => {
    const targets = makeTargets();
    const offBindings = subscribeNetworkBindings(networkMessage$, targets);

    const received: ObjectDeleteEvent[] = [];
    const offReceive = targets.objectDeleted$.subscribe((e) => received.push(e));

    localDispatch('DELETE_GAME_OBJECT', { identifier: 'first', aliasName: 'char' }, 'peer');
    expect(received).toHaveLength(1);

    offBindings();

    localDispatch('DELETE_GAME_OBJECT', { identifier: 'second', aliasName: 'char' }, 'peer');
    expect(received).toHaveLength(1);

    offReceive();
  });
});
