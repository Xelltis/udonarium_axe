import { TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
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

  it('numbers a part picked with its body on its row alone, and marks one picked without its body on the table', () => {
    const [, , body, part] = characters;
    part.ridingOn = body.identifier;
    part.rideSeat = 'part';
    const objectChange = TestBed.inject(ObjectChangeService);
    objectChange.notifyChanged(part.identifier);

    service.begin(preset);
    service.pick(part.identifier);
    expect(service.marks().map((mark) => mark.identifier)).toEqual([part.identifier]);

    service.pick(body.identifier);
    expect([...service.pickOrder()]).toEqual([
      [part.identifier, 1],
      [body.identifier, 2],
    ]);
    expect(service.marks().map((mark) => [mark.identifier, mark.order])).toEqual([[body.identifier, 2]]);
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

  it('casts nothing on filling the limit, and casts once on the confirm that follows', () => {
    const fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
    service.begin(preset);
    service.pick(characters[0].identifier);
    service.pick(characters[1].identifier);
    service.pick(characters[2].identifier);

    expect(fired).not.toHaveBeenCalled();
    expect(service.isPicking()).toBe(true);
    expect(service.picks()).toHaveLength(service.limit());

    const cast = service.confirm();

    expect(fired).toHaveBeenCalledTimes(1);
    expect(cast?.targets.map((target) => target.identifier)).toEqual([
      characters[0].identifier,
      characters[1].identifier,
      characters[2].identifier,
    ]);
    expect(service.isPicking()).toBe(false);
    vi.restoreAllMocks();
  });

  it('casts nothing on the one piece a single-target effect takes being pressed', () => {
    const fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
    preset.targeting = 'single';
    service.begin(preset);

    selection.selectObject(characters[0].identifier, characters[0].aliasName);
    TestBed.tick();

    expect(service.picks()).toEqual([characters[0].identifier]);
    expect(service.isPicking()).toBe(true);
    expect(fired).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('leaves the pieces cast at marked as aimed at once the cast ends the picking', () => {
    service.begin(preset);
    service.pick(characters[0].identifier);
    service.confirm();

    expect(service.isPicking()).toBe(false);
    expect(characters[0].targeted).toBe(true);
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

  describe('the caster', () => {
    it('stays the piece selected at the start however many targets are pressed', () => {
      selection.selectObject(characters[3].identifier, characters[3].aliasName);
      TestBed.tick();
      service.begin(preset);

      for (const target of [characters[0], characters[1]]) {
        selection.selectObject(target.identifier, target.aliasName);
        TestBed.tick();
      }

      expect(service.casterIdentifier()).toBe(characters[3].identifier);
      expect(service.casterMark()?.identifier).toBe(characters[3].identifier);
      expect(service.picks()).toEqual([characters[0].identifier, characters[1].identifier]);
    });

    it('tells which piece an effect chosen now would be cast from', () => {
      expect(service.upcomingCasterIdentifier()).toBe('');

      selection.selectObject(characters[2].identifier, characters[2].aliasName);

      expect(service.upcomingCasterIdentifier()).toBe(characters[2].identifier);
    });

    it('becomes the next piece pressed once asked to change, which is not picked as a target', () => {
      selection.selectObject(characters[3].identifier, characters[3].aliasName);
      TestBed.tick();
      service.begin(preset);
      service.pick(characters[0].identifier);

      service.changeCaster();
      expect(service.isChangingCaster()).toBe(true);
      selection.selectObject(characters[1].identifier, characters[1].aliasName);
      TestBed.tick();

      expect(service.casterIdentifier()).toBe(characters[1].identifier);
      expect(service.isChangingCaster()).toBe(false);
      expect(service.picks()).toEqual([characters[0].identifier]);
      expect(characters[1].targeted).toBe(false);

      selection.selectObject(characters[2].identifier, characters[2].aliasName);
      TestBed.tick();
      expect(service.casterIdentifier()).toBe(characters[1].identifier);
      expect(service.picks()).toEqual([characters[0].identifier, characters[2].identifier]);
    });

    it('is taken out of the picks when it was a target', () => {
      service.begin(preset);
      service.pick(characters[0].identifier);
      service.pick(characters[1].identifier);

      service.changeCaster();
      selection.selectObject(characters[0].identifier, characters[0].aliasName);
      TestBed.tick();

      expect(service.casterIdentifier()).toBe(characters[0].identifier);
      expect(service.picks()).toEqual([characters[1].identifier]);
      expect(characters[0].targeted).toBe(false);
      expect(service.confirm()?.casterIdentifier).toBe(characters[0].identifier);
    });

    it('can be set to none, which casts from nowhere', () => {
      selection.selectObject(characters[3].identifier, characters[3].aliasName);
      TestBed.tick();
      service.begin(preset);
      service.pick(characters[0].identifier);

      expect(service.setCaster('')).toBe(true);

      expect(service.casterIdentifier()).toBe('');
      expect(service.casterMark()).toBeNull();
      const cast = service.confirm();
      expect(cast?.casterIdentifier).toBe('');
      expect(cast?.origin).toBeNull();
    });

    it('stops waiting for a piece when the change is called off, the next press picking a target again', () => {
      service.begin(preset);
      service.changeCaster();
      service.changeCaster(false);

      selection.selectObject(characters[0].identifier, characters[0].aliasName);
      TestBed.tick();

      expect(service.casterIdentifier()).toBe('');
      expect(service.picks()).toEqual([characters[0].identifier]);
    });

    it('is left as it was by an identifier that names no piece, and by a change asked for while nothing is held ready', () => {
      service.changeCaster();
      expect(service.isChangingCaster()).toBe(false);
      expect(service.setCaster(characters[0].identifier)).toBe(false);

      selection.selectObject(characters[3].identifier, characters[3].aliasName);
      TestBed.tick();
      service.begin(preset);
      expect(service.setCaster('no-such-piece')).toBe(false);
      expect(service.casterIdentifier()).toBe(characters[3].identifier);
    });

    it('is not waited for any longer once the picking ends', () => {
      service.begin(preset);
      service.changeCaster();
      service.cancel();
      expect(service.isChangingCaster()).toBe(false);

      service.begin(preset);
      expect(service.isChangingCaster()).toBe(false);
    });
  });

  describe('an effect cast on oneself', () => {
    beforeEach(() => {
      preset.targeting = 'self';
    });

    it('is held ready with the caster picked, and cast only on the confirm', () => {
      const fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
      selection.selectObject(characters[2].identifier, characters[2].aliasName);
      TestBed.tick();

      service.begin(preset);
      TestBed.tick();

      expect(service.isPicking()).toBe(true);
      expect(service.picks()).toEqual([characters[2].identifier]);
      expect(fired).not.toHaveBeenCalled();

      const cast = service.confirm();
      expect(cast?.targets.map((target) => target.identifier)).toEqual([characters[2].identifier]);
      vi.restoreAllMocks();
    });

    it('is cast at a piece already aimed at rather than at the caster', () => {
      characters[0].targeted = true;
      selection.selectObject(characters[2].identifier, characters[2].aliasName);
      TestBed.tick();

      service.begin(preset);

      expect(service.picks()).toEqual([characters[0].identifier]);
    });

    it('leaves the marks of aim as they were before it was held ready once cast', () => {
      characters[0].targeted = true;
      service.begin(preset);
      service.pick(characters[1].identifier);
      expect(characters[1].targeted).toBe(true);

      service.confirm();

      expect(characters.map((character) => character.targeted)).toEqual([true, false, false, false]);
    });

    it('picks nothing when no piece is selected or aimed at', () => {
      service.begin(preset);

      expect(service.picks()).toEqual([]);
      expect(service.confirm()).toBeNull();
    });
  });

  it('casts nothing for a seat made a guest while it aimed, calling the aiming off', () => {
    PeerCursor.createMyCursor();
    const fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
    service.begin(preset);
    service.pick(characters[0].identifier);

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.tick();
    expect(service.isPicking()).toBe(false);

    service.begin(preset);
    service.pick(characters[0].identifier);
    expect(service.confirm()).toBeNull();
    expect(fired).not.toHaveBeenCalled();
    vi.restoreAllMocks();
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

    it('strikes a piece this reader cannot see without marking it, numbering the marks among those shown', () => {
      vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation(
        (character) => character !== characters[0]
      );
      service.begin(preset);
      service.pick(characters[1].identifier);

      expect(service.picks()).toContain(characters[0].identifier);
      expect(service.marks().map((mark) => [mark.identifier, mark.order])).toEqual([
        [characters[1].identifier, 1],
        [characters[2].identifier, 2],
      ]);
      // Nor marked as aimed at, which the chat's aimed lines and the next aim would read.
      expect(characters[0].targeted).toBe(false);
      expect(characters[1].targeted).toBe(true);
      service.cancel();
      characters[0].targeted = true;
      service.begin(preset);
      expect(service.picks()).not.toContain(characters[0].identifier);
      vi.restoreAllMocks();
    });

    it('puts back on cancel a piece aimed at before the picking that this reader can no longer see', () => {
      characters[0].targeted = true;
      vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation(
        (character) => character !== characters[0]
      );
      service.begin(preset);
      expect(service.picks()).not.toContain(characters[0].identifier);
      service.pick(characters[1].identifier);
      expect(characters[0].targeted).toBe(false);

      service.cancel();

      expect(characters[0].targeted).toBe(true);
      expect(characters[1].targeted).toBe(false);
      characters[0].targeted = false;
      vi.restoreAllMocks();
    });

    it('does not cast on gathering a group', () => {
      service.begin(preset);

      // so the caster can see how far it reaches before committing
      service.pick(characters[1].identifier);
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
