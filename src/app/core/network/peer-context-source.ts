import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';

export interface PeerContextProvider {
  readonly peerContext: IPeerContext;
  readonly peerContexts: IPeerContext[];
  readonly peerIds: string[];
  readonly peerId: string;
}

const defaultProvider: PeerContextProvider = {
  get peerContext() {
    return Network.peerContext;
  },
  get peerContexts() {
    return Network.peerContexts;
  },
  get peerIds() {
    return Network.peerIds;
  },
  get peerId() {
    return Network.peerId;
  },
};

let currentProvider: PeerContextProvider = defaultProvider;

/** Replaces where the peer getters here read from, so they can report a fixed peer with no network. */
export function setPeerContextProvider(provider: PeerContextProvider): void {
  currentProvider = provider;
}

/** Points the peer getters here back at the live Network. */
export function resetPeerContextProvider(): void {
  currentProvider = defaultProvider;
}

/** This device's peer context, from the current provider (the live Network by default). */
export function getPeerContext(): IPeerContext {
  return currentProvider.peerContext;
}

/** Contexts of the peers connected or still connecting, from the current provider. */
export function getPeerContexts(): IPeerContext[] {
  return currentProvider.peerContexts;
}

/** Ids of the peers with an open connection, from the current provider. */
export function getPeerIds(): string[] {
  return currentProvider.peerIds;
}

/** This device's peer id, from the current provider. */
export function getMyPeerId(): string {
  return currentProvider.peerId;
}

/** The room server's peer id while connected through one; null with SkyWay or outside a room. */
export function getAuthorityPeerId(): string | null {
  return Network.authorityPeerId;
}

/** Whether the link to the room server is up; false with SkyWay, outside a room, or while it is down. */
export function isAuthorityOpen(): boolean {
  return Network.isAuthorityOpen;
}

/** The key of the room server's room this device is in or getting into; null with SkyWay or outside one. */
export function getRoomKey(): string | null {
  return Network.roomKey;
}
