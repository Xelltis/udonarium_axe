import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { DEFAULT_TABLE_CAMERA_VIEW } from '@axe/domain/tabletop/camera/table-camera';
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

  it('lays a mark flat where the canvas draws the floor, and stands its number facing the screen', () => {
    const camera = TestBed.inject(TableCameraService);
    camera.setLayout({ left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 750 });
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    targeting.begin(preset);
    targeting.pick(characters[1].identifier);
    fixture.detectChanges();

    const [mark, badge] = elements();
    expect(mark.style.transform).toMatch(/^matrix3d\(/);
    expect(badge.style.transform).toMatch(
      /^translate\([-\d.]+px, [-\d.]+px\) scale\([\d.]+\) translate\(-50%, -50%\)$/
    );
    expect(badge.textContent?.trim()).toBe('1');
  });

  it('hides what it cannot lay before the camera is set', () => {
    targeting.begin(preset);
    targeting.pick(characters[1].identifier);
    fixture.detectChanges();

    expect(elements().map((element) => element.style.display)).toEqual(['none', 'none']);
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
    expect(elements()).toHaveLength(4);
  });

  describe('the mark of the caster', () => {
    function casterMark(): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="effect-caster-mark"]');
    }

    function targetMark(): HTMLElement {
      return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="effect-target-mark"]')!;
    }

    function aimFrom(caster: GameCharacter): void {
      const selection = TestBed.inject(SelectionSignalService);
      selection.selectObject(caster.identifier, caster.aliasName);
      TestBed.tick();
      targeting.begin(preset);
    }

    it('lies under the caster from the start of the aiming, before any target is picked', () => {
      const camera = TestBed.inject(TableCameraService);
      camera.setLayout({ left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 750 });
      camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
      aimFrom(characters[0]);
      fixture.detectChanges();

      expect(casterMark()?.style.transform).toMatch(/^matrix3d\(/);
      expect(component().marks()).toHaveLength(0);
    });

    it('differs from the ring of a target in shape and in colour', () => {
      aimFrom(characters[0]);
      targeting.pick(characters[1].identifier);
      fixture.detectChanges();

      const caster = casterMark()!;
      const target = targetMark();
      expect(target.style.borderRadius).toBe('50%');
      expect(caster.style.borderRadius).toBe('');
      expect(caster.style.borderStyle).toBe('double');
      expect(target.style.borderStyle).toBe('solid');
      expect(caster.style.borderColor).not.toBe(target.style.borderColor);
    });

    it('lays no board under the caster, which would dim the table', () => {
      aimFrom(characters[0]);
      fixture.detectChanges();

      expect(casterMark()!.style.background).toBe('');
      expect(casterMark()!.style.backgroundColor).toBe('');
    });

    it('moves to the piece the caster is changed to, and goes when there is none', () => {
      aimFrom(characters[0]);
      fixture.detectChanges();
      expect(component().caster()?.identifier).toBe(characters[0].identifier);

      targeting.setCaster(characters[2].identifier);
      fixture.detectChanges();
      expect(component().caster()?.identifier).toBe(characters[2].identifier);

      targeting.setCaster('');
      fixture.detectChanges();
      expect(casterMark()).toBeNull();
    });

    it('is left off where it is asked to be', () => {
      fixture.componentRef.setInput('casterRing', false);
      aimFrom(characters[0]);
      fixture.detectChanges();

      expect(casterMark()).toBeNull();
    });
  });

  describe('what an area attack would take in', () => {
    let canHover: WritableSignal<boolean>;

    function byTestId(testId: string): HTMLElement[] {
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`));
    }

    beforeEach(() => {
      canHover = (TestBed.inject(ViewportService) as unknown as { _canHover: WritableSignal<boolean> })._canHover;
      canHover.set(true);
      preset.areaRadius = 5;
      const camera = TestBed.inject(TableCameraService);
      camera.setLayout({ left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 750 });
      camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    });

    afterEach(() => {
      for (const character of characters) targeting.hoverPiece(character.identifier, false);
      canHover.set(false);
      targeting.cancel();
    });

    it('is drawn round the piece under the pointer before the centre is pressed, as wide as the area and in lines alone', () => {
      targeting.begin(preset);
      fixture.detectChanges();
      expect(byTestId('effect-area-prospect')).toHaveLength(0);

      targeting.hoverPiece(characters[0].identifier, true);
      fixture.detectChanges();

      const [area] = byTestId('effect-area-prospect');
      expect(area.style.width).toBe(`${targeting.areaRadius() * 2}px`);
      expect(area.style.transform).toMatch(/^matrix3d\(/);
      expect(area.style.borderRadius).toBe('50%');
      expect(area.style.background).toBe('');
      expect(area.style.backgroundColor).toBe('');
      // The piece 200px off is within the five cells of 50px; the one 400px off is not.
      expect(byTestId('effect-prospect-mark')).toHaveLength(2);
      for (const mark of byTestId('effect-prospect-mark')) expect(mark.style.background).toBe('');
      expect(byTestId('effect-target-mark')).toHaveLength(0);
    });

    it('gives way to the settled area once the piece is pressed', () => {
      targeting.begin(preset);
      targeting.hoverPiece(characters[0].identifier, true);
      targeting.pick(characters[0].identifier);
      fixture.detectChanges();

      expect(byTestId('effect-area-prospect')).toHaveLength(0);
      expect(byTestId('effect-prospect-mark')).toHaveLength(0);
      expect(byTestId('effect-target-mark')).toHaveLength(2);
    });
  });

  function component(): EffectTargetOverlayComponent {
    return fixture.componentInstance;
  }
});
