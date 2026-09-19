import { effect, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { readKeyframeBytes } from '@axe/application/replay/replay-keyframe-bytes';
import {
  REPLAY_BASELINE_GRACE_MS,
  REPLAY_CHUNK_INTERVAL_MS,
  REPLAY_KEYFRAME_BUSY_RETRY_MS,
  REPLAY_KEYFRAME_INTERVAL_MS,
  REPLAY_RECENT_PUBLISH_MS,
  ReplayRecorderService,
} from '@axe/application/replay/replay-recorder.service';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
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
import type { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { isCompressed } from '@axe/core/util/compress';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { decodeReplayEvents, decodeReplayManifest } from '@axe/domain/replay/replay-codec';
import { ReplayDetailLevel, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { decodeReplayKeyframe } from '@axe/domain/replay/replay-keyframe';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

class FakeReplayLogStore extends ReplayLogStore {
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

  allEvents() {
    return this.chunks.flatMap((chunk) => decodeReplayEvents(chunk.bytes));
  }
}

function context(identifier: string, aliasName: string, syncData: Record<string, unknown>): ObjectContext {
  return { identifier, aliasName, majorVersion: 1, minorVersion: 0.5, syncData };
}

/**
 * Writing a board down goes through compression, so advancing the timers is not enough.
 * How many turns it takes depends on how busy the machine is, so this waits for it.
 *
 * It does not give up quietly. Doing so would let the following assertion report that
 * nothing happened, and a slow machine would be indistinguishable from a real defect.
 */
const SETTLE_TURNS = 5000;

async function settleUntil(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < SETTLE_TURNS; turn++) {
    if (done()) return;
    await vi.advanceTimersByTimeAsync(1);
  }
  throw new Error(`待っていた状態になりませんでした (${SETTLE_TURNS} 回)`);
}

function sendUpdate(identifier: string, aliasName: string, attributes: Record<string, unknown>, sendFrom = 'peer-a') {
  localDispatch('UPDATE_GAME_OBJECT', context(identifier, aliasName, { value: '', attributes }), sendFrom);
}

describe('ReplayRecorderService', () => {
  let service: ReplayRecorderService;
  let store: FakeReplayLogStore;
  let objectStore: ObjectStore;
  let pointerDevice: PointerDeviceService;

  beforeEach(() => {
    localStorage.removeItem('axe-replay-preference');
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    store = new FakeReplayLogStore();
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: ReplayLogStore, useValue: store }],
    });
    objectStore = TestBed.inject(ObjectStore);
    pointerDevice = TestBed.inject(PointerDeviceService);
    service = TestBed.inject(ReplayRecorderService);

    const cursor = new PeerCursor('cursor-a');
    cursor.peerId = 'peer-a';
    cursor.userId = 'alice';
    cursor.name = 'アリス';
    cursor.role = PeerRole.Player;
    objectStore.add(cursor, false);
  });

  afterEach(async () => {
    localStorage.removeItem('axe-replay-preference');
    setNetworkIsolated(false);
    if (service.isRecording()) await service.stop();
    vi.restoreAllMocks();
    for (const object of objectStore.getObjects()) objectStore.remove(object);
    vi.useRealTimers();
  });

  it('records nothing before recording starts', () => {
    sendUpdate('c1', 'character', { location: { name: 'table', x: 0, y: 0 }, posZ: 0 });
    expect(service.eventCount()).toBe(0);
    expect(service.recentEvents()).toHaveLength(0);
  });

  it('records a move as who did what to which piece', async () => {
    await service.start();
    sendUpdate('c1', 'character', { location: { name: 'table', x: 0, y: 0 }, posZ: 0 });
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { location: { name: 'table', x: 100, y: 50 }, posZ: 0 });

    const [event] = service.recentEvents();
    expect(event.kind).toBe(ReplayEventKind.ObjectMove);
    expect(event.actorId).toBe('alice');
    expect(event.targetId).toBe('c1');
    expect(event.detail['to']).toEqual({ name: 'table', x: 100, y: 50, z: 0 });
  });

  it('ignores a sync carrying the same values the board started with', async () => {
    const character = { identifier: 'c1', aliasName: 'character', syncData: { posZ: 0 } };
    vi.spyOn(objectStore, 'getObjects').mockReturnValue([
      { identifier: 'c1', toContext: () => context('c1', 'character', { value: '', attributes: { posZ: 0 } }) },
    ] as never);

    await service.start();
    sendUpdate('c1', character.aliasName, { posZ: 0 });

    expect(service.recentEvents()).toHaveLength(0);
  });

  it('does not record the opening flood of syncs as creations', async () => {
    await service.start();
    sendUpdate('c9', 'character', { posZ: 0 });
    expect(service.recentEvents()).toHaveLength(0);

    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c8', 'character', { posZ: 0 });
    expect(service.recentEvents()).toHaveLength(1);
    expect(service.recentEvents()[0].kind).toBe(ReplayEventKind.ObjectCreate);
  });

  it('records a line said in the first moments of a recording', async () => {
    await service.start();
    sendUpdate('m1', 'chat', { from: 'alice', timestamp: Date.now() + 100 });

    expect(service.recentEvents().map((event) => event.kind)).toEqual([ReplayEventKind.ChatMessage]);
  });

  it('leaves out an older line a peer catches the room up with', async () => {
    await service.start();
    sendUpdate('m1', 'chat', { from: 'alice', timestamp: Date.now() - 60_000 });

    expect(service.recentEvents()).toHaveLength(0);
  });

  it('records what this browser brings to the table in the first moments', async () => {
    vi.spyOn(Network, 'peerId', 'get').mockReturnValue('me');
    await service.start();
    sendUpdate('c9', 'character', { posZ: 0 }, 'me');

    expect(service.recentEvents().map((event) => event.kind)).toEqual([ReplayEventKind.ObjectCreate]);
  });

  it('folds a run of moves into one', async () => {
    await service.start();
    sendUpdate('c1', 'character', { location: { name: 'table', x: 0, y: 0 }, posZ: 0 });
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

    for (let x = 10; x <= 50; x += 10) {
      sendUpdate('c1', 'character', { location: { name: 'table', x, y: 0 }, posZ: 0 });
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(REPLAY_RECENT_PUBLISH_MS);

    const events = service.recentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].merged).toBe(5);
    expect(events[0].detail['from']).toEqual({ name: 'table', x: 0, y: 0, z: 0 });
    expect(events[0].detail['to']).toEqual({ name: 'table', x: 50, y: 0, z: 0 });
  });

  it('does not rewrite the display signal every frame of a drag', async () => {
    await service.start();
    sendUpdate('c1', 'character', { location: { name: 'table', x: 0, y: 0 }, posZ: 0 });
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

    let writes = 0;
    const stop = effect(
      () => {
        service.recentEvents();
        writes++;
      },
      { injector: TestBed.inject(Injector) }
    );
    TestBed.tick();
    writes = 0;

    for (let x = 10; x <= 300; x += 10) {
      sendUpdate('c1', 'character', { location: { name: 'table', x, y: 0 }, posZ: 0 });
      vi.advanceTimersByTime(16);
      TestBed.tick();
    }

    expect(writes).toBeLessThan(5);
    stop.destroy();
  });

  it('still shows the final position of a folded drag', async () => {
    await service.start();
    sendUpdate('c1', 'character', { location: { name: 'table', x: 0, y: 0 }, posZ: 0 });
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

    sendUpdate('c1', 'character', { location: { name: 'table', x: 10, y: 0 }, posZ: 0 });
    vi.advanceTimersByTime(16);
    sendUpdate('c1', 'character', { location: { name: 'table', x: 20, y: 0 }, posZ: 0 });
    vi.advanceTimersByTime(REPLAY_RECENT_PUBLISH_MS);

    expect(service.recentEvents()[0].detail['to']).toEqual({ name: 'table', x: 20, y: 0, z: 0 });
  });

  it('puts off writing the board down until the drag settles', async () => {
    await service.start();
    expect(store.keyframes).toHaveLength(1);
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { location: { name: 'table', x: 10, y: 0 }, posZ: 0 });

    pointerDevice.isDragging = true;
    await vi.advanceTimersByTimeAsync(REPLAY_KEYFRAME_INTERVAL_MS);
    expect(store.keyframes).toHaveLength(1);

    pointerDevice.isDragging = false;
    await vi.advanceTimersByTimeAsync(REPLAY_KEYFRAME_BUSY_RETRY_MS);
    await settleUntil(() => store.keyframes.length >= 2);
    expect(store.keyframes).toHaveLength(2);
  });

  it('records none of the noise', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    localDispatch('CURSOR_MOVE', [1, 2, 3], 'peer-a');
    localDispatch('HEART_BEAT', [1, 'a', null, 2], 'peer-a');
    expect(service.recentEvents()).toHaveLength(0);
  });

  it('records the dice and shuffle cues', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    localDispatch('ROLL_DICE_SYMBOL', { identifier: 'd1' }, 'peer-a');
    localDispatch('SHUFFLE_CARD_STACK', { identifier: 's1' }, 'peer-a');

    expect(service.recentEvents().map((e) => e.kind)).toEqual([
      ReplayEventKind.ObjectDiceRoll,
      ReplayEventKind.ObjectShuffle,
    ]);
  });

  it('records nothing while playback holds the table', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

    setNetworkIsolated(true);
    localDispatch('SOUND_EFFECT', 'se-dice', 'peer-a');
    sendUpdate('c1', 'character', { location: { name: 'table', x: 10, y: 0 }, posZ: 0 });
    expect(service.recentEvents()).toHaveLength(0);

    setNetworkIsolated(false);
    localDispatch('SOUND_EFFECT', 'se-dice', 'peer-a');
    expect(service.recentEvents()).toHaveLength(1);
  });

  it('records a deletion', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    localDispatch('DELETE_GAME_OBJECT', { identifier: 'c1', aliasName: 'character' }, 'peer-a');

    expect(service.recentEvents()[0].kind).toBe(ReplayEventKind.ObjectRemove);
  });

  it('records a whisper as private, with its recipients', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    localDispatch(
      'UPDATE_GAME_OBJECT',
      context('m1', 'chat', { value: 'ないしょ', attributes: { from: 'alice', to: 'bob', tag: '' } }),
      'peer-a'
    );

    expect(service.recentEvents()[0].visibility).toEqual({ kind: 'direct', to: ['bob'] });
  });

  describe('a piece kept to the game master', () => {
    function hiddenPieceWithPart(): { piece: GameCharacter; part: DataElement } {
      const piece = GameCharacter.create('ボス', 1, '');
      piece.disclosureMode = DisclosureMode.GameMaster;
      const part = piece.commonDataElement!.children[0] as DataElement;
      return { piece, part };
    }

    it('has a change to one of its parts kept hidden as well', async () => {
      const { part } = hiddenPieceWithPart();
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

      localDispatch(
        'UPDATE_GAME_OBJECT',
        context(part.identifier, 'data', { ...(part.toContext().syncData as object), value: 'あらたな値' }),
        'peer-a'
      );

      const [event] = service.recentEvents();
      expect(event.targetId).toBe(part.identifier);
      expect(event.visibility).toEqual({ kind: 'gm-only' });
    });

    it('is still hidden when it is taken away', async () => {
      const { piece } = hiddenPieceWithPart();
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
      const synced = piece.toContext().syncData as { attributes: Record<string, unknown> };
      sendUpdate(piece.identifier, 'character', { ...synced.attributes, location: { name: 'table', x: 300, y: 0 } });

      objectStore.remove(piece);
      localDispatch('DELETE_GAME_OBJECT', { identifier: piece.identifier, aliasName: 'character' }, 'peer-a');

      const removal = service.recentEvents().find((event) => event.kind === ReplayEventKind.ObjectRemove);
      expect(removal?.visibility).toEqual({ kind: 'gm-only' });
    });

    it('is still hidden when it is taken away untouched since recording began', async () => {
      const { piece } = hiddenPieceWithPart();
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

      objectStore.remove(piece);
      localDispatch('DELETE_GAME_OBJECT', { identifier: piece.identifier, aliasName: 'character' }, 'peer-a');

      const removal = service.recentEvents().find((event) => event.kind === ReplayEventKind.ObjectRemove);
      expect(removal?.visibility).toEqual({ kind: 'gm-only' });
    });

    it('has one of its parts taken away on its own kept hidden as well', async () => {
      const { part } = hiddenPieceWithPart();
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

      objectStore.remove(part);
      localDispatch('DELETE_GAME_OBJECT', { identifier: part.identifier, aliasName: 'data' }, 'peer-a');

      const removal = service.recentEvents().find((event) => event.targetId === part.identifier);
      expect(removal?.visibility).toEqual({ kind: 'gm-only' });
    });
  });

  describe('a piece and its parts', () => {
    function dispatchUpdateOf(object: { toContext(): ObjectContext }): void {
      localDispatch('UPDATE_GAME_OBJECT', object.toContext(), 'peer-a');
    }

    it('tells a piece brought out as one arrival, carrying the parts that came with it', async () => {
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
      const piece = GameCharacter.create('ゴブリン', 1, '');
      const parts = piece.commonDataElement!.children as DataElement[];

      dispatchUpdateOf(piece);
      for (const part of parts) dispatchUpdateOf(part);

      const arrivals = service.recentEvents().filter((event) => event.kind === ReplayEventKind.ObjectCreate);
      expect(arrivals.map((event) => event.targetId)).toEqual([piece.identifier]);
      expect(arrivals[0].detail['part']).toBeUndefined();
      expect(arrivals[0].parts?.map((patch) => patch.identifier)).toEqual(parts.map((part) => part.identifier));
    });

    it('writes the parts out with their piece, and reads them back', async () => {
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
      const piece = GameCharacter.create('ゴブリン', 1, '');
      const part = piece.commonDataElement!.children[0] as DataElement;
      dispatchUpdateOf(piece);
      dispatchUpdateOf(part);
      await service.stop();

      const arrival = store.allEvents().find((event) => event.targetId === piece.identifier);
      expect(arrival?.parts?.[0]).toMatchObject({ identifier: part.identifier, aliasName: 'data' });
    });

    it('tells on its own, as a part, one that arrives before its piece', async () => {
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
      const piece = GameCharacter.create('ゴブリン', 1, '');
      const part = piece.commonDataElement!.children[0] as DataElement;

      dispatchUpdateOf(part);
      dispatchUpdateOf(piece);

      const arrivals = service.recentEvents().filter((event) => event.kind === ReplayEventKind.ObjectCreate);
      expect(arrivals.find((event) => event.targetId === part.identifier)?.detail['part']).toBe(true);
      expect(arrivals.find((event) => event.targetId === piece.identifier)?.parts).toBeUndefined();
    });

    it('tells on its own a part that arrives once its piece has been written out', async () => {
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
      const piece = GameCharacter.create('ゴブリン', 1, '');
      const part = piece.commonDataElement!.children[0] as DataElement;
      dispatchUpdateOf(piece);
      sendUpdate('bystander', 'character', { name: '見物人' });
      await vi.advanceTimersByTimeAsync(REPLAY_CHUNK_INTERVAL_MS);

      dispatchUpdateOf(part);

      const arrival = service.recentEvents().find((event) => event.targetId === part.identifier);
      expect(arrival?.detail['part']).toBe(true);
      expect(store.allEvents().find((event) => event.targetId === piece.identifier)?.parts).toBeUndefined();
    });

    it('tells on its own a part added once something else has been recorded', async () => {
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
      const piece = GameCharacter.create('ゴブリン', 1, '');
      const part = piece.commonDataElement!.children[0] as DataElement;
      dispatchUpdateOf(piece);
      sendUpdate('bystander', 'character', { name: '見物人' });

      dispatchUpdateOf(part);

      expect(service.recentEvents().find((event) => event.targetId === piece.identifier)?.parts).toBeUndefined();
      expect(service.recentEvents().find((event) => event.targetId === part.identifier)?.detail['part']).toBe(true);
    });

    it('tells on its own a part added once the board has been saved, so playing on from there keeps it', async () => {
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
      const piece = GameCharacter.create('ゴブリン', 1, '');
      const part = piece.commonDataElement!.children[0] as DataElement;
      dispatchUpdateOf(piece);
      await (service as unknown as { captureKeyframe(force: boolean): Promise<void> }).captureKeyframe(true);

      dispatchUpdateOf(part);

      expect(service.recentEvents().find((event) => event.targetId === piece.identifier)?.parts).toBeUndefined();
      expect(service.recentEvents().find((event) => event.targetId === part.identifier)).toBeDefined();
    });

    it('tells the removal of a card drawn from its deck as a piece of its own', async () => {
      const deck = CardStack.create('山札');
      const card = Card.create('切り札', '', '');
      deck.putOnTop(card);
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

      deck.drawCard();
      dispatchUpdateOf(card);
      objectStore.remove(card);
      localDispatch('DELETE_GAME_OBJECT', { identifier: card.identifier, aliasName: 'card' }, 'peer-a');

      const removal = service
        .recentEvents()
        .find((event) => event.kind === ReplayEventKind.ObjectRemove && event.targetId === card.identifier);
      expect(removal).toBeDefined();
      expect(removal?.detail['part']).toBeUndefined();
    });

    it('takes a piece away as one removal, carrying the parts that went with it', async () => {
      const piece = GameCharacter.create('ボス', 1, '');
      const parts = piece.commonDataElement!.children as DataElement[];
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

      objectStore.remove(piece);
      localDispatch('DELETE_GAME_OBJECT', { identifier: piece.identifier, aliasName: 'character' }, 'peer-a');
      for (const part of parts) {
        localDispatch('DELETE_GAME_OBJECT', { identifier: part.identifier, aliasName: 'data' }, 'peer-a');
      }

      const removals = service.recentEvents().filter((event) => event.kind === ReplayEventKind.ObjectRemove);
      expect(removals.map((event) => event.targetId)).toEqual([piece.identifier]);
      expect(removals[0].removedParts).toEqual(parts.map((part) => part.identifier));
    });

    it('names a piece taken away untouched, and flags its parts going with it', async () => {
      const piece = GameCharacter.create('ボス', 1, '');
      const part = piece.commonDataElement!.children[0] as DataElement;
      await service.start();
      vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);

      localDispatch('DELETE_GAME_OBJECT', { identifier: part.identifier, aliasName: 'data' }, 'peer-a');
      objectStore.remove(piece);
      localDispatch('DELETE_GAME_OBJECT', { identifier: piece.identifier, aliasName: 'character' }, 'peer-a');
      await service.stop();

      const removals = service.recentEvents().filter((event) => event.kind === ReplayEventKind.ObjectRemove);
      expect(removals.find((event) => event.targetId === part.identifier)?.detail['part']).toBe(true);
      expect(removals.find((event) => event.targetId === piece.identifier)?.detail['part']).toBeUndefined();
      const manifest = decodeReplayManifest([...store.recordings.values()][0].manifest!);
      expect(manifest?.targets.find((target) => target.identifier === piece.identifier)?.name).toBe('ボス');
    });
  });

  it('carries the chosen detail level to the next session', () => {
    service.setDetailLevel(ReplayDetailLevel.Full);
    expect(localStorage.getItem('axe-replay-preference')).toContain('full');
  });

  it('records no board changes at the chat-only detail level', async () => {
    service.setDetailLevel(ReplayDetailLevel.ChatOnly);
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { location: { name: 'table', x: 10, y: 0 }, posZ: 0 });
    localDispatch(
      'UPDATE_GAME_OBJECT',
      context('m1', 'chat', { value: 'やあ', attributes: { from: 'alice' } }),
      'peer-a'
    );

    expect(service.recentEvents().map((e) => e.kind)).toEqual([ReplayEventKind.ChatMessage]);
  });

  it('writes a chunk out at intervals', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { posZ: 10 });

    expect(store.chunks).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(REPLAY_CHUNK_INTERVAL_MS);
    expect(store.chunks).toHaveLength(1);
    expect(store.allEvents()).toHaveLength(1);
  });

  it('writes out the remainder and the manifest on stopping', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { posZ: 10 });
    await service.stop();

    expect(service.isRecording()).toBe(false);
    expect(store.allEvents()).toHaveLength(1);

    const manifest = decodeReplayManifest((await store.getManifest(1))!);
    expect(manifest?.roomName).toBeDefined();
    expect(manifest?.endedAt).not.toBeNull();
    expect(manifest?.actors.some((actor) => actor.userId === 'alice')).toBe(true);
    expect(manifest?.keyframes.length).toBeGreaterThan(0);
  });

  it('does not crush a new recording started before the old one finished stopping', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { posZ: 10 });

    const stopping = service.stop();
    const starting = service.start();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([stopping, starting]);

    expect(service.isRecording()).toBe(true);
    expect([...store.recordings.keys()]).toEqual([1, 2]);

    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { posZ: 20 });
    await service.stop();

    expect(decodeReplayManifest((await store.getManifest(1))!)?.endedAt).not.toBeNull();
    expect(decodeReplayManifest((await store.getManifest(2))!)?.endedAt).not.toBeNull();
    expect(store.chunks.some((chunk) => chunk.recordingId === 2)).toBe(true);
  });

  it('does not start while playback holds the table', async () => {
    setNetworkIsolated(true);
    expect(await service.start()).toBe(false);
    expect(service.isRecording()).toBe(false);
    expect(store.keyframes).toHaveLength(0);
  });

  it('writes no board down while playback holds the table', async () => {
    await service.start();
    expect(store.keyframes).toHaveLength(1);

    setNetworkIsolated(true);
    await service.mark('第二幕');
    await vi.advanceTimersByTimeAsync(REPLAY_KEYFRAME_INTERVAL_MS);
    expect(store.keyframes).toHaveLength(1);

    setNetworkIsolated(false);
    await service.stop();
    expect(store.keyframes).toHaveLength(2);
  });

  it('records outside a room', async () => {
    expect(await service.start()).toBe(true);
    expect(service.roomName()).toBe('');

    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { posZ: 10 });
    await service.stop();

    expect(store.allEvents()).toHaveLength(1);
    expect(decodeReplayManifest((await store.getManifest(1))!)?.roomName).toBe('');
  });

  it('keeps the room name it started with', async () => {
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: '第一夜' } as never);
    await service.start();
    expect(service.roomName()).toBe('第一夜');

    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: '' } as never);
    await service.stop();

    expect(decodeReplayManifest((await store.getManifest(1))!)?.roomName).toBe('第一夜');
  });

  it('writes the board down at the start and at the stop', async () => {
    await service.start();
    expect(store.keyframes).toHaveLength(1);
    await service.stop();
    expect(store.keyframes).toHaveLength(2);
  });

  it('writes the board down against its recording', async () => {
    await service.start();
    const snapshot = decodeReplayKeyframe(await readKeyframeBytes(store.keyframes[0].blob));
    expect(snapshot.some((object) => object.identifier === 'cursor-a')).toBe(true);
  });

  it('stores the board compressed', async () => {
    // A board is a whole room and another arrives every ten minutes; uncompressed they would eat the storage.
    await service.start();
    const raw = new Uint8Array(await store.keyframes[0].blob.arrayBuffer());
    expect(isCompressed(raw)).toBe(true);
  });

  it('does not take the board again when nothing moved', async () => {
    await service.start();
    expect(store.keyframes).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(REPLAY_KEYFRAME_INTERVAL_MS * 3);

    expect(store.keyframes).toHaveLength(1);
  });

  it('takes the next board once something has happened', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { location: { name: 'table', x: 10, y: 0 }, posZ: 0 });

    await vi.advanceTimersByTimeAsync(REPLAY_KEYFRAME_INTERVAL_MS);
    await settleUntil(() => store.keyframes.length >= 2);

    expect(store.keyframes).toHaveLength(2);
  });

  it('does not rewrite the whole manifest on every append', async () => {
    // The manifest grows with the recording, so rewriting it each time costs the square of the length.
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    const writes = vi.spyOn(store, 'updateRecording');

    const flushes = 8;
    for (let index = 0; index < flushes; index++) {
      sendUpdate('c1', 'character', { location: { name: 'table', x: index * 10, y: 0 }, posZ: 0 });
      await vi.advanceTimersByTimeAsync(REPLAY_CHUNK_INTERVAL_MS);
    }

    expect(store.chunks.length).toBeGreaterThanOrEqual(flushes);
    const manifestWrites = writes.mock.calls.filter(([, update]) => update.manifest !== undefined).length;
    expect(manifestWrites).toBeLessThan(flushes);
  });

  it('writes the manifest out in full on stopping', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    sendUpdate('c1', 'character', { location: { name: 'table', x: 10, y: 0 }, posZ: 0 });
    await vi.advanceTimersByTimeAsync(REPLAY_CHUNK_INTERVAL_MS);

    await service.stop();

    const row = [...store.recordings.values()][0];
    expect(row.manifest).toBeDefined();
    expect(decodeReplayManifest(row.manifest!)?.chunks.length).toBeGreaterThan(0);
  });

  it('can drop a marker', async () => {
    await service.start();
    vi.advanceTimersByTime(REPLAY_BASELINE_GRACE_MS);
    await service.mark('第二幕');

    expect(service.recentEvents()[0].kind).toBe(ReplayEventKind.Marker);
    expect(service.recentEvents()[0].detail['label']).toBe('第二幕');
  });
});
