import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { EffectTargetOverlayComponent } from '@axe/features/effect/effect-target-overlay/effect-target-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectTargetOverlayComponent', () => {
  let fixture: ComponentFixture<EffectTargetOverlayComponent>;
  let targeting: EffectTargetingService;
  let preset: EffectPreset;
  let characters: GameCharacter[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffectTargetOverlayComponent],
      providers: [...TEST_PROVIDERS],
    });
    fixture = TestBed.createComponent(EffectTargetOverlayComponent);
    targeting = TestBed.inject(EffectTargetingService);

    preset = new EffectPreset();
    preset.targeting = 'multi';
    preset.maxTargets = 3;
    ObjectStore.instance.add(preset, false);

    characters = [0, 200, 400].map((x, index) => {
      const character = GameCharacter.create(`char${index}`, 1, '');
      character.location.x = x;
      character.location.y = 0;
      return character;
    });
  });

  afterEach(() => {
    ObjectStore.instance.remove(preset);
    for (const character of characters) ObjectStore.instance.remove(character);
  });

  function elements(): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('div'));
  }

  it('draws nothing while nothing is being aimed', () => {
    fixture.detectChanges();

    expect(elements()).toHaveLength(0);
  });

  it('numbers the targets in the order they were chosen', () => {
    targeting.begin(preset);
    targeting.pick(characters[1].identifier);
    targeting.pick(characters[0].identifier);
    fixture.detectChanges();

    const badges = elements().filter((element) => element.textContent?.trim().length);
    expect(badges.map((badge) => badge.textContent?.trim())).toEqual(['1', '2']);
  });

  it('marks the targets without their numbers where it is asked to leave the badges off', () => {
    fixture.componentRef.setInput('badges', false);
    targeting.begin(preset);
    targeting.pick(characters[1].identifier);
    targeting.pick(characters[0].identifier);
    fixture.detectChanges();

    expect(elements()).toHaveLength(2);
    expect(elements().filter((element) => element.textContent?.trim().length)).toEqual([]);
  });

  it('draws the line only once there is a caster', () => {
    targeting.begin(preset);
    targeting.pick(characters[1].identifier);
    fixture.detectChanges();

    // Without one there are marks and numbers alone.
    expect(elements()).toHaveLength(2);
    expect(component().links()).toHaveLength(0);

    targeting.cancel();
    TestBed.inject(SelectionSignalService).selectObject(characters[0].identifier, characters[0].aliasName);
    targeting.begin(preset);
    targeting.pick(characters[1].identifier);
    fixture.detectChanges();

    expect(component().links()).toHaveLength(1);
    expect(elements()).toHaveLength(3);
  });

  function component(): EffectTargetOverlayComponent {
    return fixture.componentInstance;
  }
});
