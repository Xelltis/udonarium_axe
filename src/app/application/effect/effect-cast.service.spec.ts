import { TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { PiecePlaceService } from '@axe/application/tabletop/piece-place.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectCastService', () => {
  let play: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    play = vi.fn();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(EffectPlaybackService, { useValue: { play } });
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('casts from where the shooter stands at where each target stands, as the page reads them on a wall too', () => {
    const shooter = GameCharacter.create('射手', 1, '');
    const target = GameCharacter.create('的', 1, '');
    vi.spyOn(TestBed.inject(PiecePlaceService), 'standingCentreOf').mockImplementation((piece) =>
      piece === shooter ? { x: 975, y: 975, z: 450 } : { x: 125, y: 125, z: 0 }
    );
    const preset = new EffectPreset();
    preset.initialize();

    const cast = TestBed.inject(EffectCastService).playHere(preset, [target], shooter)!;

    expect(cast.targets).toEqual([{ identifier: target.identifier, x: 125, y: 125, z: 0 }]);
    expect(cast.origin).toEqual({ x: 975, y: 975, z: 450 + 50 * 0.6 });
  });
});
