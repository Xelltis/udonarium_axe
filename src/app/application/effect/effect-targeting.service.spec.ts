import { TestBed } from '@angular/core/testing';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { Config } from '@axe/domain/peer/config';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { EngagementZone } from '@axe/domain/tabletop/zone/engagement-zone';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectTargetingService', () => {
  let service: EffectTargetingService;
  let selection: SelectionSignalService;
  let preset: EffectPreset;
  let characters: GameCharacter[];

  function makeCharacter(name: string, x: number): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.location.x = x;
    character.location.y = 0;
    return character;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(EffectTargetingService);
    selection = TestBed.inject(SelectionSignalService);

    preset = new EffectPreset();
    preset.targeting = 'multi';
    preset.maxTargets = 3;
    ObjectStore.instance.add(preset, false);

    characters = [makeCharacter('あ', 0), makeCharacter('い', 200), makeCharacter('う', 400), makeCharacter('え', 600)];
  });

  afterEach(() => {
    ObjectStore.instance.remove(preset);
    for (const character of characters) ObjectStore.instance.remove(character);
  });

  it('collects the targets in the order they were chosen', () => {
    service.begin(preset);
    service.pick(characters[1].identifier);
    service.pick(characters[0].identifier);

    expect(service.picks()).toEqual([characters[1].identifier, characters[0].identifier]);
    expect(service.marks().map((mark) => mark.order)).toEqual([1, 2]);
  });

  it('copies the chosen targets onto the piece', () => {
    service.begin(preset);
    service.pick(characters[1].identifier);

    // so that once the choosing is done, the chat shorthand reaches the same targets
    expect(characters[1].targeted).toBe(true);
    expect(characters[0].targeted).toBe(false);
  });

  it('drops a target chosen a second time', () => {
    service.begin(preset);
    service.pick(characters[0].identifier);
    service.pick(characters[1].identifier);
    service.pick(characters[0].identifier);

    expect(service.picks()).toEqual([characters[1].identifier]);
    expect(characters[0].targeted).toBe(false);
  });

  it('casts as soon as the limit is reached', () => {
    service.begin(preset);
    expect(service.pick(characters[0].identifier)).toBeNull();
    expect(service.pick(characters[1].identifier)).toBeNull();

    const cast = service.pick(characters[2].identifier);

    expect(cast?.targets.map((target) => target.identifier)).toEqual([
      characters[0].identifier,
      characters[1].identifier,
      characters[2].identifier,
    ]);
    expect(service.isPicking()).toBe(false);
  });

  it('inherits the targets already named and puts them back when cancelled', () => {
    characters[3].targeted = true;

    service.begin(preset);
    expect(service.picks()).toEqual([characters[3].identifier]);

    service.pick(characters[0].identifier);
    expect(characters[3].targeted).toBe(true);

    service.cancel();

    expect(service.isPicking()).toBe(false);
    expect(characters[3].targeted).toBe(true);
    expect(characters[0].targeted).toBe(false);
  });

  it('remembers the selected piece as the shooter', () => {
    selection.selectObject(characters[3].identifier, characters[3].aliasName);
    service.begin(preset);
    // Choosing moves the selection onto the targets, but the shooter stays as it was at the start.
    service.pick(characters[0].identifier);
    selection.selectObject(characters[0].identifier, characters[0].aliasName);
    const cast = service.confirm();

    expect(cast?.casterIdentifier).toBe(characters[3].identifier);
    expect(cast?.origin).not.toBeNull();
  });

  it('casts nothing when confirmed with no target', () => {
    service.begin(preset);

    expect(service.confirm()).toBeNull();
  });

  it('cancels nothing when not choosing', () => {
    expect(service.cancel()).toBe(false);
  });

  describe('an area attack', () => {
    beforeEach(() => {
      preset.areaRadius = 5;
      preset.maxTargets = 5;
    });

    it('takes everything around the centre, nearest first', () => {
      // The pieces stand 200px apart and a cell is 50px, so a five-cell radius reaches both neighbours.
      service.begin(preset);
      service.pick(characters[1].identifier);

      expect(service.picks()).toEqual([characters[1].identifier, characters[0].identifier, characters[2].identifier]);
      expect(service.areaCenter()).not.toBeNull();
    });

    it('does not cast on gathering a group', () => {
      service.begin(preset);

      // so the caster can see how far it reaches before committing
      expect(service.pick(characters[1].identifier)).toBeNull();
      expect(service.isPicking()).toBe(true);
    });

    it('reaches a piece in an engagement zone where it reaches the centre of the zone', () => {
      preset.areaRadius = 3;
      Config.instance.zoneEnabled = true;
      const table = new GameTable();
      table.width = 30;
      table.height = 30;
      table.gridSize = 50;
      table.initialize();
      const zone = new EngagementZone();
      zone.initialize();
      zone.centre = { x: 360, y: 25 };
      table.appendChild(zone);
      const near = makeCharacter('近', 335);
      const far = makeCharacter('遠', 475);
      far.isNpc = true;
      near.engagementZone = zone.identifier;
      far.engagementZone = zone.identifier;
      characters.push(near, far);

      service.begin(preset);
      service.pick(characters[1].identifier);

      expect(service.picks()).toContain(far.identifier);
      Config.instance.zoneEnabled = null;
      ObjectStore.instance.remove(zone);
      ObjectStore.instance.remove(table);
    });

    it('never reaches a piece taken out of the fight', () => {
      characters[0].offField = '1';
      service.begin(preset);
      service.pick(characters[1].identifier);

      expect(service.picks()).not.toContain(characters[0].identifier);
    });

    it('moves the centre when chosen again', () => {
      service.begin(preset);
      service.pick(characters[1].identifier);
      service.pick(characters[3].identifier);

      expect(service.picks()[0]).toBe(characters[3].identifier);
      expect(service.picks()).not.toContain(characters[0].identifier);
    });
  });
});
