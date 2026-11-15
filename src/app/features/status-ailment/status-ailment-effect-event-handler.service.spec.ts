import { TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { emitStatusAilmentPlanted } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { plantStatusAilment } from '@axe/domain/character/status-ailment-plant';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { StatusAilmentEffectEventHandlerService } from '@axe/features/status-ailment/status-ailment-effect-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StatusAilmentEffectEventHandlerService', () => {
  let castStub: { fire: ReturnType<typeof vi.fn> };
  let sleep: EffectPreset;
  let piece: GameCharacter;

  /** Lets what was put on in one go be cast, as it is once the code that put it on has run. */
  const settled = () => Promise.resolve();

  function presetNamed(name: string, fields: Partial<EffectPreset> = {}): EffectPreset {
    const preset = new EffectPreset();
    preset.name = name;
    preset.kind = 'curse';
    Object.assign(preset, fields);
    preset.initialize();
    return preset;
  }

  function pieceNamed(name: string): GameCharacter {
    const made = GameCharacter.create(name, 1, '');
    made.location.name = 'table';
    return made;
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    castStub = { fire: vi.fn() };
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(EffectCastService, { useValue: castStub });
    TestBed.inject(StatusAilmentEffectEventHandlerService);
    sleep = presetNamed('睡眠', { targeting: 'multi', maxTargets: 2 });
    piece = pieceNamed('盗賊');
    StatusAilmentCatalog.instance.ailments = [newStatusAilment('睡眠'), newStatusAilment('毒')];
    StatusAilmentCatalog.instance.playsEffectOnPlant = true;
  });

  afterEach(() => {
    StatusAilmentCatalog.instance.playsEffectOnPlant = false;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
    StatusAilmentCatalog.forget();
    PeerCursor.myCursor = null!;
  });

  it('casts the effect of the same name over the piece a state is put on, once and from nobody', async () => {
    plantStatusAilment(piece, newStatusAilment('睡眠'));
    await settled();

    expect(castStub.fire).toHaveBeenCalledTimes(1);
    expect(castStub.fire).toHaveBeenCalledWith(sleep, [piece], null);
  });

  it('casts nothing while the room has not asked for it', async () => {
    StatusAilmentCatalog.instance.playsEffectOnPlant = false;

    plantStatusAilment(piece, newStatusAilment('睡眠'));
    await settled();

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  it('casts nothing for a state with no effect of its name in the room', async () => {
    plantStatusAilment(piece, newStatusAilment('毒'));
    await settled();

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  it('casts nothing as a state is taken off', async () => {
    const service = TestBed.inject(StatusAilmentService);
    service.plant(piece, newStatusAilment('睡眠'));
    await settled();
    castStub.fire.mockClear();

    service.pull(piece, '睡眠');
    applyBuffEdit({ command: '&睡眠-', object: piece, targeted: false }, piece);
    await settled();

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  it('casts for a state put on by a buff command naming it, as for one ticked on', async () => {
    applyBuffEdit({ command: '&睡眠', object: piece, targeted: false }, piece);
    await settled();

    expect(castStub.fire).toHaveBeenCalledTimes(1);
    expect(castStub.fire).toHaveBeenCalledWith(sleep, [piece], null);
  });

  it('casts once over all the pieces a state is put on in one go, as many at a time as the effect takes', async () => {
    const others = [pieceNamed('騎士'), pieceNamed('弓使い')];

    for (const each of [piece, ...others]) plantStatusAilment(each, newStatusAilment('睡眠'));
    await settled();

    expect(castStub.fire.mock.calls.map(([, targets]) => targets)).toEqual([[piece, others[0]], [others[1]]]);
  });

  it('casts once over a piece the same state is put on twice in one go', async () => {
    plantStatusAilment(piece, newStatusAilment('睡眠'));
    plantStatusAilment(piece, newStatusAilment('睡眠'));
    await settled();

    expect(castStub.fire).toHaveBeenCalledTimes(1);
    expect(castStub.fire.mock.calls[0][1]).toEqual([piece]);
  });

  it('casts again each time the state is put on anew', async () => {
    plantStatusAilment(piece, newStatusAilment('睡眠'));
    await settled();
    plantStatusAilment(piece, newStatusAilment('睡眠'));
    await settled();

    expect(castStub.fire).toHaveBeenCalledTimes(2);
  });

  it('casts nothing over a piece that is not on the table, nor for one that is gone', async () => {
    piece.location.name = 'common';
    plantStatusAilment(piece, newStatusAilment('睡眠'));
    emitStatusAilmentPlanted({ characterIdentifier: 'nobody', name: '睡眠' });
    await settled();

    expect(castStub.fire).not.toHaveBeenCalled();
  });

  it('keeps an effect meant for the game master from one who is not', async () => {
    sleep.gmOnly = true;

    plantStatusAilment(piece, newStatusAilment('睡眠'));
    await settled();

    expect(castStub.fire).not.toHaveBeenCalled();
  });
});
