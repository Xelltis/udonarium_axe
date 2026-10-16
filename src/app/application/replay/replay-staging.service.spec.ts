import { TestBed } from '@angular/core/testing';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
import type { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ReplayEventKind } from '@axe/domain/replay/replay-event';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function context(identifier: string, aliasName: string, attributes: Record<string, unknown>): ObjectContext {
  return { identifier, aliasName, majorVersion: 1, minorVersion: 0.5, syncData: { value: '', attributes } };
}

function sendUpdate(identifier: string, attributes: Record<string, unknown>): void {
  localDispatch('UPDATE_GAME_OBJECT', context(identifier, 'character', attributes));
}

describe('ReplayStagingService', () => {
  let service: ReplayStagingService;
  let objectStore: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    objectStore = TestBed.inject(ObjectStore);
    service = TestBed.inject(ReplayStagingService);

    const character = new GameCharacter('c1');
    character.location.x = 0;
    objectStore.add(character, false);
    setNetworkIsolated(true);
  });

  afterEach(() => {
    setNetworkIsolated(false);
    service.discard();
    for (const object of objectStore.getObjects()) objectStore.remove(object);
    objectStore.clearDeleteHistory();
  });

  it('begins nothing while the board is not cut off from the room', () => {
    setNetworkIsolated(false);

    service.begin(1, 'alice');

    expect(service.isStaging()).toBe(false);
  });

  it('collects nothing before staging begins', () => {
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    expect(service.captured()).toHaveLength(0);
  });

  it('collects a table action as a line to insert', () => {
    service.begin(2, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });

    const [event] = service.captured();
    expect(event.kind).toBe(ReplayEventKind.ObjectMove);
    expect(event.actorId).toBe('alice');
    expect(event.patch?.identifier).toBe('c1');
  });

  it('folds a run of actions into one', () => {
    service.begin(0, 'alice');
    for (let x = 10; x <= 50; x += 10) sendUpdate('c1', { location: { name: 'table', x, y: 0 } });

    expect(service.captured()).toHaveLength(1);
    expect(service.captured()[0].detail['to']).toMatchObject({ x: 50 });
  });

  it('collects the cues in a form that can sound again', () => {
    service.begin(0, 'alice');
    localDispatch('SOUND_EFFECT', 'se-dice');

    const [event] = service.captured();
    expect(event.kind).toBe(ReplayEventKind.MediaSoundEffect);
    expect(event.signal).toEqual({ name: 'SOUND_EFFECT', data: 'se-dice' });
  });

  it('collects nothing from the others at the table', () => {
    service.begin(0, 'alice');
    localDispatch(
      'UPDATE_GAME_OBJECT',
      context('c1', 'character', { location: { name: 'table', x: 50, y: 0 } }),
      'peer-b'
    );
    localDispatch('SOUND_EFFECT', 'se-dice', 'peer-b');

    expect(service.captured()).toHaveLength(0);
  });

  it('collects none of the noise', () => {
    service.begin(0, 'alice');
    localDispatch('CURSOR_MOVE', [1, 2, 3]);
    expect(service.captured()).toHaveLength(0);
  });

  it('collects nothing until the table is cut off', () => {
    setNetworkIsolated(false);
    service.begin(0, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    expect(service.captured()).toHaveLength(0);
  });

  it('can change whose action it is recorded as', () => {
    service.begin(0, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    service.setActorId('bob');

    expect(service.captured()[0].actorId).toBe('bob');
  });

  it('folds the staging away and hands back what it holds', () => {
    service.begin(3, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });

    expect(service.insertIndex()).toBe(3);
    const taken = service.take();
    expect(taken).toHaveLength(1);
    expect(service.isStaging()).toBe(false);
    expect(service.captured()).toHaveLength(0);
  });

  it('throws its contents away when discarded', () => {
    service.begin(0, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    service.discard();

    expect(service.isStaging()).toBe(false);
    expect(service.captured()).toHaveLength(0);
  });

  it('starts from the board as it was when staging began', () => {
    const character = objectStore.get<GameCharacter>('c1')!;
    character.location.x = 200;
    service.begin(0, 'alice');
    localDispatch('UPDATE_GAME_OBJECT', character.toContext());

    expect(service.captured()).toHaveLength(0);
  });

  it('collects only what changed after that', () => {
    const character = objectStore.get<GameCharacter>('c1')!;
    service.begin(0, 'alice');
    localDispatch('UPDATE_GAME_OBJECT', character.toContext());
    expect(service.captured()).toHaveLength(0);

    character.location.x = 120;
    localDispatch('UPDATE_GAME_OBJECT', character.toContext());
    expect(service.captured()).toHaveLength(1);
    expect(service.captured()[0].detail['to']).toMatchObject({ x: 120 });
  });
});
