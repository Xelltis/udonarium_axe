import { decode, encode } from '@axe/core/util/message-pack';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  GM_ONLY_VISIBILITY,
  PLAYERS_VISIBILITY,
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  type ReplayActorSnapshot,
  type ReplayChunkMeta,
  ReplayDetailLevel,
  type ReplayEvent,
  type ReplayEventKind,
  type ReplayKeyframeMeta,
  type ReplayManifest,
  type ReplayPatch,
  type ReplaySignal,
  type ReplayTargetSnapshot,
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
 * Packs a chunk of events into MessagePack, stamped with a format version: the current one, or the
 * one of the recording they belong to when it goes out as it was written.
 *
 * Optional fields an event does not have are left out.
 */
export function encodeReplayEvents(events: readonly ReplayEvent[], version = REPLAY_FORMAT_VERSION): Uint8Array {
  const envelope: ChunkEnvelope = { v: version, events: events.map(toWire) };
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
  const manifest: ReplayManifest = {
    formatVersion: asNumber(value['formatVersion']),
    roomName: asString(value['roomName']),
    startedAt: asNumber(value['startedAt']),
    endedAt: typeof value['endedAt'] === 'number' ? value['endedAt'] : null,
    recordedBy: asActor(value['recordedBy']),
    detailLevel: asDetailLevel(value['detailLevel']),
    actors: asArray<unknown>(value['actors']).map(asActor),
    targets: asArray<unknown>(value['targets']).map(asTarget),
    keyframes: asArray<unknown>(value['keyframes']).map(asKeyframe),
    chunks: asArray<unknown>(value['chunks']).map(asChunk),
  };
  const derivedFrom = value['derivedFrom'];
  if (isRecord(derivedFrom)) {
    manifest.derivedFrom = {
      roomName: asString(derivedFrom['roomName']),
      startedAt: asNumber(derivedFrom['startedAt']),
    };
  }
  return manifest;
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

const PEER_ROLES: readonly string[] = Object.values(PeerRole);

/** A role read from a file; anything unknown is a guest, who sees the least. */
function asRole(value: unknown): PeerRole {
  return typeof value === 'string' && PEER_ROLES.includes(value) ? (value as PeerRole) : PeerRole.Guest;
}

const DETAIL_LEVELS: readonly string[] = Object.values(ReplayDetailLevel);

/** A detail level read from a file; anything unknown counts as a full recording. */
function asDetailLevel(value: unknown): ReplayDetailLevel {
  return typeof value === 'string' && DETAIL_LEVELS.includes(value)
    ? (value as ReplayDetailLevel)
    : ReplayDetailLevel.Full;
}

function asActor(value: unknown): ReplayActorSnapshot {
  const held = isRecord(value) ? value : {};
  return {
    userId: asString(held['userId']),
    peerId: asString(held['peerId']),
    name: asString(held['name']),
    role: asRole(held['role']),
    imageIdentifier: asString(held['imageIdentifier']),
    sinceSeq: asNumber(held['sinceSeq']),
  };
}

function asTarget(value: unknown): ReplayTargetSnapshot {
  const held = isRecord(value) ? value : {};
  const target: ReplayTargetSnapshot = {
    identifier: asString(held['identifier']),
    aliasName: asString(held['aliasName']),
    name: asString(held['name']),
    sinceSeq: asNumber(held['sinceSeq']),
  };
  if (typeof held['ownerIdentifier'] === 'string') target.ownerIdentifier = held['ownerIdentifier'];
  return target;
}

function asKeyframe(value: unknown): ReplayKeyframeMeta {
  const held = isRecord(value) ? value : {};
  return { seq: asNumber(held['seq']), at: asNumber(held['at']), byteSize: asNumber(held['byteSize']) };
}

function asChunk(value: unknown): ReplayChunkMeta {
  const held = isRecord(value) ? value : {};
  return {
    index: asNumber(held['index']),
    seqStart: asNumber(held['seqStart']),
    seqEnd: asNumber(held['seqEnd']),
    eventCount: asNumber(held['eventCount']),
    byteSize: asNumber(held['byteSize']),
  };
}

function asSignal(value: unknown): ReplaySignal | null {
  if (!isRecord(value)) return null;
  return { name: asString(value['name']), data: value['data'] };
}

function asVisibility(value: unknown): ReplayVisibility {
  if (!isRecord(value)) return PUBLIC_VISIBILITY;
  if (value['kind'] === 'gm-only') return GM_ONLY_VISIBILITY;
  if (value['kind'] === 'players') return PLAYERS_VISIBILITY;
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
    seq: wire['seq'],
    at: asNumber(wire['at']),
    t: asNumber(wire['t']),
    kind: wire['kind'] as ReplayEventKind,
    actorId: asString(wire['actorId']),
    detail: isRecord(wire['detail']) ? wire['detail'] : {},
    visibility: asVisibility(wire['visibility']),
  };
  if (typeof wire['targetId'] === 'string') event.targetId = wire['targetId'];
  if (isPatch(wire['patch'])) event.patch = wire['patch'];
  const parts = asArray<unknown>(wire['parts']).filter(isPatch);
  if (parts.length > 0) event.parts = parts;
  const removedParts = asArray<unknown>(wire['removedParts']).filter(
    (identifier): identifier is string => typeof identifier === 'string' && identifier.length > 0
  );
  if (removedParts.length > 0) event.removedParts = removedParts;
  const signal = asSignal(wire['signal']);
  if (signal) event.signal = signal;
  if (typeof wire['merged'] === 'number') event.merged = wire['merged'];
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
