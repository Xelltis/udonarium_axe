import { LocalPerson, P2PConnection, RemoteMember, RemoteStream } from '@skyway-sdk/core';

/**
 * What the SkyWay SDK keeps to itself and the data streams need all the same: the connection it holds
 * toward a remote member, and the data channel under a remote stream, through which a channel is
 * seen to open and close. Each is read off the SDK's own member by name, and comes back undefined
 * where the SDK has none.
 */

/** The peer-to-peer connection the SDK holds, or makes, from this seat's person in the room to the member. */
export function p2pConnectionOf(
  member: RemoteMember | undefined,
  person: LocalPerson | null | undefined
): P2PConnection | undefined {
  const getOrCreate = (member as { _getOrCreateConnection?: (impl: unknown) => P2PConnection } | undefined)
    ?._getOrCreateConnection;
  if (typeof getOrCreate !== 'function') return undefined;
  return getOrCreate.call(member, (person as { _impl?: unknown } | null | undefined)?._impl);
}

/** The data channel a remote data stream reads from; undefined for no stream, or one of another kind. */
export function dataChannelOf(stream: RemoteStream | undefined): RTCDataChannel | undefined {
  return (stream as { _datachannel?: RTCDataChannel } | undefined)?._datachannel;
}
