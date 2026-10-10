import { EventChannel } from '@axe/core/event/event-channel';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';

export interface EventContext<T = unknown> {
  sendFrom: string;
  eventName: string;
  data: T;
}

export interface NetworkMessage<T = unknown> {
  eventName: string;
  data: T;
  sendFrom: string;
  isSendFromSelf: boolean;
}

export const networkMessage$ = new EventChannel<NetworkMessage>();

/**
 * Sends an event to one peer, or to the whole room when sendTo is omitted, with the next send.
 *
 * A broadcast also reaches this device's own networkMessage$. While the network is isolated the
 * event is dispatched locally only, and one addressed to another peer is dropped.
 */
export function networkSend(eventName: string, data: unknown, sendTo?: string): void {
  if (isNetworkIsolated()) {
    if (sendTo == null || sendTo === Network.peerId) localDispatch(eventName, data);
    return;
  }
  const context: EventContext = {
    eventName,
    data,
    sendFrom: Network.peerId,
  };
  Network.instance.send(context, sendTo);
}

/**
 * Broadcasts like networkSend, but only the latest message under the key goes out.
 *
 * A message under the same key that is still waiting in the queue is replaced; one that has
 * already been taken for sending is left alone, and this one follows it.
 */
export function networkSendLatest(eventName: string, data: unknown, key: string): void {
  if (isNetworkIsolated()) {
    localDispatch(eventName, data);
    return;
  }
  const context: EventContext = {
    eventName,
    data,
    sendFrom: Network.peerId,
  };
  Network.instance.send(context, undefined, key);
}

/**
 * Delivers an event on networkMessage$ on this device only, at once, and schedules a render tick.
 *
 * sendFrom defaults to this device, so listeners see the event as sent from self.
 */
export function localDispatch(eventName: string, data: unknown, sendFrom?: string): void {
  const from = sendFrom ?? Network.peerId;
  networkMessage$.emit({
    eventName,
    data,
    sendFrom: from,
    isSendFromSelf: from === Network.peerId,
  });
  scheduleAngularTick();
}

let _tickScheduled = false;
let _tick: (() => void) | null = null;

/** Sets the callback run once per microtask after messages arrive, so the zoneless app re-renders. */
export function setNetworkTick(tick: (() => void) | null): void {
  _tick = tick;
}

function scheduleAngularTick(): void {
  if (_tickScheduled || !_tick) return;
  _tickScheduled = true;
  queueMicrotask(() => {
    _tickScheduled = false;
    _tick?.();
  });
}

let _initialized = false;

/**
 * Wires the network's connection callbacks to networkMessage$.
 *
 * Open, close, peer and error callbacks become local events such as CONNECT_PEER, and received
 * data becomes messages from its sender. Only the first call does anything.
 */
export function initializeNetworkMessaging(): void {
  if (_initialized) return;
  _initialized = true;

  const callback = Network.instance.callback;

  callback.onOpen = (peer) => {
    localDispatch('OPEN_NETWORK', { peerId: peer.peerId });
  };

  callback.onClose = (peer) => {
    localDispatch('CLOSE_NETWORK', { peerId: peer.peerId });
  };

  callback.onConnect = (peer) => {
    Logger.debug('[NetworkMessaging]', `<${peer.peerId}> connect <DataConnection>`);
    localDispatch('CONNECT_PEER', { peerId: peer.peerId });
  };

  callback.onDisconnect = (peer) => {
    Logger.debug('[NetworkMessaging]', `<${peer.peerId}> disconnect <DataConnection>`);
    localDispatch('DISCONNECT_PEER', { peerId: peer.peerId });
  };

  callback.onReconnect = (peer, state) => {
    Logger.debug('[NetworkMessaging]', `<${peer.peerId}> reconnect <${state}>`);
    localDispatch('PEER_RECONNECT', { peerId: peer.peerId, state });
  };

  callback.onData = (_peer, data) => {
    for (const ctx of data as EventContext[]) {
      networkMessage$.emit({
        eventName: ctx.eventName,
        data: ctx.data,
        sendFrom: ctx.sendFrom,
        isSendFromSelf: ctx.sendFrom === Network.peerId,
      });
    }
    scheduleAngularTick();
  };

  callback.onError = (peer, errorType, errorMessage, errorObject) => {
    Logger.debug('[NetworkMessaging]', `<${peer.peerId}> ${errorMessage}`);
    localDispatch('NETWORK_ERROR', {
      peerId: peer.peerId,
      errorType,
      errorMessage,
      errorObject,
    });
  };
}
