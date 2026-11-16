import { ComponentFixture, TestBed } from '@angular/core/testing';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import { GameCharacter } from '@axe/domain/character/game-character';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { VISION_SHAPE_DEFAULTS, VisionShape } from '@axe/domain/tabletop/vision-shape';
import { LIGHT_PRESETS, LightPreset } from '@axe/domain/tabletop/vision-types';
import { LightSettingsComponent } from '@axe/features/light-settings/light-settings.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('LightSettingsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LightSettingsComponent], providers: [...TEST_PROVIDERS] });
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(LightSettingsComponent));
  });

  describe('the light it sets', () => {
    let fixture: ComponentFixture<LightSettingsComponent>;
    let component: LightSettingsComponent;
    let light: LightSource;

    function host(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function field(name: string): HTMLInputElement | null {
      return host().querySelector<HTMLInputElement>(`[name="${name}"]`);
    }

    beforeEach(() => {
      light = LightSource.create('lantern');
      fixture = TestBed.createComponent(LightSettingsComponent);
      component = fixture.componentInstance;
    });

    afterEach(() => light.destroy());

    it('shows nothing until it is given what to set, and then shows it without being asked to redraw', async () => {
      await fixture.whenStable();
      expect(field('lightEnabled')).toBeNull();

      component.target = light;
      await fixture.whenStable();

      expect(field('lightEnabled')).not.toBeNull();
      expect(field('lightCategory')).toBeNull();
      expect(field('visionType')).toBeNull();
    });

    it('shows the settings only a light source has, and the sight, once each is asked for', async () => {
      component.target = light;
      await fixture.whenStable();

      component.advanced = true;
      component.showVision = true;
      await fixture.whenStable();

      expect(field('lightCategory')).not.toBeNull();
      expect(field('visionType')).not.toBeNull();
    });

    it('leaves the light out for a reader setting sight alone', async () => {
      component.target = light;
      component.showVision = true;
      component.showLight = false;
      await fixture.whenStable();

      expect(field('visionType')).not.toBeNull();
      expect(field('lightEnabled')).toBeNull();
    });

    it('follows a radius changed at another seat', async () => {
      component.target = light;
      await fixture.whenStable();
      expect(host().textContent).not.toContain('27');

      light.lightBrightRadius = 27;
      await waitZeroTimeout();
      await fixture.whenStable();

      expect(host().textContent).toContain('27');
    });

    it('gives the light what a preset holds, turns it on and tells the room', () => {
      const preset = Object.values(LightPreset).find((value) => value !== LightPreset.CUSTOM)!;
      const told = vi.spyOn(light, 'update');
      light.lightEnabled = false;
      component.target = light;

      component.onPreset(preset);

      const held = LIGHT_PRESETS[preset as Exclude<LightPreset, LightPreset.CUSTOM>];
      expect([light.lightPreset, light.lightBrightRadius, light.lightDimRadius, light.lightColor]).toEqual([
        preset,
        held.brightRadius,
        held.dimRadius,
        held.color,
      ]);
      expect(light.lightEnabled).toBe(true);
      expect(told).toHaveBeenCalled();
    });

    it('does nothing with a preset or a shape while it has nothing to set', () => {
      expect(() => {
        component.onPreset(LightPreset.CUSTOM);
        component.onVisionShape(VisionShape.CONE);
      }).not.toThrow();
    });
  });

  describe('the sight it sets', () => {
    let fixture: ComponentFixture<LightSettingsComponent>;
    let component: LightSettingsComponent;
    let character: GameCharacter;

    function field(name: string): HTMLInputElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`[name="${name}"]`);
    }

    beforeEach(() => {
      character = GameCharacter.create('見張り', 1, '');
      fixture = TestBed.createComponent(LightSettingsComponent);
      component = fixture.componentInstance;
      component.target = character;
      component.showVision = true;
    });

    afterEach(() => character.destroy());

    it('gives the piece the shape chosen with what that shape starts from, and tells the room', () => {
      const told = vi.spyOn(character, 'update');
      character.visionConeAngle = 33;

      component.onVisionShape(VisionShape.CONE_MULTI);

      const starts = VISION_SHAPE_DEFAULTS[VisionShape.CONE_MULTI];
      expect([character.visionShape, character.visionConeAngle, character.visionConeCount]).toEqual([
        VisionShape.CONE_MULTI,
        starts.coneAngle,
        starts.coneCount,
      ]);
      expect(component.visionShape).toBe(VisionShape.CONE_MULTI);
      expect(told).toHaveBeenCalled();
    });

    it('reads a shape it does not know as the one a piece starts with', () => {
      character.visionShape = 'no-such-shape';

      expect(component.visionShape).toBe(VisionShape.DOME);
    });

    it('offers the fields of the shape in hand, and those of another once the shape is changed at another seat', async () => {
      character.visionShape = VisionShape.DOME;
      await fixture.whenStable();
      expect(field('visionConeAngle')).toBeNull();
      expect(field('visionConeCount')).toBeNull();

      character.visionShape = VisionShape.CONE_MULTI;
      await waitZeroTimeout();
      await fixture.whenStable();

      expect(field('visionConeAngle')).not.toBeNull();
      expect(field('visionConeCount')).not.toBeNull();
      expect(field('visionBackAngle')).toBeNull();
    });
  });
});
