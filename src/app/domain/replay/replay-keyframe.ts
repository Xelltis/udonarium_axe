import { decode, encode } from '@axe/core/util/message-pack';
import { isSupportedReplayFormat } from '@axe/domain/replay/replay-codec';
import { REPLAY_FORMAT_VERSION } from '@axe/domain/replay/replay-event';

export interface ReplayObjectSnapshot {
  identifier: string;
  aliasName: string;
  syncData: Record<string, unknown>;
}

interface KeyframeEnvelope {
  v: number;
  objects: unknown[];
}

/** Packs a snapshot of every object in the room into MessagePack, stamped with the current format version. */
export function encodeReplayKeyframe(objects: readonly ReplayObjectSnapshot[]): Uint8Array {
  const envelope: KeyframeEnvelope = { v: REPLAY_FORMAT_VERSION, objects: objects as unknown[] };
  return encode(envelope);
}

/**
 * Unpacks a snapshot written by `encodeReplayKeyframe`.
 *
 * Empty when it is unreadable or of an unsupported version. Entries without an identifier and
 * alias are dropped.
 */
export function decodeReplayKeyframe(bytes: Uint8Array): ReplayObjectSnapshot[] {
  const envelope = decode(bytes) as KeyframeEnvelope | null;
  if (!envelope || !isSupportedReplayFormat(envelope.v) || !Array.isArray(envelope.objects)) return [];
  return envelope.objects.filter(isSnapshot);
}

function isSnapshot(value: unknown): value is ReplayObjectSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['identifier'] === 'string' && typeof record['aliasName'] === 'string';
}
