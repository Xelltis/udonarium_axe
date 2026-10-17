import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  buildReplayArchiveFiles,
  parseReplayArchive,
  type ReplayArchiveEntry,
  replayArchiveName,
} from '@axe/domain/replay/replay-archive';
import {
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
} from '@axe/domain/replay/replay-event';
import { decode } from '@msgpack/msgpack';

const manifest: ReplayManifest = {
  formatVersion: REPLAY_FORMAT_VERSION,
  roomName: '第一夜',
  startedAt: new Date(2026, 0, 2, 20, 5).getTime(),
  endedAt: new Date(2026, 0, 2, 23, 40).getTime(),
  recordedBy: {
    userId: 'gm',
    peerId: 'p1',
    name: 'ゲームマスター',
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

async function toEntries(files: File[]): Promise<ReplayArchiveEntry[]> {
  return files.map((file) => ({ name: file.name, blob: file }));
}

describe('replayArchiveName()', () => {
  it('builds the name from the room and the moment', () => {
    expect(replayArchiveName(manifest)).toBe('第一夜_20260102_2005');
  });

  it('falls back to a default name without a room', () => {
    expect(replayArchiveName({ ...manifest, roomName: '' })).toBe('replay_20260102_2005');
  });

  it('drops what a file name cannot carry', () => {
    expect(replayArchiveName({ ...manifest, roomName: 'a/b:c' })).toBe('a_b_c_20260102_2005');
  });
});

describe('buildReplayArchiveFiles()', () => {
  it('lays out the catalogue, the events, the keyframes and the assets', () => {
    const files = buildReplayArchiveFiles({
      manifest,
      chunks: [{ index: 0, events: [event(1)] }],
      keyframes: [{ seq: 0, blob: new Blob(['<xml/>']) }],
      assets: [new File(['png'], 'image-1.png', { type: 'image/png' })],
    });
    expect(files.map((file) => file.name)).toEqual([
      'manifest.json',
      'events/000000.msgpack',
      'keyframes/000000.zip',
      'assets/image-1.png',
    ]);
  });

  it('writes the catalogue as readable json', async () => {
    const [manifestFile] = buildReplayArchiveFiles({ manifest, chunks: [], keyframes: [], assets: [] });
    expect(JSON.parse(await manifestFile.text())).toEqual(manifest);
  });

  it('packs the events of an older recording in its own format, as its catalogue says', async () => {
    const [, chunkFile] = buildReplayArchiveFiles({
      manifest: { ...manifest, formatVersion: 3 },
      chunks: [{ index: 0, events: [event(1)] }],
      keyframes: [],
      assets: [],
    });

    expect((decode(new Uint8Array(await chunkFile.arrayBuffer())) as { v: number }).v).toBe(3);
  });
});

describe('parseReplayArchive()', () => {
  it('reads back what it wrote', async () => {
    const files = buildReplayArchiveFiles({
      manifest,
      chunks: [
        { index: 0, events: [event(1), event(2)] },
        { index: 1, events: [event(3)] },
      ],
      keyframes: [
        { seq: 0, blob: new Blob(['<a/>']) },
        { seq: 2, blob: new Blob(['<b/>']) },
      ],
      assets: [new File(['png'], 'image-1.png', { type: 'image/png' })],
    });

    const content = await parseReplayArchive(await toEntries(files));
    expect(content?.manifest.roomName).toBe('第一夜');
    expect(content?.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(content?.keyframes.map((k) => k.seq)).toEqual([0, 2]);
    expect(content?.assets.map((a) => a.name)).toEqual(['image-1.png']);
  });

  it('puts the chunks back in order however they arrive', async () => {
    const files = buildReplayArchiveFiles({
      manifest,
      chunks: [
        { index: 1, events: [event(3)] },
        { index: 0, events: [event(1)] },
      ],
      keyframes: [],
      assets: [],
    });
    const content = await parseReplayArchive(await toEntries(files.reverse()));
    expect(content?.events.map((e) => e.seq)).toEqual([1, 3]);
  });

  it('returns nothing without a catalogue', async () => {
    expect(await parseReplayArchive([{ name: 'events/000000.msgpack', blob: new Blob([]) }])).toBeNull();
  });

  it('returns nothing for a broken one', async () => {
    expect(await parseReplayArchive([{ name: 'manifest.json', blob: new Blob(['{ not json']) }])).toBeNull();
  });

  it('returns nothing for a format it does not support', async () => {
    const future = JSON.stringify({ ...manifest, formatVersion: REPLAY_FORMAT_VERSION + 1 });
    expect(await parseReplayArchive([{ name: 'manifest.json', blob: new Blob([future]) }])).toBeNull();
  });

  it('reads one held in nested directories', async () => {
    const files = buildReplayArchiveFiles({
      manifest,
      chunks: [{ index: 0, events: [event(1)] }],
      keyframes: [],
      assets: [],
    });
    const nested = files.map((file) => ({ name: `replay_20260102/${file.name}`, blob: file }));
    const content = await parseReplayArchive(nested);
    expect(content?.events.map((e) => e.seq)).toEqual([1]);
  });

  it('reads one macOS packed again, passing over the resource forks it added', async () => {
    const APPLE_DOUBLE = new Uint8Array([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00]);
    const files = buildReplayArchiveFiles({
      manifest,
      chunks: [{ index: 0, events: [event(1)] }],
      keyframes: [],
      assets: [],
    });
    const packed = files.flatMap((file) => [
      { name: `replay_20260102/${file.name}`, blob: file },
      {
        name: `__MACOSX/replay_20260102/${file.name.replace(/[^/]+$/, (base) => `._${base}`)}`,
        blob: new Blob([APPLE_DOUBLE]),
      },
    ]);

    const content = await parseReplayArchive(packed);

    expect(content?.events.map((e) => e.seq)).toEqual([1]);
  });
});
