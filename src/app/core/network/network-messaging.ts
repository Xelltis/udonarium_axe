import { EventChannel } from '@axe/core/event/event-channel';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { AUTHORITY_ONLY_EVENTS } from '@axe/core/network/server/server-protocol';

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

/**
 * The events this device tells only itself, which no peer may send it. A peer's OPEN_NETWORK or
 * PEER_RECONNECT would pass for this device's own network; its UPDATE_FILE_RESOURE or
 * UPDATE_AUDIO_RESOURE would hand in bytes under a picture's or sound's name that no transfer
 * brought; its VN_MODE would turn this screen to novel mode.
 */
export const LOCAL_ONLY_EVENTS: ReadonlySet<string> = new Set([
  'OPEN_NETWORK',
  'CLOSE_NETWORK',
  'CONNECT_PEER',
  'DISCONNECT_PEER',
  'PEER_RECONNECT',
  'NETWORK_ERROR',
  'SERVER_ROLE_CHANGED',
  'UPDATE_FILE_RESOURE',
  'UPDATE_AUDIO_RESOURE',
  'LOCAL_OBJECT_UPDATED',
  'VN_MODE',
]);

/**
 * Delivers events received from the network on networkMessage$, each as a message from its sender.
 *
 * An event only the room server may send, whose word outranks any version, is dropped unless the
 * room server itself sent it: another seat, or any seat with SkyWay, could send one by that name.
 * An event this device only tells itself is dropped from anybody.
 */
export function receiveEvents(events: EventContext[]): void {
  for (const ctx of events) {
    if (LOCAL_ONLY_EVENTS.has(ctx.eventName)) {
      Logger.warn(
        '[NetworkMessaging]',
        `${ctx.eventName} from <${ctx.sendFrom}>, which only this device sends, dropped`
      );
      continue;
    }
    if (AUTHORITY_ONLY_EVENTS.includes(ctx.eventName) && !isFromAuthority(ctx.sendFrom)) {
      Logger.warn('[NetworkMessaging]', `${ctx.eventName} from <${ctx.sendFrom}>, not the room server, dropped`);
      continue;
    }
    networkMessage$.emit({
      eventName: ctx.eventName,
      data: ctx.data,
      sendFrom: ctx.sendFrom,
      isSendFromSelf: ctx.sendFrom === Network.peerId,
    });
  }
  scheduleAngularTick();
}

function isFromAuthority(sendFrom: string): boolean {
  const authority = Network.authorityPeerId;
  return authority != null && sendFrom === authority;
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

  callback.onRoleChange = (role) => {
    localDispatch('SERVER_ROLE_CHANGED', { role });
  };

  callback.onIdle = (state) => {
    localDispatch('SEAT_IDLE', { state });
  };

  callback.onReconnect = (peer, state) => {
    Logger.debug('[NetworkMessaging]', `<${peer.peerId}> reconnect <${state}>`);
    localDispatch('PEER_RECONNECT', { peerId: peer.peerId, state });
  };

  callback.onData = (_peer, data) => receiveEvents(data as EventContext[]);

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
