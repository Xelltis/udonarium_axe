import { DestroyRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { resourceChange$ } from '@axe/core/event/domain-events';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ResourceChange } from '@axe/domain/character/resource-change';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import {
  PieceResourceChanges,
  PieceResourceChangesHost,
} from '@axe/features/character/game-character/piece-resource-changes';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PieceResourceChanges', () => {
  const made: GameCharacter[] = [];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.spyOn(SoundEffect, 'playLocal').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const character of made.splice(0)) character.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function pieceWith(name: string, attributes: Record<string, string> = {}) {
    const character = GameCharacter.create(name, 1, '');
    made.push(character);
    const resource = DataElement.create('気力', 10, {
      type: DataElementType.NUMBER_RESOURCE,
      currentValue: 10,
      ...attributes,
    });
    character.detailDataElement!.appendChild(resource);
    return { character, resource };
  }

  function setup(character: GameCharacter | null, parts: GameCharacter[] = []) {
    const shown = signal<GameCharacter | null>(character);
    const version = signal(0);
    const localChanges = new Map<string, number>();
    const playEffects = vi.fn<PieceResourceChangesHost['playEffects']>();
    const host: PieceResourceChangesHost = {
      character: shown,
      partsOf: () => parts,
      followedTree: (root) => {
        version();
        return root ? collectDataElements(root) : null;
      },
      localChangeCountOf: (identifier) => localChanges.get(identifier) ?? 0,
      partNameOf: (identifier) => `部位:${parts.find((part) => part.identifier === identifier)?.name ?? ''}`,
      playEffects,
      destroyRef: TestBed.inject(DestroyRef),
    };
    const changes = TestBed.runInInjectionContext(() => new PieceResourceChanges(host));
    TestBed.tick();

    /** Moves a resource as this end or as a sync would, and lets the display catch up. */
    const move = (resource: DataElement, to: number, bySelf = true) => {
      resource.currentValue = to;
      if (bySelf) localChanges.set(resource.identifier, (localChanges.get(resource.identifier) ?? 0) + 1);
      version.update((now) => now + 1);
      TestBed.tick();
    };
    return { changes, move, playEffects, shown };
  }

  const labels = (changes: PieceResourceChanges) => changes.floating().map((change) => change.label);

  it('holds the resources of the piece and of its parts as they stand', () => {
    const { character, resource } = pieceWith('本体');
    const { character: part, resource: partResource } = pieceWith('腕');
    partResource.currentValue = 4;

    const { changes } = setup(character, [part]);

    expect(changes.snapshot().get(resource.identifier)).toMatchObject({ current: 10, max: 10 });
    expect(changes.snapshot().get(partResource.identifier)).toMatchObject({ current: 4, max: 10 });
  });

  it('holds nothing before a piece is bound', () => {
    expect(setup(null).changes.snapshot().size).toBe(0);
  });

  it('floats a change this end made over the piece, with the flash of a hit or of a heal', () => {
    const { character, resource } = pieceWith('本体');
    const { changes, move } = setup(character);

    move(resource, 7);
    expect(labels(changes)).toEqual(['-3']);
    expect(changes.hitFlash()).toBe('damage');

    move(resource, 9);
    expect(labels(changes)).toEqual(['-3', '+2']);
    expect(changes.hitFlash()).toBe('heal');
  });

  it('draws nothing for a value replaced by a load or a sync', () => {
    const { character, resource } = pieceWith('本体');
    const { changes, move } = setup(character);

    move(resource, 2, false);

    expect(changes.floating()).toEqual([]);
    expect(changes.hitFlash()).toBeNull();
  });

  it('shows a change to a part on the body, under the name of the part', () => {
    const { character } = pieceWith('本体');
    const { character: part, resource: partResource } = pieceWith('腕');
    const { changes, move } = setup(character, [part]);

    move(partResource, 5);

    expect(labels(changes)).toEqual(['部位:腕 -5']);
  });

  it('plays the sound and the effects only for the resources that ask for them', () => {
    const { character, resource } = pieceWith('本体');
    const loud = DataElement.create('装甲', 10, {
      type: DataElementType.NUMBER_RESOURCE,
      currentValue: 10,
      [DataElementAttribute.CHANGE_SOUND]: 'true',
      [DataElementAttribute.CHANGE_EFFECT]: 'true',
      [DataElementAttribute.CHANGE_SOUND_SET]: 'mech',
    });
    character.detailDataElement!.appendChild(loud);
    const { move, playEffects } = setup(character);

    move(resource, 9);
    expect(SoundEffect.playLocal).not.toHaveBeenCalled();
    expect(playEffects).not.toHaveBeenCalled();

    move(loud, 1);
    expect(SoundEffect.playLocal).toHaveBeenCalledWith(PresetSound.mechDamageLarge, expect.anything());
    expect(playEffects).toHaveBeenCalledTimes(1);
    expect(playEffects.mock.calls[0][0]).toBe(character);
    expect(playEffects.mock.calls[0][1].map((change) => change.identifier)).toEqual([loud.identifier]);
  });

  it('draws a change another end made on word from it, and not its own word or one for another piece', () => {
    const { character, resource } = pieceWith('本体');
    const { changes } = setup(character);
    const change: ResourceChange = {
      identifier: resource.identifier,
      name: '気力',
      kind: 'heal',
      delta: 2,
      label: '+2',
      ratio: 0.2,
      playsEffect: false,
      playsSound: false,
      soundSet: 'flesh',
    };

    resourceChange$.emit({ characterIdentifier: character.identifier, changes: [change], emittedBy: 'another-peer' });
    expect(labels(changes)).toEqual(['+2']);

    resourceChange$.emit({
      characterIdentifier: character.identifier,
      changes: [change],
      emittedBy: getPeerContext().peerId,
    });
    resourceChange$.emit({ characterIdentifier: 'another-piece', changes: [change], emittedBy: 'another-peer' });
    expect(labels(changes)).toEqual(['+2']);
  });

  it('keeps the six newest changes, and takes each away a little after it was drawn', () => {
    vi.useFakeTimers();
    const { character, resource } = pieceWith('本体');
    const { changes, move } = setup(character);

    for (let value = 9; value >= 3; value--) move(resource, value);
    expect(changes.floating()).toHaveLength(6);

    vi.advanceTimersByTime(1299);
    expect(changes.floating()).toHaveLength(6);
    vi.advanceTimersByTime(1);
    expect(changes.floating()).toEqual([]);
    expect(changes.hitFlash()).toBeNull();
  });
});
