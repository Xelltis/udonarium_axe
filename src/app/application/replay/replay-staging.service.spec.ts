import { TestBed } from '@angular/core/testing';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
import type { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { GM_ONLY_VISIBILITY, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function context(identifier: string, aliasName: string, attributes: Record<string, unknown>): ObjectContext {
  return { identifier, aliasName, majorVersion: 1, minorVersion: 0.5, syncData: { value: '', attributes } };
}

function sendUpdate(identifier: string, attributes: Record<string, unknown>): void {
  localDispatch('UPDATE_GAME_OBJECT', context(identifier, 'character', attributes));
}

/** Lets what this reader just did be taken in, as it is once the action is over. */
const settled = () => Promise.resolve();

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

  it('collects nothing before staging begins', async () => {
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    await settled();
    expect(service.captured()).toHaveLength(0);
  });

  it('collects a table action as a line to insert', async () => {
    service.begin(2, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    await settled();

    const [event] = service.captured();
    expect(event.kind).toBe(ReplayEventKind.ObjectMove);
    expect(event.actorId).toBe('alice');
    expect(event.patch?.identifier).toBe('c1');
  });

  it('folds a run of actions into one', async () => {
    service.begin(0, 'alice');
    for (let x = 10; x <= 50; x += 10) sendUpdate('c1', { location: { name: 'table', x, y: 0 } });
    await settled();

    expect(service.captured()).toHaveLength(1);
    expect(service.captured()[0].detail['to']).toMatchObject({ x: 50 });
  });

  it('collects the cues in a form that can sound again', async () => {
    service.begin(0, 'alice');
    localDispatch('SOUND_EFFECT', 'se-dice');
    await settled();

    const [event] = service.captured();
    expect(event.kind).toBe(ReplayEventKind.MediaSoundEffect);
    expect(event.signal).toEqual({ name: 'SOUND_EFFECT', data: 'se-dice' });
  });

  it('collects nothing from the others at the table', async () => {
    service.begin(0, 'alice');
    localDispatch(
      'UPDATE_GAME_OBJECT',
      context('c1', 'character', { location: { name: 'table', x: 50, y: 0 } }),
      'peer-b'
    );
    localDispatch('SOUND_EFFECT', 'se-dice', 'peer-b');
    await settled();

    expect(service.captured()).toHaveLength(0);
  });

  it('collects none of the noise', async () => {
    service.begin(0, 'alice');
    localDispatch('CURSOR_MOVE', [1, 2, 3]);
    await settled();
    expect(service.captured()).toHaveLength(0);
  });

  it('collects nothing until the table is cut off', async () => {
    setNetworkIsolated(false);
    service.begin(0, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    await settled();
    expect(service.captured()).toHaveLength(0);
  });

  it('can change whose action it is recorded as', async () => {
    service.begin(0, 'alice');
    sendUpdate('c1', { location: { name: 'table', x: 50, y: 0 } });
    await settled();
    service.setActorId('bob');

    expect(service.captured()[0].actorId).toBe('bob');
  });

  it('takes a piece brought in with its parts as one arrival, and taking it away as one removal', async () => {
    service.begin(1, 'alice');
    const hero = GameCharacter.create('勇者', 1, '');
    await settled();

    expect(service.captured().map((event) => event.kind)).toEqual([ReplayEventKind.ObjectCreate]);
    const [arrival] = service.captured();
    expect(arrival.targetId).toBe(hero.identifier);
    expect(arrival.parts?.length).toBeGreaterThan(0);

    hero.destroy();
    await settled();

    expect(service.captured().map((event) => event.kind)).toEqual([
      ReplayEventKind.ObjectCreate,
      ReplayEventKind.ObjectRemove,
    ]);
    expect(service.captured()[1].removedParts?.length).toBeGreaterThan(0);
  });

  it('names a piece brought in by what it is called when the scene is taken, and its parts as its own', async () => {
    service.begin(1, 'alice');
    const hero = GameCharacter.create('勇者', 1, '');
    await settled();
    hero.name = '勇者アルス';
    await settled();

    const targets = service.stagedTargets();
    expect(targets.find((target) => target.identifier === hero.identifier)).toEqual({
      identifier: hero.identifier,
      aliasName: hero.aliasName,
      name: '勇者アルス',
      sinceSeq: 0,
    });
    const part = targets.find((target) => target.ownerIdentifier === hero.identifier);
    expect(part?.aliasName).toBe(DataElement.aliasName);
  });

  it('names a piece taken away that was on the board before capturing began', async () => {
    const goblin = GameCharacter.create('ゴブリン', 1, '');
    service.begin(1, 'alice');

    goblin.destroy();
    await settled();

    expect(service.stagedTargets().find((target) => target.identifier === goblin.identifier)?.name).toBe('ゴブリン');
  });

  it('keeps a change to a part of a piece kept to the GM as the piece is kept', async () => {
    const boss = GameCharacter.create('ボス', 1, '');
    boss.disclosureMode = DisclosureMode.GameMaster;
    const part = boss.commonDataElement!.children[0] as DataElement;
    service.begin(1, 'gm');

    part.value = '隠し名';
    await settled();

    expect(service.captured().map((event) => event.visibility)).toEqual([GM_ONLY_VISIBILITY]);
  });

  it('keeps the removal of a piece shown to some as it was shown', async () => {
    const scout = GameCharacter.create('斥候', 1, '');
    scout.disclosureMode = DisclosureMode.Selected;
    scout.disclosureUserIds = ['bob'];
    service.begin(1, 'gm');

    scout.destroy();
    await settled();

    expect(service.captured().map((event) => [event.kind, event.visibility])).toEqual([
      [ReplayEventKind.ObjectRemove, { kind: 'direct', to: ['bob'] }],
    ]);
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

  it('collects only what changed after that', async () => {
    const character = objectStore.get<GameCharacter>('c1')!;
    service.begin(0, 'alice');
    localDispatch('UPDATE_GAME_OBJECT', character.toContext());
    await settled();
    expect(service.captured()).toHaveLength(0);

    character.location.x = 120;
    localDispatch('UPDATE_GAME_OBJECT', character.toContext());
    await settled();
    expect(service.captured()).toHaveLength(1);
    expect(service.captured()[0].detail['to']).toMatchObject({ x: 120 });
  });
});
