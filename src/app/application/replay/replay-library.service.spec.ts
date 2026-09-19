import { TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageStorage } from '@axe/core/storage/image-storage';
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
import { PeerRole } from '@axe/domain/peer/peer-role';
import { encodeReplayEvents, encodeReplayManifest } from '@axe/domain/replay/replay-codec';
import {
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
} from '@axe/domain/replay/replay-event';
import { decodeReplayKeyframe, encodeReplayKeyframe } from '@axe/domain/replay/replay-keyframe';
import { buildLongReplayFixture, SHORT_SESSION } from '@axe/testing/replay-fixtures';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const manifest: ReplayManifest = {
  formatVersion: REPLAY_FORMAT_VERSION,
  roomName: '第一夜',
  startedAt: new Date(2026, 0, 2, 20, 5).getTime(),
  endedAt: new Date(2026, 0, 2, 23, 40).getTime(),
  recordedBy: {
    userId: 'gm',
    peerId: 'p1',
    name: 'GM',
    role: PeerRole.GameMaster,
    imageIdentifier: '',
    sinceSeq: 0,
  },
  detailLevel: ReplayDetailLevel.Notable,
  actors: [],
  targets: [],
  keyframes: [],
  chunks: [],
};

function event(seq: number): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'gm',
    detail: { text: `発言 ${seq}` },
    visibility: PUBLIC_VISIBILITY,
  };
}

function soundEvent(seq: number): ReplayEvent {
  return {
    ...event(seq),
    kind: ReplayEventKind.MediaSoundEffect,
    detail: { identifier: 'se-used' },
    signal: { name: 'SOUND_EFFECT', data: 'se-used' },
  };
}

function keyframeBlob(identifier: string, imageIdentifier: string): Blob {
  const bytes = encodeReplayKeyframe([
    { identifier, aliasName: 'character', syncData: { attributes: { imageIdentifier } } },
  ]);
  return new Blob([bytes as BlobPart]);
}

async function firstIdentifierOf(blob: Blob | undefined): Promise<string | undefined> {
  if (!blob) return undefined;
  return decodeReplayKeyframe(new Uint8Array(await blob.arrayBuffer()))[0]?.identifier;
}

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

