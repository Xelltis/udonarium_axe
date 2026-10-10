import { decode, encode } from '@axe/core/util/message-pack';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  type ReplayEvent,
  type ReplayManifest,
  type ReplayPatch,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';

interface ChunkEnvelope {
  v: number;
  events: unknown[];
}

interface ManifestEnvelope {
  v: number;
  manifest: unknown;
}

/** Whether a recording written in this format version can be read: any version from 1 up to the current one. */
export function isSupportedReplayFormat(version: unknown): boolean {
  return typeof version === 'number' && version >= 1 && version <= REPLAY_FORMAT_VERSION;
}

/**
 * Packs a chunk of events into MessagePack, stamped with the current format version.
 *
 * Optional fields an event does not have are left out.
 */
export function encodeReplayEvents(events: readonly ReplayEvent[]): Uint8Array {
  const envelope: ChunkEnvelope = { v: REPLAY_FORMAT_VERSION, events: events.map(toWire) };
  return encode(envelope);
}

/**
 * Unpacks a chunk of events written by `encodeReplayEvents`.
 *
 * Empty when the chunk is unreadable or of an unsupported version. Events without a sequence
 * number or kind are dropped, and missing fields are filled with defaults. Folded parts that are
 * not changes to an object, or removed parts that are not identifiers, are dropped.
 */
export function decodeReplayEvents(bytes: Uint8Array): ReplayEvent[] {
  const envelope = decode(bytes) as ChunkEnvelope | null;
  if (!envelope || !isSupportedReplayFormat(envelope.v) || !Array.isArray(envelope.events)) return [];
  return envelope.events.map(fromWire).filter((event): event is ReplayEvent => event !== null);
}

/** Packs a recording's manifest into MessagePack, stamped with the current format version. */
export function encodeReplayManifest(manifest: ReplayManifest): Uint8Array {
  const envelope: ManifestEnvelope = { v: REPLAY_FORMAT_VERSION, manifest };
  return encode(envelope);
}

/** Unpacks a manifest written by `encodeReplayManifest`. Null when it is unreadable or of an unsupported version. */
export function decodeReplayManifest(bytes: Uint8Array): ReplayManifest | null {
  const envelope = decode(bytes) as ManifestEnvelope | null;
  if (!envelope || !isSupportedReplayFormat(envelope.v)) return null;
  return toManifest(envelope.manifest);
}

/**
 * Checks a parsed manifest and fills in what it lacks.
 *
 * Null unless it is an object with a supported format version. Missing lists become empty, a
 * missing room name empty, a missing start 0, and an end that is not a number null.
 */
export function toManifest(value: unknown): ReplayManifest | null {
  if (!isRecord(value) || !isSupportedReplayFormat(value['formatVersion'])) return null;
  return {
    ...(value as unknown as ReplayManifest),
    roomName: asString(value['roomName']),
    startedAt: asNumber(value['startedAt']),
    endedAt: typeof value['endedAt'] === 'number' ? value['endedAt'] : null,
    actors: asArray(value['actors']),
    targets: asArray(value['targets']),
    keyframes: asArray(value['keyframes']),
    chunks: asArray(value['chunks']),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asVisibility(value: unknown): ReplayVisibility {
  if (!isRecord(value)) return PUBLIC_VISIBILITY;
  if (value['kind'] === 'gm-only') return GM_ONLY_VISIBILITY;
  if (value['kind'] === 'direct') return { kind: 'direct', to: asArray<string>(value['to']) };
  return PUBLIC_VISIBILITY;
}

function toWire(event: ReplayEvent): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    seq: event.seq,
    at: event.at,
    t: event.t,
    kind: event.kind,
    actorId: event.actorId,
    detail: event.detail,
    visibility: event.visibility,
  };
  if (event.targetId != null) wire['targetId'] = event.targetId;
  if (event.patch != null) wire['patch'] = event.patch;
  if (event.parts != null && event.parts.length > 0) wire['parts'] = event.parts;
  if (event.removedParts != null && event.removedParts.length > 0) wire['removedParts'] = event.removedParts;
  if (event.signal != null) wire['signal'] = event.signal;
  if (event.merged != null) wire['merged'] = event.merged;
  return wire;
}

function fromWire(wire: unknown): ReplayEvent | null {
  if (!isRecord(wire)) return null;
  if (typeof wire['seq'] !== 'number' || typeof wire['kind'] !== 'string') return null;

  const event: ReplayEvent = {
    ...(wire as unknown as ReplayEvent),
    seq: wire['seq'],
    at: asNumber(wire['at']),
    t: asNumber(wire['t']),
    kind: wire['kind'] as ReplayEvent['kind'],
    actorId: asString(wire['actorId']),
    detail: isRecord(wire['detail']) ? wire['detail'] : {},
    visibility: asVisibility(wire['visibility']),
  };
  if (!isRecord(wire['patch'])) delete event.patch;
  const parts = asArray<unknown>(wire['parts']).filter(isPatch);
  if (parts.length > 0) event.parts = parts;
  else delete event.parts;
  const removedParts = asArray<unknown>(wire['removedParts']).filter(
    (identifier): identifier is string => typeof identifier === 'string' && identifier.length > 0
  );
  if (removedParts.length > 0) event.removedParts = removedParts;
  else delete event.removedParts;
  if (!isRecord(wire['signal'])) delete event.signal;
  return event;
}

/** Whether a value read from a file has the shape of a change to an object, which the board is built from. */
function isPatch(value: unknown): value is ReplayPatch {
  return (
    isRecord(value) &&
    typeof value['identifier'] === 'string' &&
    value['identifier'].length > 0 &&
    isRecord(value['before']) &&
    isRecord(value['after'])
  );
}
