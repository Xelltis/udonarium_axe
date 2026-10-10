import { TestBed } from '@angular/core/testing';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { readKeyframeBytes } from '@axe/application/replay/replay-keyframe-bytes';
import {
  type ReplayChunkInput,
  type ReplayChunkRecord,
  type ReplayKeyframeInput,
  type ReplayKeyframeRecord,
  ReplayLogStore,
  type ReplayRecordingInput,
  type ReplayRecordingMeta,
  type ReplayRecordingUpdate,
} from '@axe/core/storage/replay-log-store';
import { isCompressed } from '@axe/core/util/compress';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { decodeReplayEvents, decodeReplayManifest } from '@axe/domain/replay/replay-codec';
import {
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
} from '@axe/domain/replay/replay-event';
import { decodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

class FakeStore extends ReplayLogStore {
  private nextId = 1;
  readonly recordings = new Map<number, ReplayRecordingMeta & { manifest?: Uint8Array }>();
  readonly chunks: ReplayChunkInput[] = [];
  readonly keyframes: ReplayKeyframeInput[] = [];

  isAvailable(): boolean {
    return true;
  }
  async createRecording(input: ReplayRecordingInput): Promise<number | null> {
    const id = this.nextId++;
    this.recordings.set(id, { id, ...input, endedAt: null, eventCount: 0, byteSize: 0 });
    return id;
  }
  async updateRecording(id: number, update: ReplayRecordingUpdate): Promise<void> {
    const row = this.recordings.get(id);
    if (row) Object.assign(row, update);
  }
  async listRecordings(): Promise<ReplayRecordingMeta[]> {
    return [...this.recordings.values()];
  }
  async getRecording(id: number): Promise<ReplayRecordingMeta | null> {
    return this.recordings.get(id) ?? null;
  }
  async getManifest(id: number): Promise<Uint8Array | null> {
    return this.recordings.get(id)?.manifest ?? null;
  }
  async appendChunk(input: ReplayChunkInput): Promise<boolean> {
    this.chunks.push(input);
    return true;
  }
  async listChunks(recordingId: number): Promise<ReplayChunkRecord[]> {
    return this.chunks.filter((c) => c.recordingId === recordingId).map((c, index) => ({ ...c, id: index + 1 }));
  }
  async putKeyframe(input: ReplayKeyframeInput): Promise<boolean> {
    this.keyframes.push(input);
    return true;
  }
  async listKeyframes(recordingId: number): Promise<ReplayKeyframeRecord[]> {
    return this.keyframes
      .filter((k) => k.recordingId === recordingId)
      .map((k, index) => ({ ...k, id: index + 1, byteSize: k.blob.size }));
  }
  async removeRecording(id: number): Promise<void> {
    this.recordings.delete(id);
  }
  async clear(): Promise<void> {
    this.recordings.clear();
  }
}

function chat(seq: number, text: string): ReplayEvent {
  return {
    seq,
    at: 1_000_000 + seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { text },
    visibility: PUBLIC_VISIBILITY,
  };
}

function move(seq: number, x: number, previousX: number): ReplayEvent {
  return {
    seq,
    at: 1_000_000 + seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ObjectMove,
    actorId: 'bob',
    targetId: 'c1',
    detail: {},
    patch: {
      identifier: 'c1',
      aliasName: 'character',
      before: { 'attributes.location': { x: previousX, y: 0 } },
      after: { 'attributes.location': { x, y: 0 } },
    },
    visibility: PUBLIC_VISIBILITY,
  };
}

const manifest: ReplayManifest = {
  formatVersion: REPLAY_FORMAT_VERSION,
  roomName: '第一夜',
  startedAt: 1_000_000,
  endedAt: 1_010_000,
  recordedBy: { userId: 'gm', peerId: 'p', name: 'GM', role: PeerRole.GameMaster, imageIdentifier: '', sinceSeq: 0 },
  detailLevel: ReplayDetailLevel.Notable,
  actors: [],
  targets: [],
  keyframes: [],
  chunks: [],
};

const base: ReplayObjectSnapshot[] = [
  { identifier: 'c1', aliasName: 'character', syncData: { attributes: { location: { x: 0, y: 0 } } } },
];

describe('ReplayEditorService', () => {
  const events = [chat(1, '一'), move(2, 10, 0), chat(3, '三'), move(4, 20, 10)];

  let service: ReplayEditorService;
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: ReplayLogStore, useValue: store }],
    });
    service = TestBed.inject(ReplayEditorService);
    service.begin(events);
  });

  it('starts out untouched', () => {
    expect(service.isEditing()).toBe(true);
    expect(service.isDirty()).toBe(false);
    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('remembers what was deleted', () => {
    service.remove(2);
    expect(service.edited().map((e) => e.seq)).toEqual([1, 3, 4]);
    expect(service.isDirty()).toBe(true);
  });

  it('remembers what was reordered', () => {
    service.move(3, -1);
    expect(service.edited().map((e) => e.seq)).toEqual([1, 3, 2, 4]);
    expect(service.isDirty()).toBe(true);
  });

  it('can rewrite a line', () => {
    service.retext(1, 'あらためて');
    expect(service.edited()[0].detail['text']).toBe('あらためて');
    expect(service.isDirty()).toBe(true);
  });

  it('can insert a line anywhere', () => {
    service.insert(2, {
      kind: ReplayEventKind.ChatMessage,
      actorId: 'gm',
      speaker: '語り',
      text: 'そのとき',
      tabIdentifier: 'tab1',
    });

    const edited = service.edited();
    expect(edited).toHaveLength(5);
    expect(edited[2].detail['text']).toBe('そのとき');
    expect(edited[2].actorId).toBe('gm');
    expect(service.isDirty()).toBe(true);
  });

  it('stamps an inserted line between its neighbours', () => {
    service.insert(2, {
      kind: ReplayEventKind.ChatMessage,
      actorId: 'gm',
      speaker: '',
      text: '間',
      tabIdentifier: 'tab1',
    });
    expect(service.edited()[2].at).toBe(1_002_500);
  });

  it('can tell an inserted line apart', () => {
    service.insert(0, {
      kind: ReplayEventKind.Marker,
      actorId: 'gm',
      speaker: '',
      text: '第一幕',
      tabIdentifier: 'tab1',
    });
    expect(service.isInserted(service.edited()[0].seq)).toBe(true);
    expect(service.isInserted(service.edited()[1].seq)).toBe(false);
  });

  it('keeps an inserted line when saving', async () => {
    service.insert(0, {
      kind: ReplayEventKind.Marker,
      actorId: 'gm',
      speaker: '',
      text: '第一幕',
      tabIdentifier: 'tab1',
    });
    const id = await service.saveAsDerived(manifest, base);
    const saved = decodeReplayEvents((await store.listChunks(id!))[0].bytes);

    expect(saved).toHaveLength(5);
    expect(saved[0].detail['label']).toBe('第一幕');
    expect(saved.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('can delete an inserted line again', () => {
    service.insert(0, {
      kind: ReplayEventKind.Marker,
      actorId: 'gm',
      speaker: '',
      text: '第一幕',
      tabIdentifier: 'tab1',
    });
    service.revert();
    expect(service.edited()).toHaveLength(4);
    expect(service.isDirty()).toBe(false);
  });

  it('can put everything back', () => {
    service.remove(2);
    service.revert();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(service.isDirty()).toBe(false);
  });

  it('undoes one step at a time', () => {
    service.remove(2);
    service.remove(3);
    expect(service.edited().map((e) => e.seq)).toEqual([1, 4]);

    service.undo();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 3, 4]);

    service.undo();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(service.isDirty()).toBe(false);
  });

  it('does nothing with nothing to undo', () => {
    expect(service.canUndo()).toBe(false);
    service.undo();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('can undo putting everything back', () => {
    service.remove(2);
    service.revert();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);

    service.undo();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 3, 4]);
  });

  it('undoes an insert, a reorder and a rewrite alike', () => {
    service.insert(0, { kind: ReplayEventKind.Marker, actorId: 'gm', speaker: '', text: '幕', tabIdentifier: '' });
    service.move(1, 1);
    service.retext(1, '書き直し');

    service.undo();
    service.undo();
    service.undo();

    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(service.canUndo()).toBe(false);
  });

  it('throws the history away when editing starts again', () => {
    service.remove(2);
    service.begin(events);
    expect(service.canUndo()).toBe(false);
  });

  it('folds the editing away on cancel', () => {
    service.remove(2);
    service.cancel();
    expect(service.isEditing()).toBe(false);
    expect(service.isDirty()).toBe(false);
  });

  it('saves as a separate recording and leaves the original alone', async () => {
    service.remove(2);
    const id = await service.saveAsDerived(manifest, base);
    expect(id).toBe(1);

    const saved = decodeReplayEvents((await store.listChunks(id!))[0].bytes);
    expect(saved.map((e) => e.detail['text'] ?? '')).toEqual(['一', '三', '']);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('renumbers the recording it saves', async () => {
    service.remove(2);
    const id = await service.saveAsDerived(manifest, base);
    const saved = decodeReplayEvents((await store.listChunks(id!))[0].bytes);
    expect(saved.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(saved[0].t).toBe(0);
  });

  it('notes in the manifest where it came from', async () => {
    service.remove(2);
    const id = await service.saveAsDerived(manifest, base);
    const saved = decodeReplayManifest((await store.getManifest(id!))!);
    expect(saved?.derivedFrom).toEqual({ roomName: '第一夜', startedAt: 1_000_000 });
  });

  it('takes away several rows as one change to undo', () => {
    service.removeMany(new Set([1, 3]));
    expect(service.edited().map((e) => e.seq)).toEqual([2, 4]);

    service.undo();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('moves several rows a step as one change to undo', () => {
    service.stepMany(new Set([2, 4]), -1);
    expect(service.edited().map((e) => e.seq)).toEqual([2, 1, 4, 3]);

    service.undo();
    expect(service.edited().map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('writes a keyframe matching the edited order', async () => {
    service.remove(2);
    const id = await service.saveAsDerived(manifest, base);
    const keyframes = await store.listKeyframes(id!);

    expect(keyframes.length).toBeGreaterThan(0);
    const start = decodeReplayKeyframe(await readKeyframeBytes(keyframes[0].blob));
    expect(start[0].syncData).toEqual({ attributes: { location: { x: 0, y: 0 } } });
  });

  it('stores the boards compressed', async () => {
    service.remove(2);
    const id = await service.saveAsDerived(manifest, base);
    const [first] = await store.listKeyframes(id!);

    expect(isCompressed(new Uint8Array(await first.blob.arrayBuffer()))).toBe(true);
  });

  it('writes a board every ten minutes of recorded time, not every few hundred events', async () => {
    const minute = 60_000;
    const long = Array.from({ length: 900 }, (_, i) => ({ ...move(i + 1, i, i - 1), at: 1_000_000 + i * 2_000 }));
    service.begin(long);
    service.remove(1);

    const id = await service.saveAsDerived(manifest, base);
    const keyframes = await store.listKeyframes(id!);

    // 30 minutes of events: the board before the first, then at 10 and 20 minutes.
    expect(long[long.length - 1].at - long[0].at).toBeGreaterThan(29 * minute);
    expect(keyframes).toHaveLength(3);
    const last = decodeReplayKeyframe(await readKeyframeBytes(keyframes[2].blob));
    expect(last[0].syncData).toEqual({ attributes: { location: expect.objectContaining({ y: 0 }) } });
  });

  it('saves nothing when the edit empties the recording', async () => {
    for (const event of events) service.remove(event.seq);
    expect(await service.saveAsDerived(manifest, base)).toBeNull();
  });

  it('returns to untouched once saved', async () => {
    service.remove(2);
    await service.saveAsDerived(manifest, base);
    expect(service.isDirty()).toBe(false);
    expect(service.isEditing()).toBe(false);
  });
});
