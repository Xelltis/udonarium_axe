import { PeerRole } from '@axe/domain/peer/peer-role';

export const REPLAY_FORMAT_VERSION = 3;

export const ReplayEventKind = {
  ChatMessage: 'chat.message',
  ChatDice: 'chat.dice',
  ObjectCreate: 'object.create',
  ObjectRemove: 'object.remove',
  ObjectMove: 'object.move',
  ObjectRotate: 'object.rotate',
  ObjectFace: 'object.face',
  ObjectDiceRoll: 'object.dice-roll',
  ObjectShuffle: 'object.shuffle',
  ObjectValue: 'object.value',
  ObjectImage: 'object.image',
  ObjectOwner: 'object.owner',
  ObjectLock: 'object.lock',
  ObjectUpdate: 'object.update',
  TableChange: 'table.change',
  TableScene: 'table.scene',
  TurnChange: 'turn.change',
  VoteStart: 'vote.start',
  VoteFinish: 'vote.finish',
  MediaSoundEffect: 'media.se',
  MediaBgm: 'media.bgm',
  MediaCutIn: 'media.cutin',
  EffectCast: 'effect.cast',
  VnScene: 'vn.scene',
  VnPlayhead: 'vn.playhead',
  VnDirect: 'vn.direct',
  VnMode: 'vn.mode',
  PeerJoin: 'peer.join',
  PeerLeave: 'peer.leave',
  PeerRoleChange: 'peer.role',
  Marker: 'marker',
} as const;

export type ReplayEventKind = (typeof ReplayEventKind)[keyof typeof ReplayEventKind];

export const ReplayDetailLevel = {
  ChatOnly: 'chat-only',
  Notable: 'notable',
  Full: 'full',
} as const;

export type ReplayDetailLevel = (typeof ReplayDetailLevel)[keyof typeof ReplayDetailLevel];

export type ReplayVisibility = { kind: 'public' } | { kind: 'gm-only' } | { kind: 'direct'; to: readonly string[] };

export const PUBLIC_VISIBILITY: ReplayVisibility = { kind: 'public' };
export const GM_ONLY_VISIBILITY: ReplayVisibility = { kind: 'gm-only' };

export interface ReplayActorSnapshot {
  userId: string;
  peerId: string;
  name: string;
  role: PeerRole;
  imageIdentifier: string;
  sinceSeq: number;
}

export interface ReplayTargetSnapshot {
  identifier: string;
  aliasName: string;
  name: string;
  ownerIdentifier?: string;
  sinceSeq: number;
}

export interface ReplayPatch {
  identifier: string;
  aliasName: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface ReplaySignal {
  name: string;
  data: unknown;
}

export interface ReplayEvent {
  seq: number;
  at: number;
  t: number;
  kind: ReplayEventKind;
  actorId: string;
  targetId?: string;
  detail: Readonly<Record<string, unknown>>;
  patch?: ReplayPatch;
  /**
   * On the arrival of a piece, the parts that arrived with it, such as its HP and other data, each
   * made by its own patch. Recordings before format 3 told each part as an event of its own.
   */
  parts?: readonly ReplayPatch[];
  /** On the removal of a piece, the parts taken away with it. */
  removedParts?: readonly string[];
  signal?: ReplaySignal;
  visibility: ReplayVisibility;
  merged?: number;
}

export interface ReplayKeyframeMeta {
  seq: number;
  at: number;
  byteSize: number;
}

export interface ReplayChunkMeta {
  index: number;
  seqStart: number;
  seqEnd: number;
  eventCount: number;
  byteSize: number;
}

export interface ReplayManifest {
  formatVersion: number;
  roomName: string;
  startedAt: number;
  endedAt: number | null;
  recordedBy: ReplayActorSnapshot;
  detailLevel: ReplayDetailLevel;
  derivedFrom?: { roomName: string; startedAt: number };
  actors: readonly ReplayActorSnapshot[];
  targets: readonly ReplayTargetSnapshot[];
  keyframes: readonly ReplayKeyframeMeta[];
  chunks: readonly ReplayChunkMeta[];
}

export interface ReplayViewer {
  userId: string;
  role: PeerRole;
}

/** The kinds that only sound alongside a move or a roll and are no event themselves. The sound is kept and no row is shown. */
const INCIDENTAL_KINDS: ReadonlySet<ReplayEventKind> = new Set([ReplayEventKind.MediaSoundEffect]);

/** Whether events of this kind are only a sound accompanying another event, played back but given no row. */
export function isIncidentalReplayEvent(kind: ReplayEventKind): boolean {
  return INCIDENTAL_KINDS.has(kind);
}

/**
 * Whether a viewer may see an event in the recording.
 *
 * Public events are for everyone and the game master sees everything. An event for the game
 * master is hidden from the rest, and one sent directly is seen by its recipients and its sender.
 */
export function canViewReplayEvent(event: ReplayEvent, viewer: ReplayViewer): boolean {
  const visibility = event.visibility;
  if (visibility.kind === 'public') return true;
  if (viewer.role === PeerRole.GameMaster) return true;
  if (visibility.kind === 'gm-only') return false;
  return visibility.to.includes(viewer.userId) || event.actorId === viewer.userId;
}

/**
 * The snapshot in force at a point in the recording: the one taken latest at or before it.
 *
 * Of two taken at the same point, the later in the list wins. Null when none had been taken yet.
 */
export function resolveSnapshotAt<T extends { sinceSeq: number }>(snapshots: readonly T[], seq: number): T | null {
  let resolved: T | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.sinceSeq > seq) continue;
    if (!resolved || snapshot.sinceSeq >= resolved.sinceSeq) resolved = snapshot;
  }
  return resolved ?? null;
}

/** How a user stood at a point in the recording: their name, role and picture then. Null before they appear. */
export function findActorAt(
  manifest: Pick<ReplayManifest, 'actors'>,
  userId: string,
  seq: number
): ReplayActorSnapshot | null {
  return resolveSnapshotAt(
    manifest.actors.filter((actor) => actor.userId === userId),
    seq
  );
}

/** How an object stood at a point in the recording, with the name and owner it had then. Null before it appears. */
export function findTargetAt(
  manifest: Pick<ReplayManifest, 'targets'>,
  identifier: string,
  seq: number
): ReplayTargetSnapshot | null {
  return resolveSnapshotAt(
    manifest.targets.filter((target) => target.identifier === identifier),
    seq
  );
}