describe('ReplayLibraryService', () => {
  let service: ReplayLibraryService;
  let wantedAssets: { images: ReadonlySet<string>; audios: ReadonlySet<string> } | null = null;
  let store: FakeStore;
  let archiver: FileArchiver;

  async function seedRecording(): Promise<ReplayRecordingMeta> {
    const id = (await store.createRecording({ roomName: manifest.roomName, startedAt: manifest.startedAt }))!;
    await store.appendChunk({
      recordingId: id,
      index: 0,
      seqStart: 1,
      seqEnd: 2,
      eventCount: 2,
      bytes: encodeReplayEvents([event(1), event(2)]),
    });
    await store.appendChunk({
      recordingId: id,
      index: 1,
      seqStart: 3,
      seqEnd: 3,
      eventCount: 1,
      bytes: encodeReplayEvents([soundEvent(4)]),
    });
    await store.putKeyframe({ recordingId: id, seq: 0, at: manifest.startedAt, blob: keyframeBlob('a', 'img-used') });
    await store.putKeyframe({ recordingId: id, seq: 2, at: manifest.startedAt, blob: keyframeBlob('b', 'img-used') });
    await store.updateRecording(id, { manifest: encodeReplayManifest(manifest) });
    return (await store.getRecording(id))!;
  }

  beforeEach(() => {
    wantedAssets = null;
    store = new FakeStore();
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: ReplayLogStore, useValue: store },
        {
          provide: SaveDataService,
          useValue: {
            buildAssetFiles: (wanted: { images: ReadonlySet<string>; audios: ReadonlySet<string> }) => {
              wantedAssets = wanted;
              return [...wanted.images].map((identifier) => new File(['png'], `${identifier}.png`));
            },
          },
        },
      ],
    });
    archiver = TestBed.inject(FileArchiver);
    service = TestBed.inject(ReplayLibraryService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the chunks back in order', async () => {
    const meta = await seedRecording();
    const loaded = await service.load(meta.id);
    expect(loaded.events.map((e) => e.seq)).toEqual([1, 2, 4]);
    expect(loaded.manifest?.roomName).toBe('第一夜');
  });

  it('hides the values of a hidden piece in a recording written before parts followed their piece', async () => {
    const fixture = buildLongReplayFixture(SHORT_SESSION);
    const id = (await store.createRecording({ roomName: 'fixture', startedAt: fixture.manifest.startedAt }))!;
    await store.appendChunk({
      recordingId: id,
      index: 0,
      seqStart: 1,
      seqEnd: fixture.events.length,
      eventCount: fixture.events.length,
      bytes: encodeReplayEvents(fixture.events),
    });
    for (const keyframe of fixture.keyframes) {
      const blob = new Blob([encodeReplayKeyframe(keyframe.objects) as BlobPart]);
      await store.putKeyframe({ recordingId: id, seq: keyframe.seq, at: keyframe.at, blob });
    }
    await store.updateRecording(id, { manifest: encodeReplayManifest(fixture.manifest) });

    const { events } = await service.load(id);

    const hiddenValues = events.filter((e) => e.targetId?.startsWith('pc-0-'));
    expect(hiddenValues.length).toBeGreaterThan(0);
    expect(hiddenValues.every((e) => e.visibility.kind === 'gm-only')).toBe(true);
  });

  it('trusts a recording written by the current recorder to have flagged its parts itself', async () => {
    const id = (await store.createRecording({ roomName: '第一夜', startedAt: manifest.startedAt }))!;
    const removal: ReplayEvent = {
      ...event(1),
      kind: ReplayEventKind.ObjectRemove,
      targetId: 'hp',
      detail: {},
    };
    await store.appendChunk({
      recordingId: id,
      index: 0,
      seqStart: 1,
      seqEnd: 1,
      eventCount: 1,
      bytes: encodeReplayEvents([removal]),
    });
    const board = encodeReplayKeyframe([
      { identifier: 'hero', aliasName: 'character', syncData: {} },
      { identifier: 'hp', aliasName: 'data', syncData: { parentIdentifier: 'hero' } },
    ]);
    await store.putKeyframe({ recordingId: id, seq: 0, at: manifest.startedAt, blob: new Blob([board as BlobPart]) });
    await store.updateRecording(id, { manifest: encodeReplayManifest(manifest) });

    const { events } = await service.load(id);

    expect(events[0].detail).toEqual({});
  });

  it('returns the nearest keyframe at or before a point', async () => {
    const meta = await seedRecording();
    expect(await firstIdentifierOf((await service.keyframeBefore(meta.id, 1))?.blob)).toBe('a');
    expect((await service.keyframeBefore(meta.id, 1))?.seq).toBe(0);
    expect(await firstIdentifierOf((await service.keyframeBefore(meta.id, 5))?.blob)).toBe('b');
    expect((await service.keyframeBefore(meta.id, 5))?.seq).toBe(2);
  });

  it('returns the first keyframe when asked for something before it', async () => {
    const meta = await seedRecording();
    expect(await firstIdentifierOf((await service.keyframeBefore(meta.id, -1))?.blob)).toBe('a');
  });

  it('reads an exported bundle back into the same recording', async () => {
    const meta = await seedRecording();
    const zipSpy = vi.spyOn(archiver, 'createZipBlobAsync').mockResolvedValue(new Blob(['zip']));
    vi.spyOn(archiver, 'load').mockResolvedValue(undefined);

    expect(await service.export(meta, false)).toBe(true);
    const files = zipSpy.mock.calls[0][0] as File[];
    const entries = files.map((file) => ({ name: file.name, type: file.type, blob: file as Blob }));
    vi.spyOn(archiver, 'readZipEntriesAsync').mockResolvedValue(entries);

    const importedId = await service.import(new File(['zip'], 'replay.zip'));
    expect(importedId).not.toBeNull();

    const loaded = await service.load(importedId!);
    expect(loaded.events.map((e) => e.seq)).toEqual([1, 2, 4]);
    expect(loaded.manifest?.roomName).toBe('第一夜');
    expect((await store.listKeyframes(importedId!)).map((k) => k.seq)).toEqual([0, 2]);
  });

  it('bundles only the assets the recording uses', async () => {
    const meta = await seedRecording();
    const zipSpy = vi.spyOn(archiver, 'createZipBlobAsync').mockResolvedValue(new Blob(['zip']));

    await service.export(meta, true);

    expect([...(wantedAssets?.images ?? [])]).toEqual(['img-used']);
    expect([...(wantedAssets?.audios ?? [])]).toEqual(['se-used']);
    const files = zipSpy.mock.calls[0][0] as File[];
    expect(files.some((file) => file.name === 'assets/img-used.png')).toBe(true);
  });

  it('keeps exporting past a keyframe it cannot read', async () => {
    const id = (await store.createRecording({ roomName: '', startedAt: 0 }))!;
    await store.putKeyframe({ recordingId: id, seq: 0, at: 0, blob: new Blob(['壊れている']) });
    await store.updateRecording(id, { manifest: encodeReplayManifest(manifest) });
    vi.spyOn(archiver, 'createZipBlobAsync').mockResolvedValue(new Blob(['zip']));

    expect(await service.export((await store.getRecording(id))!, true)).toBe(true);
  });

  it('takes in nothing that is neither image nor sound', async () => {
    const entries = [
      { name: 'manifest.json', type: 'application/json', blob: new Blob([JSON.stringify(manifest)]) },
      { name: 'events/000.msgpack', type: '', blob: new Blob([encodeReplayEvents([event(1)]) as BlobPart]) },
      { name: 'x/assets/data.xml', type: 'text/xml', blob: new Blob(['<room/>']) },
    ];
    vi.spyOn(archiver, 'readZipEntriesAsync').mockResolvedValue(entries);
    const load = vi.spyOn(archiver, 'load').mockResolvedValue(undefined);
    const addImage = vi.spyOn(TestBed.inject(ImageStorage), 'addAsync');

    expect(await service.import(new File(['zip'], 'replay.zip'))).not.toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(addImage).not.toHaveBeenCalled();
  });

  it('takes a sound in under the name it was packed with', async () => {
    const entries = [
      { name: 'manifest.json', type: 'application/json', blob: new Blob([JSON.stringify(manifest)]) },
      { name: 'events/000.msgpack', type: '', blob: new Blob([encodeReplayEvents([event(1)]) as BlobPart]) },
      { name: 'assets/戦闘曲.mp3', type: 'audio/mp3', blob: new Blob(['mp3'], { type: 'audio/mp3' }) },
    ];
    vi.spyOn(archiver, 'readZipEntriesAsync').mockResolvedValue(entries);
    const addAudio = vi.spyOn(TestBed.inject(AudioStorage), 'addAsync').mockResolvedValue(null as never);

    expect(await service.import(new File(['zip'], 'replay.zip'))).not.toBeNull();
    expect((addAudio.mock.calls[0][0] as File).name).toBe('戦闘曲.mp3');
  });

  it('exports nothing without a manifest', async () => {
    const id = (await store.createRecording({ roomName: '', startedAt: 0 }))!;
    const meta = (await store.getRecording(id))!;
    expect(await service.export(meta, false)).toBe(false);
  });

  it('refuses an archive that is not a recording', async () => {
    vi.spyOn(archiver, 'readZipEntriesAsync').mockResolvedValue([
      { name: 'data.xml', type: 'text/plain', blob: new Blob(['<room/>']) },
    ]);
    expect(await service.import(new File(['zip'], 'room.zip'))).toBeNull();
  });
});
