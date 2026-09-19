import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { buildReplayArchiveFiles } from '@axe/domain/replay/replay-archive';
import { mergeReplayEvents } from '@axe/domain/replay/replay-coalescer';
import { encodeReplayEvents } from '@axe/domain/replay/replay-codec';
import type { SyncData } from '@axe/domain/replay/replay-diff';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayActorSnapshot,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
  type ReplayTargetSnapshot,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import { interpretObjectChange, type ReplayDraft } from '@axe/domain/replay/replay-interpreter';
import { encodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

/**
 * The format the long recording is written in: the one before parts were folded into their piece,
 * so the old way of telling them is what gets measured and read.
 */
export const LONG_REPLAY_FORMAT_VERSION = 2;

/** How big a made-up session is, and how it is spread over its hours. */
export interface LongReplayFixtureOptions {
  hours: number;
  /** Pieces on the table from the start; as many again are brought out during play. */
  characters: number;
  chatLines: number;
  moves: number;
  valueChanges: number;
  keyframeMinutes: number;
  /** Pieces kept to the game master, counted among `characters`. */
  hiddenCharacters: number;
  seed: number;
}

/** An evening's session: the size the edit screen has to hold without trouble. */
export const SIX_HOUR_SESSION: LongReplayFixtureOptions = {
  hours: 6,
  characters: 24,
  chatLines: 2_000,
  moves: 30_000,
  valueChanges: 4_000,
  keyframeMinutes: 10,
  hiddenCharacters: 4,
  seed: 1,
};

/** A few minutes of the same, small enough for a spec. */
export const SHORT_SESSION: LongReplayFixtureOptions = {
  hours: 0.25,
  characters: 3,
  chatLines: 40,
  moves: 120,
  valueChanges: 30,
  keyframeMinutes: 5,
  hiddenCharacters: 1,
  seed: 7,
};

export interface LongReplayFixture {
  manifest: ReplayManifest;
  events: ReplayEvent[];
  keyframes: { seq: number; at: number; objects: ReplayObjectSnapshot[] }[];
}

const STARTED_AT = Date.UTC(2026, 0, 10, 10, 0, 0);
const CHUNK_SIZE = 500;
const GRID = 50;
const DICEBOT_SENDER = 'System-BCDice';
const TAB_ID = 'MainTab';
const SYSTEM_NOTICES = [
  '@i18n:common.chat.logClearedBy:{"user":"GM"}',
  '@i18n:feature.visualNovel.stageResetBy:{"user":"GM"}',
];
const LINES = [
  '扉の向こうから物音がする。',
  'まずは周囲を調べてみましょう。',
  '了解、私が先に行きます！',
  'この先は罠がありそうだ。慎重に進もう。',
  'HP が心もとないので回復したいです',
  'よし、ここで一気に畳みかけるぞ！',
];

/**
 * Builds a long recording in the shape the recorder writes, without a table.
 *
 * Changes go through the same interpreter the recorder uses, so the events carry the details and
 * patches a real session would. Drags are merged the way the recorder merges them, boards hold
 * every object including the chat so far, and new pieces arrive one event per sync object, all as
 * format version 2 wrote them. The same options always give the same recording.
 */
export function buildLongReplayFixture(options: LongReplayFixtureOptions): LongReplayFixture {
  const random = seededRandom(options.seed);
  const template = captureCharacterTemplate();
  const actors = fixtureActors();
  const room = new Map<string, ReplayObjectSnapshot>();
  const targets: ReplayTargetSnapshot[] = [];
  const hidden = new Set<string>();
  const events: ReplayEvent[] = [];
  const keyframes: LongReplayFixture['keyframes'] = [];
  let seq = 0;

  const addTarget = (snapshot: ReplayObjectSnapshot, name: string, owner?: string): void => {
    targets.push({
      identifier: snapshot.identifier,
      aliasName: snapshot.aliasName,
      name,
      ...(owner ? { ownerIdentifier: owner } : {}),
      sinceSeq: seq,
    });
  };

  const pieces: ReplayObjectSnapshot[] = [];
  const numbersOf = new Map<string, ReplayObjectSnapshot[]>();

  const spawn = (index: number): ReplayObjectSnapshot[] => {
    const made = cloneCharacter(template, index, random);
    const root = made[0];
    for (const snapshot of made) {
      room.set(snapshot.identifier, snapshot);
      const owner = snapshot === root ? undefined : root.identifier;
      addTarget(snapshot, String(attributesOf(snapshot.syncData)['name'] ?? ''), owner);
    }
    pieces.push(root);
    numbersOf.set(
      root.identifier,
      made.filter((snapshot) => snapshot.aliasName === 'data' && isNumeric(snapshot.syncData['value']))
    );
    if (index < options.hiddenCharacters) {
      hidden.add(root.identifier);
      attributesOf(root.syncData)['disclosureMode'] = 'gm';
    }
    return made;
  };

  for (let index = 0; index < options.characters; index++) spawn(index);

  const visibilityOf = (targetId: string | undefined): ReplayVisibility =>
    targetId && hidden.has(targetId) ? GM_ONLY_VISIBILITY : PUBLIC_VISIBILITY;

  const stamp = (draft: ReplayDraft, t: number, actorId: string): ReplayEvent => ({
    seq: ++seq,
    at: STARTED_AT + t,
    t,
    kind: draft.kind,
    actorId,
    targetId: draft.targetIdentifier,
    detail: draft.detail,
    patch: draft.patch,
    signal: draft.signal,
    visibility: visibilityOf(draft.targetIdentifier),
  });

  const change = (snapshot: ReplayObjectSnapshot, after: SyncData): ReplayDraft | null => {
    const draft = interpretObjectChange({
      aliasName: snapshot.aliasName,
      identifier: snapshot.identifier,
      before: snapshot.syncData,
      after,
    });
    snapshot.syncData = after;
    return draft;
  };

  const durationMs = options.hours * 60 * 60 * 1000;
  const plan = planActions(options, random, durationMs);
  let nextKeyframeAt = 0;
  let chatIndex = 0;
  let spawned = options.characters;

  const takeKeyframe = (t: number): void => {
    keyframes.push({ seq, at: STARTED_AT + t, objects: [...room.values()].map(cloneSnapshot) });
  };

  for (const action of plan) {
    while (action.t >= nextKeyframeAt) {
      takeKeyframe(nextKeyframeAt);
      nextKeyframeAt += options.keyframeMinutes * 60 * 1000;
      if (nextKeyframeAt > durationMs) nextKeyframeAt = Number.POSITIVE_INFINITY;
    }
    const actor = actors[Math.floor(random() * actors.length)].userId;

    switch (action.kind) {
      case 'move': {
        const piece = pieces[Math.floor(random() * pieces.length)];
        let merged: ReplayEvent | null = null;
        const steps = 2 + Math.floor(random() * 6);
        for (let step = 0; step < steps; step++) {
          const draft = change(piece, moved(piece.syncData, random));
          if (!draft) continue;
          const event = stamp(draft, action.t + step * 80, actor);
          if (merged) {
            seq--;
            merged = mergeReplayEvents(merged, { ...event, seq: merged.seq });
          } else {
            merged = event;
          }
        }
        if (merged) events.push(merged);
        break;
      }
      case 'value': {
        const piece = pieces[Math.floor(random() * pieces.length)];
        const values = numbersOf.get(piece.identifier) ?? [];
        if (values.length < 1) break;
        const element = values[Math.floor(random() * values.length)];
        const draft = change(element, revalued(element.syncData, random));
        if (draft) events.push(stamp(draft, action.t, actor));
        break;
      }
      case 'chat': {
        const index = chatIndex++;
        const snapshot: ReplayObjectSnapshot = {
          identifier: `chat-${index}`,
          aliasName: 'chat',
          syncData: chatSyncData(index, actor, random, action.t),
        };
        room.set(snapshot.identifier, snapshot);
        const draft = interpretObjectChange({
          aliasName: 'chat',
          identifier: snapshot.identifier,
          before: null,
          after: snapshot.syncData,
        });
        if (draft) events.push(stamp(draft, action.t, actor));
        break;
      }
      case 'spawn': {
        for (const snapshot of spawn(spawned++)) {
          const draft = interpretObjectChange({
            aliasName: snapshot.aliasName,
            identifier: snapshot.identifier,
            before: null,
            after: snapshot.syncData,
          });
          if (draft) events.push(stamp(draft, action.t, actor));
        }
        break;
      }
      case 'marker': {
        const label = `第${events.filter((event) => event.kind === ReplayEventKind.Marker).length + 1}幕`;
        events.push(stamp({ kind: ReplayEventKind.Marker, detail: { label } }, action.t, actor));
        break;
      }
    }
  }
  takeKeyframe(durationMs);

  return {
    manifest: {
      formatVersion: LONG_REPLAY_FORMAT_VERSION,
      roomName: 'fixture',
      startedAt: STARTED_AT,
      endedAt: STARTED_AT + durationMs,
      recordedBy: actors[0],
      detailLevel: ReplayDetailLevel.Notable,
      actors,
      targets,
      keyframes: keyframes.map((keyframe) => ({
        seq: keyframe.seq,
        at: keyframe.at,
        byteSize: encodeReplayKeyframe(keyframe.objects).byteLength,
      })),
      chunks: chunksOf(events).map((chunk) => ({
        index: chunk.index,
        seqStart: chunk.events[0].seq,
        seqEnd: chunk.events[chunk.events.length - 1].seq,
        eventCount: chunk.events.length,
        byteSize: encodeReplayEvents(chunk.events).byteLength,
      })),
    },
    events,
    keyframes,
  };
}

/** The files of an `.axe-replay.zip` holding the recording, with no pictures or sounds. */
export function longReplayArchiveFiles(fixture: LongReplayFixture): File[] {
  return buildReplayArchiveFiles({
    manifest: fixture.manifest,
    chunks: chunksOf(fixture.events),
    keyframes: fixture.keyframes.map((keyframe) => ({
      seq: keyframe.seq,
      blob: new Blob([encodeReplayKeyframe(keyframe.objects) as BlobPart]),
    })),
    assets: [],
  });
}

interface PlannedAction {
  t: number;
  kind: 'move' | 'value' | 'chat' | 'spawn' | 'marker';
}

function planActions(options: LongReplayFixtureOptions, random: () => number, durationMs: number): PlannedAction[] {
  const actions: PlannedAction[] = [];
  const spread = (count: number, kind: PlannedAction['kind']): void => {
    for (let i = 0; i < count; i++) actions.push({ t: Math.floor(random() * durationMs), kind });
  };
  spread(options.moves, 'move');
  spread(options.valueChanges, 'value');
  spread(options.chatLines, 'chat');
  spread(options.characters, 'spawn');
  const markers = Math.max(1, Math.floor(options.hours * 2));
  for (let i = 0; i < markers; i++) actions.push({ t: Math.floor((durationMs / markers) * i) + 1, kind: 'marker' });
  return actions.sort((a, b) => a.t - b.t);
}

function captureCharacterTemplate(): ReplayObjectSnapshot[] {
  const character = GameCharacter.create('テンプレート', 1, '');
  const snapshots: ReplayObjectSnapshot[] = [];
  const walk = (node: { children: readonly unknown[] } & { toContext(): unknown }): void => {
    const context = node.toContext() as { identifier: string; aliasName: string; syncData: Record<string, unknown> };
    snapshots.push({ identifier: context.identifier, aliasName: context.aliasName, syncData: context.syncData });
    for (const child of node.children) walk(child as typeof node);
  };
  walk(character);
  for (const snapshot of snapshots) {
    const object = ObjectStore.instance.get(snapshot.identifier);
    if (object) ObjectStore.instance.remove(object);
  }
  return snapshots;
}

function cloneCharacter(
  template: readonly ReplayObjectSnapshot[],
  index: number,
  random: () => number
): ReplayObjectSnapshot[] {
  const rename = new Map(
    template.map((snapshot, i) => [snapshot.identifier, i === 0 ? `pc-${index}` : `pc-${index}-${i}`])
  );
  return template.map((snapshot, i) => {
    const syncData = structuredClone(snapshot.syncData);
    const parent = syncData['parentIdentifier'];
    if (typeof parent === 'string' && rename.has(parent)) syncData['parentIdentifier'] = rename.get(parent);
    const attributes = attributesOf(syncData);
    if (i === 0) {
      attributes['name'] = `キャラクター${index + 1}`;
      attributes['location'] = {
        name: 'table',
        x: GRID * Math.floor(random() * 20),
        y: GRID * Math.floor(random() * 20),
      };
    }
    return { identifier: rename.get(snapshot.identifier)!, aliasName: snapshot.aliasName, syncData };
  });
}

function moved(syncData: SyncData, random: () => number): SyncData {
  const next = structuredClone(syncData);
  const attributes = attributesOf(next);
  const location = (attributes['location'] ?? { name: 'table', x: 0, y: 0 }) as Record<string, unknown>;
  attributes['location'] = {
    ...location,
    x: Number(location['x'] ?? 0) + GRID * (Math.floor(random() * 3) - 1),
    y: Number(location['y'] ?? 0) + GRID * (Math.floor(random() * 3) - 1),
  };
  return next;
}

function revalued(syncData: SyncData, random: () => number): SyncData {
  const next: Record<string, unknown> = structuredClone(syncData);
  next['value'] = Number(next['value']) + Math.floor(random() * 11) - 5;
  return next;
}

function isNumeric(value: unknown): boolean {
  return (
    (typeof value === 'number' || (typeof value === 'string' && value.trim().length > 0)) &&
    Number.isFinite(Number(value))
  );
}

function chatSyncData(index: number, actorId: string, random: () => number, t: number): SyncData {
  const roll = random();
  const isDice = roll < 0.12;
  const isNotice = !isDice && roll < 0.14;
  const text = isDice
    ? `(2D6) ＞ ${2 + Math.floor(random() * 11)}`
    : isNotice
      ? SYSTEM_NOTICES[index % SYSTEM_NOTICES.length]
      : LINES[index % LINES.length];
  return {
    value: text,
    attributes: {
      from: isDice ? DICEBOT_SENDER : isNotice ? 'System' : actorId,
      name: isDice ? 'DiceBot' : isNotice ? 'System' : `プレイヤー${actorId.slice(-1)}`,
      to: '',
      tag: isNotice ? 'system' : '',
      dicebot: isDice ? 'DiceBot' : '',
      imageIdentifier: '',
      messColor: '#000000',
      timestamp: STARTED_AT + t,
    },
    parentIdentifier: TAB_ID,
    majorIndex: 0,
    minorIndex: index,
  };
}

function fixtureActors(): ReplayActorSnapshot[] {
  return [
    { userId: 'user-gm', peerId: 'peer-gm', name: 'GM', role: 'gm', imageIdentifier: '', sinceSeq: 0 },
    { userId: 'user-1', peerId: 'peer-1', name: 'プレイヤー1', role: 'pl', imageIdentifier: '', sinceSeq: 0 },
    { userId: 'user-2', peerId: 'peer-2', name: 'プレイヤー2', role: 'pl', imageIdentifier: '', sinceSeq: 0 },
    { userId: 'user-3', peerId: 'peer-3', name: 'プレイヤー3', role: 'pl', imageIdentifier: '', sinceSeq: 0 },
  ];
}

function chunksOf(events: readonly ReplayEvent[]): { index: number; events: ReplayEvent[] }[] {
  const chunks: { index: number; events: ReplayEvent[] }[] = [];
  for (let start = 0; start < events.length; start += CHUNK_SIZE) {
    chunks.push({ index: chunks.length, events: events.slice(start, start + CHUNK_SIZE) });
  }
  return chunks;
}

function attributesOf(syncData: SyncData): Record<string, unknown> {
  const attributes = syncData['attributes'];
  if (typeof attributes === 'object' && attributes !== null) return attributes as Record<string, unknown>;
  const created: Record<string, unknown> = {};
  (syncData as Record<string, unknown>)['attributes'] = created;
  return created;
}

function cloneSnapshot(snapshot: ReplayObjectSnapshot): ReplayObjectSnapshot {
  return {
    identifier: snapshot.identifier,
    aliasName: snapshot.aliasName,
    syncData: structuredClone(snapshot.syncData),
  };
}

/** A small deterministic generator (mulberry32), so the same seed makes the same session. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
